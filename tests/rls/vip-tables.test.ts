// tests/rls/vip-tables.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import {
  getRemoteConfig,
  getAdminClient,
  createTestUser,
  cleanupTestUser,
  cleanupGuest,
  clientAs,
  type RemoteConfig,
  type CreateTestUserInput,
} from './setup'

let config: RemoteConfig
let createdUserIds: string[] = []
let createdTableIds: string[] = []
let createdGuestIds: string[] = []

beforeAll(() => {
  config = getRemoteConfig()
})

// Only what this file created. The eight seeded tables are the couple's.
afterEach(async () => {
  const admin = getAdminClient(config)
  for (const id of createdTableIds) await admin.from('vip_tables').delete().eq('id', id)
  createdTableIds = []
  for (const id of createdGuestIds) await cleanupGuest(admin, id)
  createdGuestIds = []
  for (const id of createdUserIds) await cleanupTestUser(admin, id)
  createdUserIds = []
})

async function signIn(input: Omit<CreateTestUserInput, 'email'>) {
  const admin = getAdminClient(config)
  const user = await createTestUser(admin, { ...input, email: `vip-${input.role}-${crypto.randomUUID()}@test.local` })
  createdUserIds.push(user.userId)
  return clientAs(config, user.email, user.password)
}

async function seedTableAndGuest(
  owner: { side: 'fatan' | 'sita'; inviterKey: string } = { side: 'fatan', inviterKey: 'Mama Fatan' }
) {
  const admin = getAdminClient(config)
  const table = await admin.from('vip_tables').insert({ name: 'RLS test table', seats: 4, position: 900 }).select().single()
  if (table.error || !table.data) throw new Error(`seed table failed: ${table.error?.message}`)
  createdTableIds.push(table.data.id)
  const guest = await admin
    .from('guests')
    .insert({ name: `Test VIP ${crypto.randomUUID()}`, pax: 2, side: owner.side, inviter_key: owner.inviterKey, type: 'family', is_vip: true })
    .select()
    .single()
  if (guest.error || !guest.data) throw new Error(`seed guest failed: ${guest.error?.message}`)
  createdGuestIds.push(guest.data.id)
  const seat = await admin.from('vip_table_guests').insert({ guest_id: guest.data.id, table_id: table.data.id })
  if (seat.error) throw new Error(`seed seat failed: ${seat.error.message}`)
  return { tableId: table.data.id as string, guestId: guest.data.id as string }
}

