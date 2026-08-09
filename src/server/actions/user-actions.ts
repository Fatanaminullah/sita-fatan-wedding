'use server'

import { revalidatePath } from 'next/cache'
import { checkUsername } from '@/domain/username'
import { buildDiff } from '@/domain/audit'
import { getAdminSupabase } from '../supabase/admin-client'
import { getServerSupabase } from '../supabase/server-client'
import { insertAuditLog } from '../repositories/audit-log-repository'
import { getCurrentProfile } from './auth-actions'

/**
 * The only place outside the import script and the guest RSVP route that uses
 * SUPABASE_SECRET_KEY (see CLAUDE.md). Supabase's auth admin API has no
 * RLS-scoped equivalent: creating a login and resetting a password are
 * service-role operations by definition.
 *
 * Every exported action in this file therefore starts with `requireAdmin`,
 * which reads the caller's own profile through the request-scoped, RLS-bound
 * client. The secret key is only reached after that check passes, and it never
 * leaves the server.
 */
async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') return null
  return profile
}

export type Role = 'superadmin' | 'admin' | 'inviter' | 'usher' | 'viewer'

/** Stands in when an account is created without a real address. */
const PLACEHOLDER_EMAIL_DOMAIN = 'sita-fatan.local'

export type ManagedUser = {
  userId: string
  username: string
  email: string
  fullName: string
  role: Role
  inviterKey: string | null
  side: 'fatan' | 'sita' | null
  lastSignInAt: string | null
}

export async function listUsers(): Promise<ManagedUser[]> {
  if (!(await requireAdmin())) return []

  const admin = getAdminSupabase()
  const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from('profiles').select('user_id, username, full_name, role, inviter_key, side'),
  ])
  if (authError) throw new Error(`Failed to list accounts: ${authError.message}`)
  if (profileError) throw new Error(`Failed to list profiles: ${profileError.message}`)

  const byId = new Map((authUsers?.users ?? []).map((user) => [user.id, user]))

  return (profiles ?? [])
    .map((profile) => {
      const authUser = byId.get(profile.user_id)
      return {
        userId: profile.user_id,
        username: profile.username,
        email: authUser?.email ?? '(no login)',
        fullName: profile.full_name,
        role: profile.role as Role,
        inviterKey: profile.inviter_key,
        side: profile.side,
        lastSignInAt: authUser?.last_sign_in_at ?? null,
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export async function createUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only the couple can create accounts.' }

  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()
  const role = String(formData.get('role') ?? '') as Role
  const inviterKey = String(formData.get('inviterKey') ?? '').trim() || null
  const side = (String(formData.get('side') ?? '').trim() || null) as 'fatan' | 'sita' | null

  const username = checkUsername(formData.get('username') as string | null)
  if (!username.ok) return { error: username.error }

  // Nothing is ever sent to the address: accounts are created confirmed and the
  // password is handed over in person. Supabase still needs one, so an account
  // created without an email gets a placeholder it can sign in with by username.
  const email =
    String(formData.get('email') ?? '').trim().toLowerCase() || `${username.username}@${PLACEHOLDER_EMAIL_DOMAIN}`

  if (!password || !fullName) return { error: 'Name, username and password are all required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }
  if (!['superadmin', 'admin', 'inviter', 'usher', 'viewer'].includes(role)) return { error: 'Pick a role.' }
  if (role === 'inviter' && !inviterKey) return { error: 'An inviter account needs an inviter key.' }
  if (role === 'admin' && !side) return { error: 'An admin account needs a side: they manage one side of the wedding.' }

  const admin = getAdminSupabase()
  const { data: taken } = await admin
    .from('profiles')
    .select('user_id')
    .eq('username', username.username)
    .maybeSingle()
  if (taken) return { error: `Username "${username.username}" is already taken.` }

  // Confirmed on creation: these are handed-over accounts, there is no inbox
  // to check and no self-signup flow (docs/PRD.md, "Login").
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) return { error: `Could not create the login: ${error?.message}` }

  const resolvedInviterKey = role === 'inviter' ? inviterKey : null
  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    username: username.username,
    full_name: fullName,
    role,
    inviter_key: resolvedInviterKey,
    side,
  })
  if (profileError) {
    // Roll the login back rather than leaving an account nobody can use.
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: `Could not create the profile: ${profileError.message}` }
  }

  await insertAuditLog(await getServerSupabase(), {
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: 'user.create',
    entityType: 'user',
    entityId: data.user.id,
    entityLabel: fullName,
    diff: buildDiff(
      null,
      { username: username.username, full_name: fullName, role, inviter_key: resolvedInviterKey, side },
      ['username', 'full_name', 'role', 'inviter_key', 'side']
    ),
  })

  revalidatePath('/users')
  return { ok: true }
}

