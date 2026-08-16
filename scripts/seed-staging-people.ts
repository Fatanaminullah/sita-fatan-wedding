/**
 * Creates the staging login accounts, and optionally imports a small set of
 * real guest rows for check-in rehearsal.
 *
 *   npx tsx scripts/seed-staging-people.ts
 *   npx tsx scripts/seed-staging-people.ts --family /abs/path/to/core-family.json
 *
 * Accounts mirror production's roles so RLS behaves the same, plus one usher
 * that production does not have: check-in is the usher flow, and rehearsing it
 * as a superadmin would exercise a different policy path than the door screen
 * actually uses.
 *
 * Emails are synthetic (`<username>@staging.invalid`). Login is by username in
 * this app, so the flow is identical to production, and `.invalid` is reserved
 * by RFC 2606 so a stray Supabase password-reset cannot be delivered to a real
 * person.
 *
 * The --family file is deliberately a path argument, never a file in this
 * repo: it holds real guest names and phone numbers, and CLAUDE.md forbids
 * vendoring guest data into the repository.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const PROD_REF = 'elzewxhtkqqfdjrvpahv'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

const ref = new URL(url).hostname.split('.')[0]
if (ref === PROD_REF) {
  console.error(
    `\nREFUSING TO RUN.\n\n` +
      `  Target is ${ref}, which is PRODUCTION.\n` +
      `  This script creates auth users and profiles. Running it against\n` +
      `  production would add real login accounts with generated passwords.\n`
  )
  process.exit(1)
}

const db = createClient(url, secret, { auth: { persistSession: false } })

type Role = 'superadmin' | 'admin' | 'inviter' | 'usher'
type Account = {
  username: string
  fullName: string
  role: Role
  side: 'fatan' | 'sita' | null
  inviterKey: string | null
}

// Mirrors production's 8 profiles as of 2026-08-16, plus `usher`.
const ACCOUNTS: Account[] = [
  { username: 'fatan', fullName: 'Fatan Aminullah', role: 'superadmin', side: null, inviterKey: null },
  { username: 'sita', fullName: 'Sita Arasy', role: 'superadmin', side: null, inviterKey: null },
  { username: 'azka', fullName: 'Azka Ruhama', role: 'admin', side: 'fatan', inviterKey: null },
  { username: 'sabrina', fullName: 'Sabrina Virdayanti', role: 'admin', side: 'sita', inviterKey: null },
  { username: 'sabrul', fullName: 'Sabrul Jamil', role: 'inviter', side: 'fatan', inviterKey: 'Papa Fatan' },
  { username: 'yudhanti', fullName: 'Yudhanti Dwi Lestari', role: 'inviter', side: 'fatan', inviterKey: 'Mama Fatan' },
  { username: 'siswoko', fullName: 'Siswoko', role: 'inviter', side: 'sita', inviterKey: 'Papa Sita' },
  { username: 'ica', fullName: 'Siti Hapsah', role: 'inviter', side: 'sita', inviterKey: 'Mama Sita' },
  { username: 'usher', fullName: 'Door Volunteer (staging only)', role: 'usher', side: null, inviterKey: null },
]

// Readable but not guessable. Staging only; these are printed once and are not
// stored anywhere by this script.
function password(): string {
  return randomBytes(9).toString('base64url')
}

async function seedAccounts() {
  const created: Array<{ username: string; role: string; password: string }> = []

  for (const a of ACCOUNTS) {
    const email = `${a.username}@staging.invalid`
    const pw = password()

    const { data: user, error: userErr } = await db.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
    })

    if (userErr) {
      // Already there from a previous run: leave the existing password alone
      // rather than silently rotating it under someone who is mid-test.
      if (/already|registered|exists/i.test(userErr.message)) {
        console.log(`  ${a.username.padEnd(9)} exists, skipped`)
        continue
      }
      throw new Error(`createUser(${a.username}) failed: ${userErr.message}`)
    }

    const { error: profErr } = await db.from('profiles').upsert(
      {
        user_id: user.user.id,
        full_name: a.fullName,
        role: a.role,
        side: a.side,
        inviter_key: a.inviterKey,
        username: a.username,
      },
      { onConflict: 'user_id' }
    )
    if (profErr) throw new Error(`profile(${a.username}) failed: ${profErr.message}`)

    created.push({ username: a.username, role: a.role, password: pw })
    console.log(`  ${a.username.padEnd(9)} ${a.role}`)
  }

  return created
}

type FamilyGuest = {
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviter_key: string
  type: 'family' | 'friend'
  is_vip: boolean
  is_physical_invitation: boolean
  note: string | null
  phone: string | null
  events: Array<{
    event: 'akad' | 'resepsi'
    invite_status: 'confirmed' | 'waitlisted'
    rsvp_status: 'pending' | 'attending' | 'not_attending'
    pax_confirmed: number | null
    waitlist_rank: number | null
  }>
}

async function seedFamily(path: string) {
  const rows: FamilyGuest[] = JSON.parse(readFileSync(path, 'utf8'))

  for (const g of rows) {
    // Idempotent on name + inviter, so a rerun does not duplicate the family.
    const { data: existing } = await db
      .from('guests')
      .select('id')
      .eq('name', g.name)
      .eq('inviter_key', g.inviter_key)
      .maybeSingle()

    if (existing) {
      console.log(`  ${g.name} already present, skipped`)
      continue
    }

    const { events, ...guest } = g
    const { data: inserted, error } = await db.from('guests').insert(guest).select('id').single()
    if (error) throw new Error(`guest ${g.name} failed: ${error.message}`)

    const { error: evErr } = await db
      .from('guest_events')
      .insert(events.map((e) => ({ ...e, guest_id: inserted.id })))
    if (evErr) throw new Error(`events for ${g.name} failed: ${evErr.message}`)

    console.log(`  ${g.name}  ${events.length} event(s)`)
  }
}

/**
 * Resets every mirrored account to one shared password. Convenience for a
 * rehearsal where nine random strings are unusable; never for production,
 * which the guard above already refuses.
 */
