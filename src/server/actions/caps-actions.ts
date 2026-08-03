'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { getCurrentProfile } from './auth-actions'
import { updateInviterCaps, updateSideVipCap } from '../repositories/inviters-repository'

/**
 * Caps are the ceiling every warning on the dashboard is measured against, so
 * only an admin moves them. RLS says the same thing (inviters_admin_all); this
 * check is here so a non-admin gets a sentence instead of a silent no-op.
 */
async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') return null
  return profile
}

function parseCap(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

export async function saveCaps(formData: FormData): Promise<{ error: string } | { ok: true }> {
  if (!(await requireAdmin())) return { error: 'Only an admin can change caps.' }

  const supabase = await getServerSupabase()
  const inviterKeys = formData.getAll('inviterKey').map(String)

  for (const key of inviterKeys) {
    const akadCap = parseCap(formData.get(`akadCap:${key}`))
    const resepsiCap = parseCap(formData.get(`resepsiCap:${key}`))
    if (akadCap === null || resepsiCap === null) {
      return { error: `Caps for ${key} must be whole numbers, zero or above.` }
    }
    await updateInviterCaps(supabase, key, { akadCap, resepsiCap })
  }

  for (const side of ['fatan', 'sita'] as const) {
    const vipCap = parseCap(formData.get(`vipCap:${side}`))
    if (vipCap === null) return { error: `VIP cap for the ${side} side must be a whole number.` }
    await updateSideVipCap(supabase, side, vipCap)
  }

  revalidatePath('/caps')
  revalidatePath('/dashboard')
  return { ok: true }
}
