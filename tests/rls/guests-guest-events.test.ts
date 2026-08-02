// tests/rls/guests-guest-events.test.ts
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

async function makeGuest(admin: SupabaseClient, inviterKey: string, side: 'fatan' | 'sita') {
  const { data, error } = await admin
    .from('guests')
    .insert({ name: `Test Guest ${Date.now()}`, pax: 2, side, inviter_key: inviterKey, type: 'family' })
    .select()
    .single()
  if (error || !data) throw new Error(`seed failed: ${error?.message}`)
  createdGuestIds.push(data.id)
  return data
}

describe('guests RLS', () => {
  it('inviter sees only their own guests', async () => {
    const admin = getAdminClient(config)
    const mine = await makeGuest(admin, 'Fatan', 'fatan')
    const notMine = await makeGuest(admin, 'Sita', 'sita')
    const inviter = await makeTestUser(admin, {
      email: `g-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('guests').select('id')
    const ids = data?.map((g) => g.id) ?? []
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(notMine.id)
  })

  it('inviter cannot insert a guest under another inviter_key', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `g-inviter2-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Mama Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data, error } = await asInviter
      .from('guests')
      .insert({ name: 'Sneaky', pax: 1, side: 'fatan', inviter_key: 'Papa Fatan', type: 'friend' })
      .select()
      .single()

    expect(error).not.toBeNull()
    if (data) createdGuestIds.push(data.id) // shouldn't happen, but track just in case RLS didn't block it
  })

  it('viewer can read all guests but cannot write', async () => {
    const admin = getAdminClient(config)
    await makeGuest(admin, 'Papa Sita', 'sita')
    const viewer = await makeTestUser(admin, { email: `g-viewer-${Date.now()}@example.com`, role: 'viewer' })
    const asViewer = await clientAs(config, viewer.email, viewer.password)

    const read = await asViewer.from('guests').select('id')
    expect(read.data?.length).toBeGreaterThan(0)

    const write = await asViewer
      .from('guests')
      .insert({ name: 'Should Fail', pax: 1, side: 'sita', inviter_key: 'Papa Sita', type: 'friend' })
    expect(write.error).not.toBeNull()
  })

  it('usher has no direct guest-list read', async () => {
    const admin = getAdminClient(config)
    await makeGuest(admin, 'Fatan', 'fatan')
    const usher = await makeTestUser(admin, { email: `g-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data } = await asUsher.from('guests').select('id')
    expect(data).toHaveLength(0)
  })
})

describe('guest_events RLS', () => {
  it('inviter can manage events on their own guest', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin, 'Sita', 'sita')
    const inviter = await makeTestUser(admin, {
      email: `ge-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter
      .from('guest_events')
      .insert({ guest_id: guest.id, event: 'akad', invite_status: 'confirmed' })
    expect(error).toBeNull()
  })

  it('inviter cannot manage events on another inviter\'s guest', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin, 'Mama Sita', 'sita')
    const inviter = await makeTestUser(admin, {
      email: `ge-inviter2-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Papa Sita',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter
      .from('guest_events')
      .insert({ guest_id: guest.id, event: 'resepsi', invite_status: 'confirmed' })
    expect(error).not.toBeNull()
  })

  it('the pax_confirmed trigger rejects a value above invited pax', async () => {
    const admin = getAdminClient(config)
    const guest = await makeGuest(admin, 'Fatan', 'fatan') // pax = 2
    const { error } = await admin
      .from('guest_events')
      .insert({ guest_id: guest.id, event: 'resepsi', pax_confirmed: 5 })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('exceeds invited pax')
  })
})
