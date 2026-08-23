import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env'

/**
 * Bypasses RLS entirely.
 *
 * Exactly one runtime caller: src/server/actions/user-actions.ts, where every
 * exported action starts with requireAdmin() before reaching this. Everything
 * else that holds the key is an operational script run by hand
 * (import-sheet, import-planner, create-user, seed-staging,
 * seed-staging-people) or the RLS test harness.
 *
 * CLAUDE.md's fourth sanctioned slot is the unauthenticated /rsvp/[token]
 * route. That route was never built. The public guest page that shipped
 * instead, /to/[slug], deliberately declined the key and reads through the
 * SECURITY DEFINER function guest_by_public_slug on the publishable key.
 * /api/whatsapp/webhook follows the same precedent for writes, via
 * wa_webhook_record_message and wa_webhook_record_status.
 *
 * That precedent is the rule now: a public route gets a narrow definer
 * function, never this client. Never call this from a route that renders for
 * a logged-in user.
 */
export function getAdminSupabase() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
