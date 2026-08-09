'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { getCurrentProfile } from './auth-actions'
import {
  listInviters,
  listSideCaps,
  updateInviterCaps,
  updateSidePhysicalCap,
  updateSideVipCap,
} from '../repositories/inviters-repository'
import { buildDiff } from '@/domain/audit'
import { insertAuditLog } from '../repositories/audit-log-repository'

/**
 * Caps are the ceiling every warning on the dashboard is measured against, so
 * only an admin moves them. RLS says the same thing (inviters_admin_all); this
 * check is here so a non-admin gets a sentence instead of a silent no-op.
 */
async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'superadmin') return null
  return profile
}

function parseCap(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

export async function saveCaps(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only the couple can change caps.' }

  const supabase = await getServerSupabase()
  const inviterKeys = formData.getAll('inviterKey').map(String)

  const beforeInviters = await listInviters(supabase)
  const beforeSideCaps = await listSideCaps(supabase)

  for (const key of inviterKeys) {
    const akadCap = parseCap(formData.get(`akadCap:${key}`))
    const resepsiCap = parseCap(formData.get(`resepsiCap:${key}`))
    if (akadCap === null || resepsiCap === null) {
      return { error: `Caps for ${key} must be whole numbers, zero or above.` }
    }
    await updateInviterCaps(supabase, key, { akadCap, resepsiCap })

    const before = beforeInviters?.find((row) => row.key === key)
    const diff = buildDiff(
      before ? { akad_cap: before.akad_cap, resepsi_cap: before.resepsi_cap } : null,
      { akad_cap: akadCap, resepsi_cap: resepsiCap },
      ['akad_cap', 'resepsi_cap']
    )
    if (Object.keys(diff).length > 0) {
      await insertAuditLog(supabase, {
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'caps.update',
        entityType: 'inviter_caps',
        entityId: key,
        entityLabel: key,
        diff,
      })
    }
  }

  for (const side of ['fatan', 'sita'] as const) {
    const vipCap = parseCap(formData.get(`vipCap:${side}`))
    if (vipCap === null) return { error: `VIP cap for the ${side} side must be a whole number.` }
    const physicalCap = parseCap(formData.get(`physicalCap:${side}`))
    if (physicalCap === null) {
      return { error: `Printed invitation cap for the ${side} side must be a whole number.` }
    }
    await updateSideVipCap(supabase, side, vipCap)
    await updateSidePhysicalCap(supabase, side, physicalCap)

    const before = beforeSideCaps?.find((row) => row.side === side)
    const diff = buildDiff(
      before ? { vip_cap: before.vip_cap, physical_cap: before.physical_cap } : null,
      { vip_cap: vipCap, physical_cap: physicalCap },
      ['vip_cap', 'physical_cap']
    )
    if (Object.keys(diff).length > 0) {
      await insertAuditLog(supabase, {
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'caps.update',
        entityType: 'side_caps',
        entityId: side,
        entityLabel: `${side} side`,
        diff,
      })
    }
  }

  revalidatePath('/caps')
  revalidatePath('/dashboard')
  return { ok: true }
}
