// tests/rls/checkin-souvenir-wa-sends.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
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
let createdGuestIds: string[] = []

beforeAll(() => {
  config = getRemoteConfig()
})

afterEach(async () => {
  const admin = getAdminClient(config)
  for (const guestId of createdGuestIds) {
    await cleanupGuest(admin, guestId)
  }
  createdGuestIds = []
  for (const userId of createdUserIds) {
    await cleanupTestUser(admin, userId)
  }
  createdUserIds = []
})

async function makeTestUser(admin: SupabaseClient, input: CreateTestUserInput) {
  const user = await createTestUser(admin, input)
  createdUserIds.push(user.userId)
  return user
}

async function makeGuest(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('guests')
    .insert({ name: `WA Guest ${Date.now()}`, pax: 1, side: 'fatan', inviter_key: 'Fatan', type: 'friend' })
    .select()
    .single()
  if (error || !data) throw new Error(`seed failed: ${error?.message}`)
  createdGuestIds.push(data.id)
  return data
}

describe('checkin_events RLS', () => {
  it('usher can insert and read, but not act as admin-only writer for others', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin)
    const usher = await makeTestUser(admin, { email: `ck-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const insert = await asUsher
      .from('checkin_events')
      .insert({ guest_id: guest.id, event: 'resepsi', pax_arrived: 1, checked_in_by: usher.userId })
    expect(insert.error).toBeNull()

    const read = await asUsher.from('checkin_events').select('id').eq('guest_id', guest.id)
    expect(read.data?.length).toBe(1)
  })

  // pax_arrived carries no default on purpose: an arrival with no headcount is
  // not a record of anything, and the venue caps are counted against bodies in
  // the room rather than against what people said weeks earlier.
  it('refuses a check-in that does not say how many arrived', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin)
    const usher = await makeTestUser(admin, { email: `ck-nopax-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const insert = await asUsher
      .from('checkin_events')
      .insert({ guest_id: guest.id, event: 'resepsi', checked_in_by: usher.userId })
    expect(insert.error).not.toBeNull()
  })

  it('refuses a party of zero', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin)
    const usher = await makeTestUser(admin, { email: `ck-zero-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const insert = await asUsher
      .from('checkin_events')
      .insert({ guest_id: guest.id, event: 'resepsi', pax_arrived: 0, checked_in_by: usher.userId })
    expect(insert.error).not.toBeNull()
  })

  // The duplicate scan is deliberately allowed to land: the screen refuses to
  // admit someone twice, and the second row is the record that it was tried.
  it('keeps a second scan of the same guest as a record', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin)
    const usher = await makeTestUser(admin, { email: `ck-dup-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const row = { guest_id: guest.id, event: 'resepsi', pax_arrived: 2, checked_in_by: usher.userId }
    expect((await asUsher.from('checkin_events').insert(row)).error).toBeNull()
    expect((await asUsher.from('checkin_events').insert(row)).error).toBeNull()

    const read = await asUsher.from('checkin_events').select('id').eq('guest_id', guest.id)
    expect(read.data?.length).toBe(2)
  })

  it('does not let an usher undo a check-in', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin)
    const usher = await makeTestUser(admin, { email: `ck-undo-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    await asUsher
      .from('checkin_events')
      .insert({ guest_id: guest.id, event: 'resepsi', pax_arrived: 1, checked_in_by: usher.userId })

    await asUsher.from('checkin_events').delete().eq('guest_id', guest.id)

    // Silent zero-row delete, which is what RLS does rather than raising.
    const read = await asUsher.from('checkin_events').select('id').eq('guest_id', guest.id)
    expect(read.data?.length).toBe(1)
  })

  it('inviter has no access to checkin_events', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `ck-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('checkin_events').select('id')
    expect(data).toHaveLength(0)
  })
})

describe('souvenir_claims RLS', () => {
  it('the UNIQUE(guest_id) constraint rejects a second claim', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin)
    const usher = await makeTestUser(admin, { email: `sv-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const first = await asUsher
      .from('souvenir_claims')
      .insert({ guest_id: guest.id, claimed_by: usher.userId, claimed_via: 'akad_table' })
    expect(first.error).toBeNull()

    const second = await asUsher
      .from('souvenir_claims')
      .insert({ guest_id: guest.id, claimed_by: usher.userId, claimed_via: 'resepsi_scan' })
    expect(second.error).not.toBeNull()
    expect(second.error?.message).toMatch(/duplicate key|unique/i)
  })
})

describe('wa_sends RLS', () => {
  it('inviter can read wa_sends only for their own guests', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin)
    await admin.from('wa_sends').insert({ guest_id: guest.id, kind: 'invite', provider: 'fake' })

    const inviter = await makeTestUser(admin, {
      email: `wa-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('wa_sends').select('id').eq('guest_id', guest.id)
    expect(data?.length).toBe(1)

    const write = await asInviter
      .from('wa_sends')
      .insert({ guest_id: guest.id, kind: 'qr_checkin', provider: 'fake' })
    expect(write.error).not.toBeNull()
  })
})
