/**
 * Seeds the STAGING database with ~350 fake guests, so check-in and the
 * capacity engine are exercised at real scale.
 *
 * Run:  npx tsx scripts/seed-staging.ts [--guests 350] [--wipe]
 *
 * Three things this script will not do:
 *
 * 1. Run against production. The ref is checked before a single row is
 *    written, and `PROD_REF` is refused outright. Staging exists so a
 *    WhatsApp test cannot reach a real person; the moment real numbers land
 *    here that guarantee is gone.
 * 2. Invent real-looking phone numbers. Every number is +62 811 0000 0NNN,
 *    inside the reserved-looking block and sequential, so a human reading the
 *    table can see at a glance that none of it is dialable.
 * 3. Touch `guests` without also writing `guest_events`. A guest with no event
 *    row is a state the app never produces, and seeding one would make the
 *    capacity engine look broken for reasons that are not real.
 *
 * On the coming `public_slug` column (Routing and Public Surface): the row
 * shape is built in one place, `buildGuest` below. Adding the column means
 * adding one field there and one line to the insert list. It is deliberately
 * not spread across the file.
 */
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
      `  NEXT_PUBLIC_SUPABASE_URL points at ${ref}, which is PRODUCTION.\n` +
      `  Production holds real guests' RSVPs collected by hand over weeks.\n` +
      `  This script writes hundreds of fake rows and, with --wipe, deletes\n` +
      `  every guest first.\n\n` +
      `  Point .env.local at staging and try again.\n`
  )
  process.exit(1)
}

const args = process.argv.slice(2)
const wipe = args.includes('--wipe')
const countArg = args.indexOf('--guests')
const TARGET = countArg >= 0 ? Number(args[countArg + 1]) : 350

if (!Number.isInteger(TARGET) || TARGET < 1 || TARGET > 2000) {
  console.error(`--guests must be an integer between 1 and 2000, got ${args[countArg + 1]}`)
  process.exit(1)
}

const db = createClient(url, secret, { auth: { persistSession: false } })

// Deterministic pseudo-random, so a reseed produces the same list and a bug
// found on Tuesday is still reproducible on Thursday. Mulberry32.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20261010)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

// Invented names. CLAUDE.md: test fixtures never use real guest rows.
const FIRST = [
  'Adit', 'Bagus', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko',
  'Kartika', 'Lestari', 'Maya', 'Nanda', 'Oki', 'Putri', 'Rizky', 'Sari', 'Tono', 'Umi',
  'Vina', 'Wahyu', 'Yuni', 'Zaki', 'Bayu', 'Rina', 'Doni', 'Sinta', 'Agus', 'Nia',
] as const
const LAST = [
  'Pratama', 'Wijaya', 'Santoso', 'Hidayat', 'Nugroho', 'Saputra', 'Utami', 'Kusuma',
  'Halim', 'Permana', 'Setiawan', 'Anggraini', 'Firmansyah', 'Maulana', 'Rahmawati',
] as const
const NOTES = ['Kantor', 'Kel. besar', 'Teman SMA', 'Tetangga', 'Kuliah', null, null, null] as const

const INVITERS = [
  { key: 'Fatan', side: 'fatan' },
  { key: 'Mama Fatan', side: 'fatan' },
  { key: 'Papa Fatan', side: 'fatan' },
  { key: 'Sita', side: 'sita' },
  { key: 'Mama Sita', side: 'sita' },
  { key: 'Papa Sita', side: 'sita' },
] as const

type GuestRow = {
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviter_key: string
  type: 'family' | 'friend'
  is_vip: boolean
  is_physical_invitation: boolean
  note: string | null
  phone: string | null
}

/**
 * One place that knows the shape of a seeded guest. `public_slug` belongs here
 * when it lands, and nowhere else in this file.
 */
function buildGuest(i: number): GuestRow {
  const inviter = pick(INVITERS)
  const type = rand() < 0.45 ? 'family' : 'friend'
  return {
    name: `${pick(FIRST)} ${pick(LAST)}`,
    // Families skew larger, which is what makes the pax-vs-entries distinction
    // visible on the dashboard instead of every row being 2.
    pax: type === 'family' ? 1 + Math.floor(rand() * 5) : 1 + Math.floor(rand() * 2),
    side: inviter.side,
    inviter_key: inviter.key,
    type,
    is_vip: rand() < 0.08,
    is_physical_invitation: rand() < 0.35,
    note: pick(NOTES),
    // Fake, sequential, obviously not dialable. ~15% left null on purpose so
    // the phone-coverage card and the missing-phone filter have something to
    // show; that is a real state in production today.
    phone: rand() < 0.15 ? null : `+62811000${String(i).padStart(4, '0')}`,
  }
}

