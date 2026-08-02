// tests/rls/setup.ts
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireEnv } from '@/server/supabase/env'

export type RemoteConfig = {
  url: string
  publishableKey: string
  adminKey: string
}

export function getRemoteConfig(): RemoteConfig {
  return {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    publishableKey: requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    adminKey: requireEnv('SUPABASE_SECRET_KEY'),
  }
}

export type TestRole = 'admin' | 'inviter' | 'usher' | 'viewer'

export type CreateTestUserInput = {
  email: string
  role: TestRole
  inviterKey?: string
  side?: 'fatan' | 'sita'
}

const TEST_PASSWORD = 'rls-test-password-only'

export async function createTestUser(admin: SupabaseClient, input: CreateTestUserInput) {
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${input.email}: ${error?.message}`)
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    full_name: input.email,
    role: input.role,
    inviter_key: input.inviterKey ?? null,
    side: input.side ?? null,
  })
  if (profileError) {
    // roll back the orphaned auth user rather than leaving it behind
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`Failed to create profile for ${input.email}: ${profileError.message}`)
  }

  return { userId: data.user.id, email: input.email, password: TEST_PASSWORD }
}

/**
 * Call in afterEach for every user createTestUser created. Deleting the
 * auth user cascades to the profiles row (ON DELETE CASCADE, Task 4's
 * migration) — nothing else to clean up per user.
 */
export async function cleanupTestUser(admin: SupabaseClient, userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    throw new Error(`Failed to clean up test user ${userId}: ${error.message}`)
  }
}

/**
 * Call in afterEach for every guest a test seeded directly (not via a
 * user). checkin_events/souvenir_claims/wa_sends reference guest_id
 * without ON DELETE CASCADE (Task 6's migration), so their rows must be
 * removed before the guest — guest_events cascades automatically.
 */
export async function cleanupGuest(admin: SupabaseClient, guestId: string) {
  await admin.from('checkin_events').delete().eq('guest_id', guestId)
  await admin.from('souvenir_claims').delete().eq('guest_id', guestId)
  await admin.from('wa_sends').delete().eq('guest_id', guestId)
  const { error } = await admin.from('guests').delete().eq('id', guestId)
  if (error) {
    throw new Error(`Failed to clean up test guest ${guestId}: ${error.message}`)
  }
}

export async function clientAs(config: RemoteConfig, email: string, password: string) {
  const client = createClient(config.url, config.publishableKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  }
  return client
}

export function getAdminClient(config: RemoteConfig) {
  return createClient(config.url, config.adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
