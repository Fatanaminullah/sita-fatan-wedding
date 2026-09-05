/**
 * The eight real people who test this app end to end on staging.
 *
 * Replaces the staging guest list outright: after this runs these eight are
 * the only guests, because a test wave that also reaches eleven invented
 * names proves nothing and costs real messages.
 *
 * Between them they cover every shape the system has to handle:
 *
 *   Akad only          the guest the ticket must admit at one door
 *   Resepsi only       the same, at the other
 *   Both               the guest whose two answers can disagree
 *   Indonesian         so the `id` variant of every template is exercised
 *   Several pax sizes  so the ticket's {{pax}} is not always 1
 *
 * Batch 1 holds all three event shapes on its own. That is deliberate: the
 * first press of the first wave should prove the whole thing, not a third of
 * it. Batches 2 to 6 hold one guest each and exist to prove the batch
 * mechanics themselves.
 *
 * Phone numbers are the owner's to supply. A guest listed here without one is
 * created anyway, and simply cannot be reached until somebody fills it in on
 * the guests screen. Nothing else about them is guesswork.
 *
 * Run: npx tsx scripts/seed-staging-testers.ts --dry-run
 *      npx tsx scripts/seed-staging-testers.ts --yes
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { getAdminSupabase } from '../src/server/supabase/admin-client'

/** The one project this script may never touch. See CLAUDE.md. */
const PRODUCTION_REF = 'elzewxhtkqqfdjrvpahv'

type Tester = {
  name: string
  phone: string | null
  side: 'fatan' | 'sita'
  inviterKey: string
  type: 'family' | 'friend'
  pax: number
  language: 'en' | 'id'
  batch: number
  /** Which events they hold a confirmed invitation to. */
  events: Array<'akad' | 'resepsi'>
  isVip?: boolean
}

const TESTERS: Tester[] = [
  // Batch 1: every event shape, and every number already known, so the first
  // wave can be sent and read on a real phone without waiting for anything.
  {
    name: 'Sita Arasy',
    phone: '+6281282499060',
    side: 'sita',
    inviterKey: 'Sita',
    type: 'family',
    pax: 3,
    language: 'en',
    batch: 1,
    events: ['akad', 'resepsi'],
    isVip: true,
  },
  {
    name: 'Azka Ruhama',
    phone: '+6281236448120',
    side: 'fatan',
    inviterKey: 'Fatan',
    type: 'friend',
    pax: 1,
    language: 'en',
    batch: 1,
    events: ['akad'],
  },
  {
    name: 'Yasmin Shabrina',
    phone: '+6282119089233',
    side: 'fatan',
    inviterKey: 'Fatan',
    type: 'friend',
    pax: 2,
    language: 'en',
    batch: 1,
    events: ['resepsi'],
  },

  // Batches 2 to 6: one guest each.
  {
    name: 'Muhammad Al Fatih',
    phone: '+6285171688753',
    side: 'fatan',
    inviterKey: 'Fatan',
    type: 'friend',
    pax: 4,
    language: 'en',
    batch: 2,
    events: ['akad', 'resepsi'],
  },
  {
    name: 'Fatan Aminudin',
    phone: null,
    side: 'fatan',
    inviterKey: 'Papa Fatan',
    type: 'family',
    pax: 2,
    language: 'en',
    batch: 3,
    events: ['akad'],
  },
  {
    name: 'Diza Zahra',
    phone: null,
    side: 'sita',
    inviterKey: 'Sita',
    type: 'friend',
    pax: 1,
    language: 'en',
    batch: 4,
    events: ['resepsi'],
  },
  // The only Indonesian guest, so the `id` variant of all three templates is
  // exercised by an ordinary run rather than by remembering to test it.
  {
    name: 'Shabrina Virdayanti',
    phone: null,
    side: 'sita',
    inviterKey: 'Mama Sita',
    type: 'family',
    pax: 2,
    language: 'id',
    batch: 5,
    events: ['akad', 'resepsi'],
  },
  {
    name: 'Aldi Gahda Utama',
    phone: null,
    side: 'fatan',
    inviterKey: 'Mama Fatan',
    type: 'friend',
    pax: 3,
    language: 'en',
    batch: 6,
    events: ['akad'],
  },
]

function projectRef(url: string): string {
  return new URL(url).hostname.split('.')[0]
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const confirmed = args.has('--yes')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set. Is .env.local filled in?')

  const ref = projectRef(url)
  if (ref === PRODUCTION_REF) {
    console.error(
      `Refusing to run: ${ref} is the production project. This replaces the whole guest list, ` +
        'and there is no override for that here.'
    )
    process.exit(1)
  }

  if (!dryRun && !confirmed) {
    console.error(
      `This replaces every guest in project ${ref} with the ${TESTERS.length} testers.\n` +
        'Run it with --dry-run to see the plan, or --yes to go ahead.'
    )
    process.exit(1)
  }

  const db = getAdminSupabase()

  console.log(`Project ${ref}${dryRun ? ' (dry run, nothing will be written)' : ''}\n`)

  const { data: existing, error: existingError } = await db.from('guests').select('id, name')
  if (existingError) throw new Error(`Could not read the guest list: ${existingError.message}`)
  console.log(`Removing ${existing?.length ?? 0} existing guests.`)

  for (const tester of TESTERS) {
    console.log(
      `  batch ${tester.batch}  ${tester.name.padEnd(20)} ${tester.events.join('+').padEnd(13)} ` +
        `${tester.pax} pax  ${tester.language}  ${tester.phone ?? 'NO PHONE'}`
    )
  }

  if (dryRun) {
    console.log('\nNothing was written. Re-run with --yes to do it.')
    return
  }

  // guest_events cascades; every other table that references guests was
  // emptied by reset-test-data and holds nothing to orphan.
  const { error: deleteError } = await db.from('guests').delete().not('id', 'is', null)
  if (deleteError) throw new Error(`Could not clear the guest list: ${deleteError.message}`)

  for (const tester of TESTERS) {
    // public_slug is left out on purpose: a trigger generates it from the name
    // and guarantees it is unique.
    const { data, error } = await db
      .from('guests')
      .insert({
        name: tester.name,
        phone: tester.phone,
        side: tester.side,
        inviter_key: tester.inviterKey,
        type: tester.type,
        pax: tester.pax,
        language: tester.language,
        send_batch: tester.batch,
        is_vip: tester.isVip ?? false,
      })
      .select('id, public_slug')
      .single()
    if (error) throw new Error(`Could not create ${tester.name}: ${error.message}`)

    const { error: eventsError } = await db.from('guest_events').insert(
      tester.events.map((event) => ({
        guest_id: data.id,
        event,
        invite_status: 'confirmed',
        rsvp_status: 'pending',
      }))
    )
    if (eventsError) throw new Error(`Could not invite ${tester.name}: ${eventsError.message}`)

    console.log(`  ${tester.name} -> /to/${data.public_slug}`)
  }

  const missing = TESTERS.filter((t) => t.phone === null)
  console.log(`\nDone. ${TESTERS.length} guests, batches 1 to 6.`)
  if (missing.length > 0) {
    console.log(
      `${missing.length} have no phone number and cannot be messaged until one is set: ` +
        missing.map((t) => t.name).join(', ')
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
