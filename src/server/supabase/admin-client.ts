import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env'

/**
 * Bypasses RLS entirely. Restricted to scripts/import-sheet.ts in this plan
 * (Phase 2 adds the unauthenticated /rsvp/[token] route as the only other caller).
 * Never call this from a route that renders for a logged-in user.
 */
export function getAdminSupabase() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
