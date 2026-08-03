import { checkUsername } from '../src/domain/username'
import { getAdminSupabase } from '../src/server/supabase/admin-client'

type Role = 'admin' | 'inviter' | 'usher' | 'viewer'

/** Matches PLACEHOLDER_EMAIL_DOMAIN in src/server/actions/user-actions.ts. */
const PLACEHOLDER_EMAIL_DOMAIN = 'sita-fatan.local'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i === -1 ? undefined : args[i + 1]
  }
  const password = get('--password')
  const fullName = get('--name')
  const role = get('--role') as Role | undefined
  const inviterKey = get('--inviter-key')
  const side = get('--side') as 'fatan' | 'sita' | undefined

  const checked = checkUsername(get('--username'))
  if (!checked.ok || !password || !fullName || !role) {
    throw new Error(
      'Usage: tsx scripts/create-user.ts --username X --password X --name X --role admin|inviter|usher|viewer [--email X] [--inviter-key "Mama Fatan"] [--side fatan|sita]'
    )
  }
  if (role === 'inviter' && !inviterKey) {
    throw new Error('--inviter-key is required when --role inviter')
  }
  // Nothing is ever sent to the address, so --email is optional: it is only a
  // second identifier to sign in with.
  const email = get('--email') ?? `${checked.username}@${PLACEHOLDER_EMAIL_DOMAIN}`
  return { username: checked.username, email, password, fullName, role, inviterKey, side }
}

async function main() {
  const { username, email, password, fullName, role, inviterKey, side } = parseArgs()
  const admin = getAdminSupabase()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message}`)
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    username,
    full_name: fullName,
    role,
    inviter_key: inviterKey ?? null,
    side: side ?? null,
  })
  if (profileError) {
    // roll back the auth user so a failed run doesn't leave an orphan login
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`profile insert failed, auth user rolled back: ${profileError.message}`)
  }

  console.log(`Created ${role} account "${username}" (${email})`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