export async function resetPassword(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only the couple can reset a password.' }

  const userId = String(formData.get('userId') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }

  const admin = getAdminSupabase()
  const { data: target } = await admin.from('profiles').select('full_name').eq('user_id', userId).single()

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return { error: `Could not reset the password: ${error.message}` }

  // Never log the password itself: an empty diff records that the reset
  // happened without recording what it was reset to.
  await insertAuditLog(await getServerSupabase(), {
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: userId,
    entityLabel: target?.full_name ?? userId,
    diff: {},
  })

  revalidatePath('/users')
  return { ok: true }
}

/**
 * Edits the profile half of an account: name, role, scope. Username and
 * password have their own flows; email is the login identity and stays.
 * Changing your own role is refused: a superadmin who demotes themself
 * would lock the couple out of this very page.
 */
export async function updateUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only the couple can edit an account.' }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Account is required.' }

  const fullName = String(formData.get('fullName') ?? '').trim()
  const role = String(formData.get('role') ?? '') as Role
  const inviterKey = String(formData.get('inviterKey') ?? '').trim() || null
  const side = (String(formData.get('side') ?? '').trim() || null) as 'fatan' | 'sita' | null

  const username = checkUsername(formData.get('username') as string | null)
  if (!username.ok) return { error: username.error }

  if (!fullName) return { error: 'Name is required.' }
  if (!['superadmin', 'admin', 'inviter', 'usher', 'viewer'].includes(role)) return { error: 'Pick a role.' }
  if (role === 'inviter' && !inviterKey) return { error: 'An inviter account needs an inviter key.' }
  if (role === 'admin' && !side) return { error: 'An admin account needs a side: they manage one side of the wedding.' }

  const admin = getAdminSupabase()
  const { data: target } = await admin
    .from('profiles')
    .select('username, full_name, role, inviter_key, side')
    .eq('user_id', userId)
    .single()
  if (!target) return { error: 'That account no longer exists.' }

  if (userId === actor.userId && role !== actor.role) {
    return { error: 'You cannot change your own role.' }
  }

  const resolvedInviterKey = role === 'inviter' ? inviterKey : null
  const { error } = await admin
    .from('profiles')
    .update({ username: username.username, full_name: fullName, role, inviter_key: resolvedInviterKey, side })
    .eq('user_id', userId)
  if (error) {
    // 23505 is the unique constraint on profiles.username.
    if (error.code === '23505') return { error: `Username "${username.username}" is already taken.` }
    return { error: `Could not update the account: ${error.message}` }
  }

  const diff = buildDiff(
    {
      username: target.username,
      full_name: target.full_name,
      role: target.role,
      inviter_key: target.inviter_key,
      side: target.side,
    },
    { username: username.username, full_name: fullName, role, inviter_key: resolvedInviterKey, side },
    ['username', 'full_name', 'role', 'inviter_key', 'side']
  )
  if (Object.keys(diff).length > 0) {
    await insertAuditLog(await getServerSupabase(), {
      actorId: actor.userId,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'user.update',
      entityType: 'user',
      entityId: userId,
      entityLabel: fullName,
      diff,
    })
  }

  revalidatePath('/users')
  return { ok: true }
}

export async function deleteUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only the couple can delete an account.' }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (userId === actor.userId) return { error: 'You cannot delete your own account.' }

  const admin = getAdminSupabase()
  const { data: target } = await admin
    .from('profiles')
    .select('username, full_name, role, inviter_key, side')
    .eq('user_id', userId)
    .single()

  await admin.from('profiles').delete().eq('user_id', userId)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: `Could not delete the login: ${error.message}` }

  await insertAuditLog(await getServerSupabase(), {
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: 'user.delete',
    entityType: 'user',
    entityId: userId,
    entityLabel: target?.full_name ?? userId,
    diff: buildDiff(
      target
        ? {
            username: target.username,
            full_name: target.full_name,
            role: target.role,
            inviter_key: target.inviter_key,
            side: target.side,
          }
        : null,
      null,
      ['username', 'full_name', 'role', 'inviter_key', 'side']
    ),
  })

  revalidatePath('/users')
  return { ok: true }
}
