// tests/rls/profiles-inviters-side-caps.test.ts
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

beforeAll(() => {
  config = getRemoteConfig()
})

afterEach(async () => {
  const admin = getAdminClient(config)
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

describe('profiles RLS', () => {
  it('admin can read another user\'s profile row', async () => {
    const admin = getAdminClient(config)
    const other = await makeTestUser(admin, { email: `other-${Date.now()}@example.com`, role: 'viewer' })
    const adminUser = await makeTestUser(admin, { email: `admin-${Date.now()}@example.com`, role: 'admin' })
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    const { data, error } = await asAdmin.from('profiles').select('*').eq('user_id', other.userId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('inviter can read only their own profile row', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const other = await makeTestUser(admin, { email: `other2-${Date.now()}@example.com`, role: 'viewer' })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const own = await asInviter.from('profiles').select('*').eq('user_id', inviter.userId)
    expect(own.data).toHaveLength(1)

    const others = await asInviter.from('profiles').select('*').eq('user_id', other.userId)
    expect(others.data).toHaveLength(0)
  })
})

describe('inviters RLS', () => {
  it('usher cannot read inviters', async () => {
    const admin = getAdminClient(config)
    const usher = await makeTestUser(admin, { email: `usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data } = await asUsher.from('inviters').select('*')
    expect(data).toHaveLength(0)
  })

  it('viewer can read all inviters', async () => {
    const admin = getAdminClient(config)
    const viewer = await makeTestUser(admin, { email: `viewer-${Date.now()}@example.com`, role: 'viewer' })
    const asViewer = await clientAs(config, viewer.email, viewer.password)

    const { data } = await asViewer.from('inviters').select('*')
    expect(data?.length).toBe(6)
  })

  it('inviter cannot write to inviters', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `inviter2-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter.from('inviters').update({ akad_cap: 999 }).eq('key', 'Sita')
    // RLS denies the row silently (0 rows affected) rather than erroring —
    // assert nothing actually changed.
    const check = await getAdminClient(config).from('inviters').select('akad_cap').eq('key', 'Sita').single()
    expect(check.data?.akad_cap).toBe(20)
    expect(error).toBeNull()
  })
})

describe('side_caps RLS', () => {
  it('admin can update vip_cap', async () => {
    const admin = getAdminClient(config)
    const adminUser = await makeTestUser(admin, { email: `admin2-${Date.now()}@example.com`, role: 'admin' })
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    // this test mutates a real, shared seed row on the real project — always
    // restore it, even if an assertion throws partway through
    try {
      const { error } = await asAdmin.from('side_caps').update({ vip_cap: 30 }).eq('side', 'fatan')
      expect(error).toBeNull()

      const check = await admin.from('side_caps').select('vip_cap').eq('side', 'fatan').single()
      expect(check.data?.vip_cap).toBe(30)
    } finally {
      await admin.from('side_caps').update({ vip_cap: 25 }).eq('side', 'fatan')
    }
  })
})