async function setAllPasswords(pw: string) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 })
  if (error) throw new Error(`listUsers failed: ${error.message}`)

  const wanted = new Set(ACCOUNTS.map((a) => `${a.username}@staging.invalid`))
  let n = 0
  for (const u of data.users) {
    if (!u.email || !wanted.has(u.email)) continue
    const { error: upErr } = await db.auth.admin.updateUserById(u.id, { password: pw })
    if (upErr) throw new Error(`password reset for ${u.email} failed: ${upErr.message}`)
    console.log(`  ${u.email.replace('@staging.invalid', '').padEnd(9)} updated`)
    n++
  }
  return n
}

async function main() {
  console.log(`Target ref: ${ref}  (production ${PROD_REF} is refused)\n`)

  const pwIdx = process.argv.indexOf('--password')
  if (pwIdx >= 0) {
    const pw = process.argv[pwIdx + 1]
    if (!pw || pw.length < 6) throw new Error('--password needs a value of at least 6 characters')
    console.log('Resetting staging passwords:')
    const n = await setAllPasswords(pw)
    console.log(`\n${n} account(s) now share that password. Staging only.`)
    return
  }

  console.log('Accounts:')
  const created = await seedAccounts()

  const famIdx = process.argv.indexOf('--family')
  if (famIdx >= 0) {
    const path = process.argv[famIdx + 1]
    if (!path) throw new Error('--family needs a path')
    console.log('\nCore family rows:')
    await seedFamily(path)
  }

  if (created.length > 0) {
    console.log('\n' + '='.repeat(58))
    console.log('STAGING PASSWORDS — shown once, not stored by this script')
    console.log('='.repeat(58))
    for (const c of created) {
      console.log(`  ${c.username.padEnd(9)} ${c.password.padEnd(14)} ${c.role}`)
    }
    console.log('='.repeat(58))
    console.log('Log in with the USERNAME, not the email.')
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
