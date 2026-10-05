// tests/rls/envelopes.test.ts
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
let createdGuestIds: string[] = []
let createdEnvelopeCodes: string[] = []

beforeAll(() => {
  config = getRemoteConfig()
})

// Only what this file created.
afterEach(async () => {
  const admin = getAdminClient(config)
  for (const code of createdEnvelopeCodes) await admin.from('envelopes').delete().eq('code', code)
  createdEnvelopeCodes = []
  for (const id of createdGuestIds) {
    await admin.from('envelopes').delete().eq('guest_id', id)
    await cleanupGuest(admin, id)
  }
  createdGuestIds = []
  for (const id of createdUserIds) await cleanupTestUser(admin, id)
  createdUserIds = []
})

async function signIn(input: Omit<CreateTestUserInput, 'email'>) {
  const admin = getAdminClient(config)
  const user = await createTestUser(admin, { ...input, email: `env-${input.role}-${crypto.randomUUID()}@test.local` })
  createdUserIds.push(user.userId)
  return { client: await clientAs(config, user.email, user.password), userId: user.userId }
}

async function seedGuest({ checkedInBy }: { checkedInBy: string | null }) {
  const admin = getAdminClient(config)
  const guest = await admin
    .from('guests')
    .insert({ name: `Test Envelope Guest ${Date.now()}`, pax: 2, side: 'sita', inviter_key: 'Mama Sita', type: 'family' })
    .select()
    .single()
  if (guest.error || !guest.data) throw new Error(`seed guest failed: ${guest.error?.message}`)
  createdGuestIds.push(guest.data.id)
  if (checkedInBy) {
    const checkin = await admin
      .from('checkin_events')
      .insert({ guest_id: guest.data.id, event: 'resepsi', pax_arrived: 2, checked_in_by: checkedInBy })
    if (checkin.error) throw new Error(`seed check-in failed: ${checkin.error.message}`)
  }
  return guest.data.id as string
}

describe('envelopes', () => {
  it('lets an usher print a label for a checked-in guest, and a reprint keeps the code', async () => {
    const { client, userId } = await signIn({ role: 'usher' })
    const guestId = await seedGuest({ checkedInBy: userId })

    const first = await client.rpc('issue_envelope_label', { p_guest_id: guestId })
    expect(first.error).toBeNull()
    const code = first.data?.[0]?.code as string
    expect(code).toMatch(/^S-\d{4,}$/)

    const again = await client.rpc('issue_envelope_label', { p_guest_id: guestId })
    expect(again.data?.[0]?.code).toBe(code)
  })

  it('refuses a label for a guest who has not been checked in', async () => {
    const { client } = await signIn({ role: 'usher' })
    const guestId = await seedGuest({ checkedInBy: null })
    const result = await client.rpc('issue_envelope_label', { p_guest_id: guestId })
    expect(result.error?.message).toMatch(/not been checked in/)
  })

  it('gives an envelope from someone not on the list a U- code', async () => {
    const { client } = await signIn({ role: 'usher' })
    const result = await client.rpc('issue_unlisted_envelope_label', { p_name: 'Invented Colleague' })
    expect(result.error).toBeNull()
    const code = result.data?.[0]?.code as string
    createdEnvelopeCodes.push(code)
    expect(code).toMatch(/^U-\d{4,}$/)
  })

  it('shows the usher no envelopes and no amounts', async () => {
    const { client, userId } = await signIn({ role: 'usher' })
    const guestId = await seedGuest({ checkedInBy: userId })
    await getAdminClient(config).from('envelopes').insert({ guest_id: guestId, name: 'x', amount: 500000 })
    const rows = await client.from('envelopes').select('amount').eq('guest_id', guestId)
    expect(rows.data ?? []).toHaveLength(0)
  })

  it('lets the couple read and record amounts', async () => {
    const { client, userId } = await signIn({ role: 'superadmin' })
    const guestId = await seedGuest({ checkedInBy: userId })
    const admin = getAdminClient(config)
    const inserted = await admin.from('envelopes').insert({ guest_id: guestId, name: 'x' }).select('id').single()

    const update = await client.from('envelopes').update({ amount: 750000 }).eq('id', inserted.data!.id).select('amount')
    expect(update.error).toBeNull()
    expect(update.data?.[0]?.amount).toBe(750000)
  })

  const outsiders: Omit<CreateTestUserInput, 'email'>[] = [
    { role: 'admin', side: 'sita' },
    { role: 'inviter', inviterKey: 'Mama Sita', side: 'sita' },
    { role: 'viewer' },
  ]
  for (const who of outsiders) {
    it(`shows ${who.role} no amounts`, async () => {
      const { client, userId } = await signIn(who)
      const guestId = await seedGuest({ checkedInBy: userId })
      await getAdminClient(config).from('envelopes').insert({ guest_id: guestId, name: 'x', amount: 500000 })
      const rows = await client.from('envelopes').select('amount').eq('guest_id', guestId)
      expect(rows.data ?? []).toHaveLength(0)
    })
  }

  it('refuses labels to roles that do not work a door', async () => {
    const { client, userId } = await signIn({ role: 'viewer' })
    const guestId = await seedGuest({ checkedInBy: userId })
    const result = await client.rpc('issue_envelope_label', { p_guest_id: guestId })
    expect(result.error?.message).toMatch(/door staff/)
  })
})
