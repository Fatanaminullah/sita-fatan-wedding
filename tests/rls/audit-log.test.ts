// tests/rls/audit-log.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getRemoteConfig,
  getAdminClient,
  createTestUser,
  cleanupTestUser,
  clientAs,
  type RemoteConfig,
  type CreateTestUserInput,
} from './setup'

let config: RemoteConfig
let createdUserIds: string[] = []
let createdAuditLogIds: string[] = []

beforeAll(() => {
  config = getRemoteConfig()
})

afterEach(async () => {
  const admin = getAdminClient(config)
  for (const id of createdAuditLogIds) {
    await admin.from('audit_log').delete().eq('id', id)
  }
  createdAuditLogIds = []
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

async function seedAuditLogRow(admin: SupabaseClient, actorId: string) {
  const { data, error } = await admin
    .from('audit_log')
    .insert({
      actor_id: actorId,
      actor_name: 'Seed Actor',
      actor_role: 'admin',
      action: 'guest.create',
      entity_type: 'guest',
      entity_id: crypto.randomUUID(),
      entity_label: 'Seed Guest',
      diff: { name: { old: null, new: 'Seed Guest' } },
    })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to seed audit_log row: ${error?.message}`)
  createdAuditLogIds.push(data.id)
  return data.id as string
}

describe('audit_log RLS', () => {
  it('admin can read every row, including one logged by someone else', async () => {
    const admin = getAdminClient(config)
    const other = await makeTestUser(admin, {
      email: `audit-other-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const adminUser = await makeTestUser(admin, { email: `audit-admin-${Date.now()}@example.com`, role: 'admin' })
    await seedAuditLogRow(admin, other.userId)
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    const { data, error } = await asAdmin.from('audit_log').select('*')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('inviter cannot read any audit_log row', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `audit-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    await seedAuditLogRow(admin, inviter.userId)
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('audit_log').select('*')
    expect(data).toHaveLength(0)
  })

  it('inviter can insert a row with their own actor_id', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `audit-insert-own-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const entityId = crypto.randomUUID()
    const { error } = await asInviter.from('audit_log').insert({
      actor_id: inviter.userId,
      actor_name: 'Test Inviter',
      actor_role: 'inviter',
      action: 'guest.create',
      entity_type: 'guest',
      entity_id: entityId,
      entity_label: 'Test Guest',
      diff: {},
    })
    // No .select() here: audit_log_admin_read only grants admin SELECT, so a
    // RETURNING clause on this insert would hit that policy and fail with
    // "new row violates row-level security policy" even though the insert
    // itself is allowed. Confirmed empirically against the live project.
    // Look the row up via the admin client instead, purely for cleanup.
    expect(error).toBeNull()
    const { data } = await admin.from('audit_log').select('id').eq('entity_id', entityId).single()
    if (data) createdAuditLogIds.push(data.id)
  })

  it("inviter cannot insert a row with someone else's actor_id", async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `audit-insert-other-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    const other = await makeTestUser(admin, {
      email: `audit-insert-victim-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter.from('audit_log').insert({
      actor_id: other.userId,
      actor_name: 'Test Inviter',
      actor_role: 'inviter',
      action: 'guest.create',
      entity_type: 'guest',
      entity_id: crypto.randomUUID(),
      entity_label: 'Test Guest',
      diff: {},
    })
    expect(error).not.toBeNull()
  })

  it('usher cannot insert or read audit_log rows', async () => {
    const admin = getAdminClient(config)
    const usher = await makeTestUser(admin, { email: `audit-usher-${Date.now()}@example.com`, role: 'usher' })
    await seedAuditLogRow(admin, usher.userId)
    const asUsher = await clientAs(config, usher.email, usher.password)

    const read = await asUsher.from('audit_log').select('*')
    expect(read.data).toHaveLength(0)

    const insert = await asUsher.from('audit_log').insert({
      actor_id: usher.userId,
      actor_name: 'Test Usher',
      actor_role: 'usher',
      action: 'guest.create',
      entity_type: 'guest',
      entity_id: crypto.randomUUID(),
      entity_label: 'Test Guest',
      diff: {},
    })
    expect(insert.error).not.toBeNull()
  })

  it('nobody, including admin, can update or delete a row', async () => {
    const admin = getAdminClient(config)
    const adminUser = await makeTestUser(admin, { email: `audit-noedit-${Date.now()}@example.com`, role: 'admin' })
    const rowId = await seedAuditLogRow(admin, adminUser.userId)
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    const update = await asAdmin.from('audit_log').update({ entity_label: 'Changed' }).eq('id', rowId)
    const afterUpdate = await admin.from('audit_log').select('entity_label').eq('id', rowId).single()
    // RLS denies the row silently (0 rows affected) rather than erroring,
    // same pattern as the inviters cap test in profiles-inviters-side-caps.test.ts.
    expect(afterUpdate.data?.entity_label).toBe('Seed Guest')
    expect(update.error).toBeNull()

    const del = await asAdmin.from('audit_log').delete().eq('id', rowId)
    const afterDelete = await admin.from('audit_log').select('id').eq('id', rowId).maybeSingle()
    expect(afterDelete.data).not.toBeNull()
    expect(del.error).toBeNull()
  })
})
