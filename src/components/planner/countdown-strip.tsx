'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { daysUntilWedding, WEDDING_DATE } from '@/domain/planner'

/**
 * Slim, muted, numeral-sized. The display-size countdown lives on planner
 * home, so this hides there rather than duplicating it (DESIGN.md, the One
 * Display Rule).
 *
 * The final-week state is never carried by color alone (DESIGN.md, the
 * Never-Color-Alone Rule): the amber tint is paired with a warning icon and
 * a heavier weight, so it still reads as urgent at low brightness.
 */
export function CountdownStrip({ todayKey }: { todayKey: string }) {
  const pathname = usePathname()
  if (pathname === '/planner') return null

  const days = daysUntilWedding(todayKey)
  const isFinalWeek = days >= 0 && days <= 7
  const label =
    days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} to go` : days === 0 ? 'Today is the day' : 'Married'

  return (
    <Link
      href="/planner"
      className={`flex h-8 items-center justify-center gap-2 border-b px-4 text-xs transition-colors ${
        isFinalWeek
          ? 'bg-warning/10 font-medium text-warning'
          : 'bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      {isFinalWeek ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
      <span className="font-mono tabular-nums">{label}</span>
      <span aria-hidden>·</span>
      <span>10 October 2026</span>
      <span className="sr-only">Open the planner</span>
      <span className="sr-only">{WEDDING_DATE}</span>
    </Link>
  )
}
