'use server'

import { redirect } from 'next/navigation'
import { getServerSupabase } from '../supabase/server-client'

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await getServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: 'Email or password is wrong.' }
  }
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await getServerSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}

export type CurrentProfile = {
  userId: string
  role: 'admin' | 'inviter' | 'usher' | 'viewer'
  inviterKey: string | null
  side: 'fatan' | 'sita' | null
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await getServerSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, role, inviter_key, side')
    .eq('user_id', auth.user.id)
    .single()
  if (!profile) return null

  return {
    userId: profile.user_id,
    role: profile.role,
    inviterKey: profile.inviter_key,
    side: profile.side,
  }
}
