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

async function seedTableAndGuest() {
  const admin = getAdminClient(config)
  const table = await admin.from('vip_tables').insert({ name: 'RLS test table', seats: 4, position: 900 }).select().single()
  if (table.error || !table.data) throw new Error(`seed table failed: ${table.error?.message}`)
  createdTableIds.push(table.data.id)
  const guest = await admin
    .from('guests')
    .insert({ name: `Test VIP ${Date.now()}`, pax: 2, side: 'fatan', inviter_key: 'Mama Fatan', type: 'family', is_vip: true })
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

  const outsiders: Omit<CreateTestUserInput, 'email'>[] = [
    { role: 'admin', side: 'fatan' },
    { role: 'inviter', inviterKey: 'Mama Fatan', side: 'fatan' },
    { role: 'usher' },
  ]

  for (const who of outsiders) {
    it(`shows ${who.role} nothing and refuses their writes`, async () => {
      const { tableId, guestId } = await seedTableAndGuest()
      const client = await signIn(who)

      const tables = await client.from('vip_tables').select('id')
      expect(tables.data ?? []).toHaveLength(0)
      const seats = await client.from('vip_table_guests').select('guest_id')
      expect(seats.data ?? []).toHaveLength(0)

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
  }
})
