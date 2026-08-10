'use client'

import { inviterLabel } from '@/lib/inviter-label'

export type InviterCaps = { key: string; akadCap: number; resepsiCap: number }

export type CapacityRow = InviterCaps & { akadUsed: number; resepsiUsed: number }

function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const over = used > cap
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
  const left = cap - used

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={`whitespace-nowrap tabular-nums ${over ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
        >
          {used} / {cap}
          {/* Never-Color-Alone: the overflow is named in words, not only in red. */}
          <span className="ml-1">{over ? `(${used - cap} over)` : `(${left} left)`}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: over ? 'var(--destructive)' : 'var(--chart-1)' }}
        />
      </div>
    </div>
  )
}

/**
 * The same capacity truth the dashboard shows, small enough to sit above the
 * table while someone edits down the Akad and Resepsi columns. Counts are
 * computed by the caller from the rows already on screen, so a saved inline
 * edit moves the meter immediately instead of at the next full reload.
 */
export function CapacityStrip({ rows }: { rows: CapacityRow[] }) {
  if (rows.length === 0) return null

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-xs font-medium text-muted-foreground">Capacity, confirmed pax against cap</p>
      {/* One inviter (the inviter role's own view) gets the full width, so the
          two meters are a true half each. An admin sees six and needs the
          columns, or the pinned block eats the screen. */}
      <div className={`grid gap-x-8 gap-y-3 ${rows.length > 1 ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`}>
        {rows.map((row) => (
          <div key={row.key} className="space-y-1.5">
            <p className="text-sm font-medium">{inviterLabel(row.key)}</p>
            {/* Side by side: the two events are read together, and stacking
                them costs vertical space this block cannot spend once it is
                pinned to the top of the screen in edit mode. */}
            <div className="grid grid-cols-2 gap-x-4">
              <Meter label="Akad" used={row.akadUsed} cap={row.akadCap} />
              <Meter label="Resepsi" used={row.resepsiUsed} cap={row.resepsiCap} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
