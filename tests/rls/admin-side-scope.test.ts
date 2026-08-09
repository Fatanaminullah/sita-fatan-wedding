// tests/rls/admin-side-scope.test.ts
//
// The side-scoped admin role (spec 2026-08-09-superadmin-role-design.md):
// full guest management on their own side, blind to the other side, day-of
// tables unscoped, and locked out of audit reads, planner, and cap edits.
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

async function makeSideAdmin(admin: SupabaseClient) {
  const user = await createTestUser(admin, {
    email: `side-admin-${Date.now()}@example.com`,
    role: 'admin',
    side: 'fatan',
  })
  createdUserIds.push(user.userId)
  return clientAs(config, user.email, user.password)
}

async function seedGuest(admin: SupabaseClient, side: 'fatan' | 'sita') {
  const inviterKey = side === 'fatan' ? 'Fatan' : 'Sita'
  const { data, error } = await admin
    .from('guests')
    .insert({ name: `Side Scope ${side} ${Date.now()}`, pax: 1, side, inviter_key: inviterKey, type: 'friend' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to seed ${side} guest: ${error?.message}`)
  createdGuestIds.push(data.id)
  return data.id
}

describe('admin side scoping on guests', () => {
  it('can create, read and update a guest on their own side', async () => {
    const admin = getAdminClient(config)
    const asAdmin = await makeSideAdmin(admin)

    const { data: created, error: insertError } = await asAdmin
      .from('guests')
      .insert({ name: `Own Side ${Date.now()}`, pax: 2, side: 'fatan', inviter_key: 'Mama Fatan', type: 'family' })
      .select('id')
      .single()
    expect(insertError).toBeNull()
    createdGuestIds.push(created!.id)

    const { error: updateError } = await asAdmin.from('guests').update({ pax: 3 }).eq('id', created!.id)
    expect(updateError).toBeNull()

    const { data: readBack } = await asAdmin.from('guests').select('pax').eq('id', created!.id).single()
    expect(readBack?.pax).toBe(3)
  })

  it('cannot read or write a guest on the other side', async () => {
    const admin = getAdminClient(config)
    const sitaGuestId = await seedGuest(admin, 'sita')
    const asAdmin = await makeSideAdmin(admin)

    const read = await asAdmin.from('guests').select('id').eq('id', sitaGuestId)
    expect(read.data).toHaveLength(0)

    await asAdmin.from('guests').update({ pax: 9 }).eq('id', sitaGuestId)
    const check = await admin.from('guests').select('pax').eq('id', sitaGuestId).single()
    expect(check.data?.pax).toBe(1)
  })

  it('cannot create a guest on the other side', async () => {
    const admin = getAdminClient(config)
    const asAdmin = await makeSideAdmin(admin)

    const { data, error } = await asAdmin
      .from('guests')
      .insert({ name: `Cross Side ${Date.now()}`, pax: 1, side: 'sita', inviter_key: 'Sita', type: 'friend' })
      .select('id')
      .single()
    if (data) createdGuestIds.push(data.id)
    expect(error).not.toBeNull()
  })
})

describe('admin exclusions', () => {
  it('cannot read audit_log, while its own audit insert still lands', async () => {
    const admin = getAdminClient(config)
    const user = await createTestUser(admin, {
      email: `side-admin-audit-${Date.now()}@example.com`,
      role: 'admin',
      side: 'fatan',
    })
    createdUserIds.push(user.userId)
    const asAdmin = await clientAs(config, user.email, user.password)

    const { error: insertError } = await asAdmin.from('audit_log').insert({
      actor_id: user.userId,
      actor_name: user.email,
      actor_role: 'admin',
      action: 'guest.update',
      entity_type: 'guest',
      entity_id: crypto.randomUUID(),
      entity_label: 'RLS side-scope probe',
      diff: {},
    })
    expect(insertError).toBeNull()

    const read = await asAdmin.from('audit_log').select('id')
    expect(read.data).toHaveLength(0)
  })

  it('cannot read planner_tasks', async () => {
    const admin = getAdminClient(config)
    const asAdmin = await makeSideAdmin(admin)
    const { data } = await asAdmin.from('planner_tasks').select('id')
    expect(data).toHaveLength(0)
  })

  it('cannot update side_caps', async () => {
    const admin = getAdminClient(config)
    const before = await admin.from('side_caps').select('vip_cap').eq('side', 'fatan').single()
    const asAdmin = await makeSideAdmin(admin)

    await asAdmin.from('side_caps').update({ vip_cap: 99 }).eq('side', 'fatan')
    const check = await admin.from('side_caps').select('vip_cap').eq('side', 'fatan').single()
    expect(check.data?.vip_cap).toBe(before.data?.vip_cap)
  })

  it('can insert a checkin event for a guest on either side (day-of is unscoped)', async () => {
    const admin = getAdminClient(config)
    const sitaGuestId = await seedGuest(admin, 'sita')
    const user = await createTestUser(admin, {
      email: `side-admin-checkin-${Date.now()}@example.com`,
      role: 'admin',
      side: 'fatan',
    })
    createdUserIds.push(user.userId)
    const asAdmin = await clientAs(config, user.email, user.password)

    const { error } = await asAdmin
      .from('checkin_events')
      .insert({ guest_id: sitaGuestId, event: 'resepsi', checked_in_by: user.userId })
    expect(error).toBeNull()
  })
})
