// tests/rls/door-functions.test.ts
//
// The two SECURITY DEFINER functions the door reads through.
//
// They bypass RLS by definition, so their own role guard is the only access
// control they have. The first version of that guard used
// `current_profile_role() not in (...)`, which evaluates to NULL for a caller
// with no profile row and let the call through. These tests exist so that
// cannot come back quietly.
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

/** A guest confirmed for the Resepsi, with a phone and a note to leak. */
async function makeDoorGuest(admin: SupabaseClient, over: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from('guests')
    .insert({
      name: `Door Guest ${Date.now()}`,
      pax: 2,
      side: 'fatan',
      inviter_key: 'Fatan',
      type: 'friend',
      phone: '+628110009999',
      note: 'internal note, not for the guest',
      ...over,
    })
    .select()
    .single()
  if (error || !data) throw new Error(`seed failed: ${error?.message}`)
  createdGuestIds.push(data.id)

  const ev = await admin
    .from('guest_events')
    .insert({ guest_id: data.id, event: 'resepsi', invite_status: 'confirmed' })
  if (ev.error) throw new Error(`seed event failed: ${ev.error.message}`)

  return data
}

describe('guest_by_rsvp_token', () => {
  it('resolves one guest for an usher', async () => {
    const admin = getAdminClient(config)
    const guest = await makeDoorGuest(admin)
    const usher = await makeTestUser(admin, { email: `dr-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data, error } = await asUsher.rpc('guest_by_rsvp_token', {
      p_token: guest.rsvp_token,
      p_event: 'resepsi',
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe(guest.name)
  })

  it('never returns a phone number or an internal note', async () => {
    const admin = getAdminClient(config)
    const guest = await makeDoorGuest(admin)
    const usher = await makeTestUser(admin, { email: `dr-cols-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data } = await asUsher.rpc('guest_by_rsvp_token', {
      p_token: guest.rsvp_token,
      p_event: 'resepsi',
    })
    const row = data[0]
    expect(row).not.toHaveProperty('phone')
    expect(row).not.toHaveProperty('note')
    expect(row).not.toHaveProperty('rsvp_token')
    expect(row).not.toHaveProperty('public_slug')
  })

  it('refuses an inviter', async () => {
    const admin = getAdminClient(config)
    const guest = await makeDoorGuest(admin)
    const inviter = await makeTestUser(admin, {
      email: `dr-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter.rpc('guest_by_rsvp_token', {
      p_token: guest.rsvp_token,
      p_event: 'resepsi',
    })
    expect(error).not.toBeNull()
  })

  it('refuses a viewer', async () => {
    const admin = getAdminClient(config)
    const guest = await makeDoorGuest(admin)
    const viewer = await makeTestUser(admin, { email: `dr-viewer-${Date.now()}@example.com`, role: 'viewer' })
    const asViewer = await clientAs(config, viewer.email, viewer.password)

    const { error } = await asViewer.rpc('guest_by_rsvp_token', {
      p_token: guest.rsvp_token,
      p_event: 'resepsi',
    })
    expect(error).not.toBeNull()
  })

  it('returns nothing for an unknown ticket', async () => {
    const admin = getAdminClient(config)
    const usher = await makeTestUser(admin, { email: `dr-unknown-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data, error } = await asUsher.rpc('guest_by_rsvp_token', {
      p_token: '00000000-0000-4000-8000-000000000000',
      p_event: 'resepsi',
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('returns the guest with a null invite status at a door they were not invited to', async () => {
    const admin = getAdminClient(config)
    const guest = await makeDoorGuest(admin)
    const usher = await makeTestUser(admin, { email: `dr-wrong-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    // Seeded for the Resepsi only, scanned at the Akad.
    const { data } = await asUsher.rpc('guest_by_rsvp_token', {
      p_token: guest.rsvp_token,
      p_event: 'akad',
    })
    expect(data).toHaveLength(1)
    expect(data[0].invite_status).toBeNull()
  })
})

describe('guest_roster_for_event', () => {
  it('lets an usher find a guest by name', async () => {
    const admin = getAdminClient(config)
    const guest = await makeDoorGuest(admin)
    const usher = await makeTestUser(admin, { email: `rs-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data, error } = await asUsher.rpc('guest_roster_for_event', {
      p_event: 'resepsi',
      p_query: guest.name,
    })
    expect(error).toBeNull()
    expect(data.map((r: { name: string }) => r.name)).toContain(guest.name)
  })

  it('never returns a phone number or an internal note', async () => {
    const admin = getAdminClient(config)
    const guest = await makeDoorGuest(admin)
    const usher = await makeTestUser(admin, { email: `rs-cols-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data } = await asUsher.rpc('guest_roster_for_event', {
      p_event: 'resepsi',
      p_query: guest.name,
    })
    expect(data[0]).not.toHaveProperty('phone')
    expect(data[0]).not.toHaveProperty('note')
  })

  it('still refuses an inviter, who has their own scoped guest list', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `rs-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter.rpc('guest_roster_for_event', {
      p_event: 'resepsi',
      p_query: null,
    })
    expect(error).not.toBeNull()
  })

  it('leaves the guests table itself shut to an usher', async () => {
    const admin = getAdminClient(config)
    await makeDoorGuest(admin)
    const usher = await makeTestUser(admin, { email: `rs-table-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    // The whole point of routing the roster through a function: the table
    // stays closed, so `phone` and `note` are unreachable rather than merely
    // unselected.
    const { data } = await asUsher.from('guests').select('id')
    expect(data).toHaveLength(0)
  })
})