async function main() {
  console.log(`Target project ref : ${ref}  (production is ${PROD_REF}, refused)`)
  console.log(`Guests to create   : ${TARGET}`)
  console.log(`Wipe first         : ${wipe}\n`)

  // Inviters and side caps are configuration, not fixtures: upsert so a
  // reseed does not duplicate them and the caps stay where they were tuned.
  const { error: invErr } = await db
    .from('inviters')
    .upsert(
      INVITERS.map((i) => ({ key: i.key, side: i.side, akad_cap: 40, resepsi_cap: 80 })),
      { onConflict: 'key' }
    )
  if (invErr) throw new Error(`inviters upsert failed: ${invErr.message}`)

  const { error: capErr } = await db
    .from('side_caps')
    .upsert(
      [
        { side: 'fatan', vip_cap: 25, physical_cap: 150 },
        { side: 'sita', vip_cap: 25, physical_cap: 150 },
      ],
      { onConflict: 'side' }
    )
  if (capErr) throw new Error(`side_caps upsert failed: ${capErr.message}`)
  console.log('inviters + side_caps ready')

  if (wipe) {
    // guest_events cascades from guests, but delete it explicitly so the
    // output states what was removed rather than relying on the FK.
    const { error: geErr } = await db.from('guest_events').delete().neq('id', crypto.randomUUID())
    if (geErr) throw new Error(`guest_events wipe failed: ${geErr.message}`)
    const { error: gErr } = await db.from('guests').delete().neq('id', crypto.randomUUID())
    if (gErr) throw new Error(`guests wipe failed: ${gErr.message}`)
    console.log('wiped existing guests + guest_events')
  }

  const rows = Array.from({ length: TARGET }, (_, i) => buildGuest(i + 1))

  // Chunked: one 350-row insert is a single statement PostgREST may reject on
  // payload size, and a partial failure would be harder to read than a chunk
  // index.
  const CHUNK = 100
  const ids: { id: string; type: string }[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { data, error } = await db.from('guests').insert(slice).select('id, type')
    if (error) throw new Error(`guests insert failed at chunk ${i / CHUNK}: ${error.message}`)
    ids.push(...(data ?? []))
    console.log(`  guests ${Math.min(i + CHUNK, rows.length)}/${rows.length}`)
  }

  // Event rows. Roughly the real distribution: most on Resepsi only, a slice
  // on both, a few Akad only, and a waitlisted tail so the cascade has input.
  const events: Array<{
    guest_id: string
    event: 'akad' | 'resepsi'
    invite_status: 'confirmed' | 'waitlisted'
    rsvp_status: 'pending' | 'attending' | 'not_attending'
  }> = []
  for (const g of ids) {
    const roll = rand()
    const attend = (): 'pending' | 'attending' | 'not_attending' =>
      rand() < 0.55 ? 'pending' : rand() < 0.85 ? 'attending' : 'not_attending'
    const status = () => (rand() < 0.06 ? 'waitlisted' : 'confirmed')

    if (roll < 0.18) {
      events.push({ guest_id: g.id, event: 'akad', invite_status: status(), rsvp_status: attend() })
    } else if (roll < 0.45) {
      events.push({ guest_id: g.id, event: 'akad', invite_status: status(), rsvp_status: attend() })
      events.push({ guest_id: g.id, event: 'resepsi', invite_status: status(), rsvp_status: attend() })
    } else {
      events.push({ guest_id: g.id, event: 'resepsi', invite_status: status(), rsvp_status: attend() })
    }
  }

  for (let i = 0; i < events.length; i += CHUNK) {
    const { error } = await db.from('guest_events').insert(events.slice(i, i + CHUNK))
    if (error) throw new Error(`guest_events insert failed at chunk ${i / CHUNK}: ${error.message}`)
    console.log(`  guest_events ${Math.min(i + CHUNK, events.length)}/${events.length}`)
  }

  const { count: guestCount } = await db.from('guests').select('*', { count: 'exact', head: true })
  const { count: eventCount } = await db.from('guest_events').select('*', { count: 'exact', head: true })
  const { count: noPhone } = await db
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .is('phone', null)

  console.log(`\nDone. guests=${guestCount} guest_events=${eventCount} missing_phone=${noPhone}`)
  console.log('Every phone is +62811000XXXX and fake. WA_PROVIDER must stay `fake`.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
