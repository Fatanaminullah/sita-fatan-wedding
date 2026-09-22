/**
 * Put the messaging and door data back to zero, so a full run can be tested
 * from the beginning.
 *
 * Clears every message sent and received, every send ledger row, every
 * check-in and souvenir claim, every audit row, and the RSVP answers and
 * invitation-open counters those runs produced. The guest list itself is never
 * touched: names, phones, sides, inviters, caps, batches, slugs and tokens all
 * survive, because re-importing the list is not what this is for.
 *
 * Two guards, both deliberate:
 *
 *   It refuses to run against the production project, by ref, whatever the
 *   flags say. There is no override. A wiped production inbox cannot be
 *   restored from anywhere in this repo.
 *
 *   It refuses to run without --yes, and prints what it is about to destroy
 *   first when given --dry-run.
 *
 * Run: npx tsx scripts/reset-test-data.ts --dry-run
 *      npx tsx scripts/reset-test-data.ts --yes
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { getAdminSupabase } from '../src/server/supabase/admin-client'

/** The one project this script may never touch. See CLAUDE.md. */
const PRODUCTION_REF = 'elzewxhtkqqfdjrvpahv'

/**
 * Wiped whole, children before parents.
 *
 * wa_send_attempts and wa_messages both hang off guests rather than off
 * wa_sends, so the order here is about reading the output in a sensible
 * sequence rather than about foreign keys. souvenir_claims and checkin_events
 * reference guests, which is not deleted from at all.
 */
const EMPTIED = [
  'wa_messages',
  'wa_send_attempts',
  'wa_sends',
  'souvenir_claims',
  'checkin_events',
  'audit_log',
] as const

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
      `Refusing to run: ${ref} is the production project. This script has no override for that, ` +
        'and nothing it deletes can be restored from this repo.'
    )
    process.exit(1)
  }

  if (!dryRun && !confirmed) {
    console.error(
      `This will permanently delete every message, send, check-in, souvenir claim and audit row ` +
        `in project ${ref}, and reset every RSVP answer to pending.\n` +
        'Run it with --dry-run to see the counts first, or --yes to go ahead.'
    )
    process.exit(1)
  }

  const db = getAdminSupabase()

  console.log(`Project ${ref}${dryRun ? ' (dry run, nothing will be deleted)' : ''}\n`)

  for (const table of EMPTIED) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
    if (error) throw new Error(`Could not count ${table}: ${error.message}`)
    console.log(`${table}: ${count ?? 0} rows`)

    if (dryRun) continue
    // PostgREST requires a filter on a delete. `id` is not null on every one
    // of these tables, so this matches all of them and nothing else.
    const { error: deleteError } = await db.from(table).delete().not('id', 'is', null)
    if (deleteError) throw new Error(`Could not clear ${table}: ${deleteError.message}`)
  }

  // Answers, which live on the guest rather than in a table of their own.
  const { count: answered, error: answeredError } = await db
    .from('guest_events')
    .select('*', { count: 'exact', head: true })
    .neq('rsvp_status', 'pending')
  if (answeredError) throw new Error(`Could not count answers: ${answeredError.message}`)
  console.log(`guest_events answered: ${answered ?? 0} rows`)

  if (!dryRun) {
    const { error } = await db
      .from('guest_events')
      .update({ rsvp_status: 'pending', pax_confirmed: null })
      .neq('rsvp_status', 'pending')
    if (error) throw new Error(`Could not reset answers: ${error.message}`)
  }

  // The chat's own marker, and the invitation-open funnel.
  const { count: opened, error: openedError } = await db
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .gt('open_count', 0)
  if (openedError) throw new Error(`Could not count opens: ${openedError.message}`)
  console.log(`guests opened at least once: ${opened ?? 0} rows`)

  if (!dryRun) {
    const { error } = await db
      .from('guests')
      .update({
        chat_awaiting: null,
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0,
      })
      .not('id', 'is', null)
    if (error) throw new Error(`Could not reset the guests: ${error.message}`)
  }

  console.log(
    dryRun
      ? '\nNothing was deleted. Re-run with --yes to do it.'
      : '\nDone. Batches, phone numbers, slugs and tokens are untouched.'
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
