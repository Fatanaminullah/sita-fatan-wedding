'use client'

import { inviterLabel } from '@/lib/inviter-label'

export type InviterCaps = { key: string; akadCap: number; resepsiCap: number }

export type CapacityRow = InviterCaps & {
  akadUsed: number
  resepsiUsed: number
  /**
   * Seats this inviter has had back: a decline, or a guest invited for two who
   * answered that one is coming. Shown because the meter would otherwise go
   * quiet about a number it had just changed, which is what sent the owner
   * looking for it on the dashboard.
   */
  akadFreed: number
  resepsiFreed: number
}

function Meter({
  label,
  used,
  cap,
  freed,
}: {
  label: string
  used: number
  cap: number
  freed: number
}) {
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
      {/* The bar repeats the figures above it and carries nothing a reader
          cannot get from them, so it is hidden from a screen reader rather
          than announced as a second, wordless copy of the same fact. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: over ? 'var(--destructive)' : 'var(--chart-1)' }}
        />
      </div>
      {/* Only when there is something to say. Eleven of the twelve meters stay
          exactly as tall as they were, which matters in a block that is pinned
          above the table in edit mode.

          No color: the Spent Color Rule keeps Amber and Red for data that has
          earned them, and a seat coming back is good news, not an alarm. The
          count is Fira Code because it is compared against the figures above
          it, and the wording matches the dashboard's "Given back" so the two
          screens are plainly describing one number. */}
      {freed > 0 ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{freed}</span> given back
        </p>
      ) : null}
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
              <Meter label="Akad" used={row.akadUsed} cap={row.akadCap} freed={row.akadFreed} />
              <Meter
                label="Resepsi"
                used={row.resepsiUsed}
                cap={row.resepsiCap}
                freed={row.resepsiFreed}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
