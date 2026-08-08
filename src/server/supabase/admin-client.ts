import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env'

/**
 * Bypasses RLS entirely. Restricted to four callers (see CLAUDE.md's
 * Environment section): scripts/import-sheet.ts, scripts/import-planner.ts,
 * src/server/actions/user-actions.ts (every exported action there starts
 * with requireAdmin() before reaching this), and the unauthenticated
 * /rsvp/[token] route once Phase 2 adds it. Never call this from a route
 * that renders for a logged-in user.
 */
export function getAdminSupabase() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