describe('vip tables RLS', () => {
  it('lets the couple read, resize, and seat', async () => {
    const { tableId, guestId } = await seedTableAndGuest()
    const client = await signIn({ role: 'superadmin' })

    const tables = await client.from('vip_tables').select('id').eq('id', tableId)
    expect(tables.data).toHaveLength(1)

    const resize = await client.from('vip_tables').update({ seats: 8 }).eq('id', tableId).select()
    expect(resize.error).toBeNull()
    expect(resize.data?.[0]?.seats).toBe(8)

    const seats = await client.from('vip_table_guests').select('guest_id').eq('guest_id', guestId)
    expect(seats.data).toHaveLength(1)

    const moved = await client.from('vip_table_guests').delete().eq('guest_id', guestId).select()
    expect(moved.data).toHaveLength(1)
  })

  it('removing a table sends its guests back to unseated', async () => {
    const { tableId, guestId } = await seedTableAndGuest()
    const client = await signIn({ role: 'superadmin' })
    await client.from('vip_tables').delete().eq('id', tableId)
    const seats = await getAdminClient(config).from('vip_table_guests').select('guest_id').eq('guest_id', guestId)
    expect(seats.data).toHaveLength(0)
  })

  it('lets the WO crew (viewer) read the plan and change nothing', async () => {
    const { tableId, guestId } = await seedTableAndGuest()
    const client = await signIn({ role: 'viewer' })

    const tables = await client.from('vip_tables').select('id').eq('id', tableId)
    expect(tables.data).toHaveLength(1)
    const seats = await client.from('vip_table_guests').select('guest_id').eq('guest_id', guestId)
    expect(seats.data).toHaveLength(1)

    const insert = await client.from('vip_tables').insert({ name: 'Nope', seats: 6, position: 901 })
    expect(insert.error).not.toBeNull()
    await client.from('vip_tables').update({ seats: 1 }).eq('id', tableId)
    await client.from('vip_table_guests').delete().eq('guest_id', guestId)
    const admin = getAdminClient(config)
    const table = await admin.from('vip_tables').select('seats').eq('id', tableId).single()
    expect(table.data?.seats).toBe(4)
    const seat = await admin.from('vip_table_guests').select('guest_id').eq('guest_id', guestId)
    expect(seat.data).toHaveLength(1)
  })

  /** Whether a seat for this guest exists, read past RLS. */
  async function isSeated(guestId: string) {
    const seat = await getAdminClient(config).from('vip_table_guests').select('guest_id').eq('guest_id', guestId)
    return (seat.data ?? []).length === 1
  }

  async function tableSeats(tableId: string) {
    const table = await getAdminClient(config).from('vip_tables').select('seats').eq('id', tableId).single()
    return table.data?.seats
  }

  /*
   * Admins and inviters read the whole plan, and seat only the guests they
   * manage: an admin their side, an inviter their own. The tables themselves
   * stay the couple's.
   */
  const managers: Array<{ who: Omit<CreateTestUserInput, 'email'>; own: { side: 'fatan' | 'sita'; inviterKey: string }; other: { side: 'fatan' | 'sita'; inviterKey: string } }> = [
    { who: { role: 'admin', side: 'fatan' }, own: { side: 'fatan', inviterKey: 'Mama Fatan' }, other: { side: 'sita', inviterKey: 'Mama Sita' } },
    { who: { role: 'inviter', inviterKey: 'Mama Fatan', side: 'fatan' }, own: { side: 'fatan', inviterKey: 'Mama Fatan' }, other: { side: 'fatan', inviterKey: 'Papa Fatan' } },
  ]

  for (const { who, own, other } of managers) {
    it(`lets ${who.role} read the plan and seat only their own guests`, async () => {
      const mine = await seedTableAndGuest(own)
      const theirs = await seedTableAndGuest(other)
      const client = await signIn(who)

      const tables = await client.from('vip_tables').select('id').in('id', [mine.tableId, theirs.tableId])
      expect(tables.data).toHaveLength(2)
      const seats = await client.from('vip_table_guests').select('guest_id').in('guest_id', [mine.guestId, theirs.guestId])
      expect(seats.data).toHaveLength(2)

      // Their own guest: unseat, then seat again, then move.
      const unseat = await client.from('vip_table_guests').delete().eq('guest_id', mine.guestId).select()
      expect(unseat.data).toHaveLength(1)
      const reseat = await client.from('vip_table_guests').insert({ guest_id: mine.guestId, table_id: mine.tableId })
      expect(reseat.error).toBeNull()
      const move = await client
        .from('vip_table_guests')
        .upsert({ guest_id: mine.guestId, table_id: theirs.tableId }, { onConflict: 'guest_id' })
      expect(move.error).toBeNull()
      expect(await isSeated(mine.guestId)).toBe(true)

      // Somebody else's guest: no unseat, no move.
      await client.from('vip_table_guests').delete().eq('guest_id', theirs.guestId)
      expect(await isSeated(theirs.guestId)).toBe(true)
      const steal = await client
        .from('vip_table_guests')
        .upsert({ guest_id: theirs.guestId, table_id: mine.tableId }, { onConflict: 'guest_id' })
      expect(steal.error).not.toBeNull()

      // The tables are the couple's.
      const insert = await client.from('vip_tables').insert({ name: 'Nope', seats: 6, position: 901 })
      expect(insert.error).not.toBeNull()
      await client.from('vip_tables').update({ seats: 1 }).eq('id', mine.tableId)
      expect(await tableSeats(mine.tableId)).toBe(4)
    })

    it(`shows ${who.role} every seated guest's name, and no phone`, async () => {
      const theirs = await seedTableAndGuest(other)
      const client = await signIn(who)
      const { data, error } = await client.rpc('vip_seating_guests')
      expect(error).toBeNull()
      const row = (data as Array<Record<string, unknown>>).find((g) => g.id === theirs.guestId)
      expect(row?.name).toBeTruthy()
      expect(row).not.toHaveProperty('phone')
    })
  }

  it('shows an usher nothing and refuses their writes', async () => {
    const { tableId, guestId } = await seedTableAndGuest()
    const client = await signIn({ role: 'usher' })

    const tables = await client.from('vip_tables').select('id')
    expect(tables.data ?? []).toHaveLength(0)
    const seats = await client.from('vip_table_guests').select('guest_id')
    expect(seats.data ?? []).toHaveLength(0)
    const guests = await client.rpc('vip_seating_guests')
    expect(guests.data ?? []).toHaveLength(0)

    const insert = await client.from('vip_tables').insert({ name: 'Nope', seats: 6, position: 901 })
    expect(insert.error).not.toBeNull()
    await client.from('vip_tables').update({ seats: 1 }).eq('id', tableId)
    await client.from('vip_table_guests').delete().eq('guest_id', guestId)
    expect(await tableSeats(tableId)).toBe(4)
    expect(await isSeated(guestId)).toBe(true)
  })
})
