// tests/rls/physical-invitation-counts.test.ts
//
// physical_invitation_counts() is security definer: it must give an
// inviter-role client the printed-card count for the WHOLE side, including
// guests their RLS view cannot see. If this test starts failing with a
// too-low count, the function has lost its definer property and every
// inviter's shared-pool warning is silently wrong.
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
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

describe('physical_invitation_counts definer function', () => {
  it('gives an inviter the full-side count, beyond their own RLS-visible guests', async () => {
    const admin = getAdminClient(config)

    // A physical-invitation guest belonging to a DIFFERENT inviter on the
    // fatan side, invisible to the test inviter through guests RLS.
    const { data: otherGuest, error: insertError } = await admin
      .from('guests')
      .insert({
        name: `RLS Physical Count Probe ${Date.now()}`,
        pax: 2,
        side: 'fatan',
        inviter_key: 'Mama Fatan',
        type: 'friend',
        is_physical_invitation: true,
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()
    createdGuestIds.push(otherGuest!.id)

    const baseline = await admin.rpc('physical_invitation_counts')
    expect(baseline.error).toBeNull()
    const fatanTotal = Number(
      (baseline.data as Array<{ side: string; used: number }>).find((row) => row.side === 'fatan')?.used ?? 0
    )
    expect(fatanTotal).toBeGreaterThanOrEqual(1)

    const inviter = await createTestUser(admin, {
      email: `inviter-physical-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    createdUserIds.push(inviter.userId)
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    // Sanity: the probe guest really is invisible to this inviter directly.
    const direct = await asInviter.from('guests').select('id').eq('id', otherGuest!.id)
    expect(direct.data).toHaveLength(0)

    // The definer function still counts it.
    const counts = await asInviter.rpc('physical_invitation_counts')
    expect(counts.error).toBeNull()
    const inviterSeesFatan = Number(
      (counts.data as Array<{ side: string; used: number }>).find((row) => row.side === 'fatan')?.used ?? 0
    )
    expect(inviterSeesFatan).toBe(fatanTotal)
  })
})
