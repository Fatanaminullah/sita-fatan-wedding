import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listAuditLog } from '@/server/repositories/audit-log-repository'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ENTITY_TYPES = ['guest', 'inviter_caps', 'side_caps', 'guest_event', 'user'] as const

const fieldClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; actor?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const { entityType, actor } = await searchParams
  const supabase = await getServerSupabase()
  const rows = await listAuditLog(supabase, { entityType, actorName: actor })
  const actors = Array.from(new Set(rows.map((row) => row.actorName))).sort()

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Every guest, cap, account and waitlist-promotion change. Read-only: nothing here can be edited or removed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rows.length} entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="entityType" className="text-xs text-muted-foreground">
                Entity
              </label>
              <select id="entityType" name="entityType" defaultValue={entityType ?? ''} className={fieldClass}>
                <option value="">All</option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="actor" className="text-xs text-muted-foreground">
                Actor
              </label>
              <select id="actor" name="actor" defaultValue={actor ?? ''} className={fieldClass}>
                <option value="">All</option>
                {actors.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="h-9 rounded-md border px-3 text-sm">
              Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries match this filter.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.entityLabel}</span>
                      <Badge variant="secondary">{row.action}</Badge>
                      <span className="text-muted-foreground">
                        by {row.actorName} ({row.actorRole})
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
                  </div>
                  {Object.keys(row.diff).length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        {Object.keys(row.diff).length} field(s) changed
                      </summary>
                      <ul className="mt-1 ml-4 space-y-0.5 text-xs text-muted-foreground">
                        {Object.entries(row.diff).map(([field, change]) => (
                          <li key={field}>
                            <span className="font-mono">{field}</span>: {String(change.old)} to{' '}
                            {String(change.new)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
