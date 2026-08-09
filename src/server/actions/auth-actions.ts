'use server'

import { redirect } from 'next/navigation'
import { looksLikeEmail, normalizeUsername } from '@/domain/username'
import { getServerSupabase } from '../supabase/server-client'

/**
 * Accepts either identifier. Supabase password auth is email-only, so a
 * username is resolved to its address first through `email_for_username`, a
 * narrow security definer function (the caller has no session yet, so nothing
 * RLS-scoped is available here).
 */
export async function signIn(formData: FormData) {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const wrong = { error: 'Username or password is wrong.' }

  if (!identifier || !password) return wrong

  const supabase = await getServerSupabase()

  let email = identifier
  if (!looksLikeEmail(identifier)) {
    const { data, error } = await supabase.rpc('email_for_username', {
      p_username: normalizeUsername(identifier),
    })
    if (error || !data) return wrong
    email = data
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return wrong
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await getServerSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}

export type CurrentProfile = {
  userId: string
  fullName: string
  role: 'superadmin' | 'admin' | 'inviter' | 'usher' | 'viewer'
  inviterKey: string | null
  side: 'fatan' | 'sita' | null
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await getServerSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, full_name, role, inviter_key, side')
    .eq('user_id', auth.user.id)
    .single()
  if (!profile) return null

  return {
    userId: profile.user_id,
    fullName: profile.full_name,
    role: profile.role,
    inviterKey: profile.inviter_key,
    side: profile.side,
  }
}
