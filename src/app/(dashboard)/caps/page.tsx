import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listInviters, listSideCaps } from '@/server/repositories/inviters-repository'
import { loadDashboardSummary } from '@/server/repositories/dashboard-repository'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CapsForm } from './caps-form'

export default async function CapsPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const supabase = await getServerSupabase()
  const [inviters, sideCaps, summary] = await Promise.all([
    listInviters(supabase),
    listSideCaps(supabase),
    loadDashboardSummary(supabase),
  ])

  const rows = inviters.map((inviter) => {
    const used = summary.inviters.find((row) => row.inviterKey === inviter.key)
    return {
      key: inviter.key as string,
      side: inviter.side as 'fatan' | 'sita',
      akadCap: inviter.akad_cap as number,
      resepsiCap: inviter.resepsi_cap as number,
      akadUsed: used?.akadUsed ?? 0,
      resepsiUsed: used?.resepsiUsed ?? 0,
    }
  })

  const vipCaps = (sideCaps ?? []).map((row) => ({
    side: row.side as 'fatan' | 'sita',
    vipCap: row.vip_cap as number,
    used: summary.sides.find((s) => s.side === row.side)?.vipUsed ?? 0,
  }))

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Caps</h1>
        <p className="text-sm text-muted-foreground">
          The ceiling every over-cap warning is measured against. Admin only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per inviter, per event</CardTitle>
          <CardDescription>
            These sum to the side totals, which sum to the venue totals, so moving one moves every rollup
            above it. Lowering a cap below what is already invited is allowed: it turns that inviter red
            rather than rejecting anybody.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CapsForm inviters={rows} vipCaps={vipCaps} />
        </CardContent>
      </Card>
    </main>
  )
}
