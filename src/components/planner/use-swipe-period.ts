'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { DayKey } from '@/domain/planner'
import { shift, type CalendarView } from './calendar-nav'

const MIN_DISTANCE_PX = 60
const MAX_VERTICAL_DRIFT_PX = 40

/**
 * Horizontal only, and only past a real threshold, so scrolling the hour grid
 * vertically never pages the calendar out from under a thumb.
 *
 * `shift` is imported from `calendar-nav.tsx`, not redefined here. The
 * gesture this hook implements is meant to be exactly equivalent to tapping
 * the prev/next arrows `CalendarNav` renders, so the two need to agree on
 * what "next" and "previous" mean for every view, not just start out
 * agreeing and risk drifting apart later. See task-19-report.md for the
 * reasoning.
 */
export function useSwipePeriod({ view, dateKey }: { view: CalendarView; dateKey: DayKey }) {
  const router = useRouter()
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart: (event: React.TouchEvent) => {
      const touch = event.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY }
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if (!start.current) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.current.x
      const dy = touch.clientY - start.current.y
      start.current = null

      if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX) return
      if (Math.abs(dx) < MIN_DISTANCE_PX) return

      const direction = dx < 0 ? 1 : -1
      router.push(`/planner/calendar?view=${view}&date=${shift(view, dateKey, direction)}`)
    },
  }
}
