'use server'

import { revalidatePath } from 'next/cache'
import { getAdminSupabase } from '../supabase/admin-client'
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
  if (!profile || profile.role !== 'admin') return null
  return profile
}

export type Role = 'admin' | 'inviter' | 'usher' | 'viewer'

export type ManagedUser = {
  userId: string
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
    admin.from('profiles').select('user_id, full_name, role, inviter_key, side'),
  ])
  if (authError) throw new Error(`Failed to list accounts: ${authError.message}`)
  if (profileError) throw new Error(`Failed to list profiles: ${profileError.message}`)

  const byId = new Map((authUsers?.users ?? []).map((user) => [user.id, user]))

  return (profiles ?? [])
    .map((profile) => {
      const authUser = byId.get(profile.user_id)
      return {
        userId: profile.user_id,
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
  if (!(await requireAdmin())) return { error: 'Only an admin can create accounts.' }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()
  const role = String(formData.get('role') ?? '') as Role
  const inviterKey = String(formData.get('inviterKey') ?? '').trim() || null
  const side = (String(formData.get('side') ?? '').trim() || null) as 'fatan' | 'sita' | null

  if (!email || !password || !fullName) return { error: 'Name, email and password are all required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }
  if (!['admin', 'inviter', 'usher', 'viewer'].includes(role)) return { error: 'Pick a role.' }
  if (role === 'inviter' && !inviterKey) return { error: 'An inviter account needs an inviter key.' }

  const admin = getAdminSupabase()
  // Confirmed on creation: these are handed-over accounts, there is no inbox
  // to check and no self-signup flow (docs/PRD.md, "Login").
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) return { error: `Could not create the login: ${error?.message}` }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    full_name: fullName,
    role,
    inviter_key: role === 'inviter' ? inviterKey : null,
    side,
  })
  if (profileError) {
    // Roll the login back rather than leaving an account nobody can use.
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: `Could not create the profile: ${profileError.message}` }
  }

  revalidatePath('/users')
  return { ok: true }
}

export async function resetPassword(formData: FormData): Promise<{ error: string } | { ok: true }> {
  if (!(await requireAdmin())) return { error: 'Only an admin can reset a password.' }

  const userId = String(formData.get('userId') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }

  const { error } = await getAdminSupabase().auth.admin.updateUserById(userId, { password })
  if (error) return { error: `Could not reset the password: ${error.message}` }

  revalidatePath('/users')
  return { ok: true }
}

export async function deleteUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const profile = await requireAdmin()
  if (!profile) return { error: 'Only an admin can delete an account.' }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (userId === profile.userId) return { error: 'You cannot delete your own account.' }

  const admin = getAdminSupabase()
  await admin.from('profiles').delete().eq('user_id', userId)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: `Could not delete the login: ${error.message}` }

  revalidatePath('/users')
  return { ok: true }
}
