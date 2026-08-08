'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * One modal, two shapes: a bottom sheet on phone, a centred dialog from `md`
 * up. Both are surfaces DESIGN.md's float-ambient shadow is written for, and
 * each is right for its device. A bottom sheet stays thumb-reachable (the
 * Thumb Rule); on a wide screen the same sheet is a thin strip pinned to the
 * bottom edge, far from where the eye already is.
 *
 * Picking the component beats restyling one into the other: `side="bottom"`
 * pins `inset-x-0`, so any max-width over-constrains the box and CSS resolves
 * that by dropping `right`, leaving the sheet flush against the left edge.
 *
 * Choosing on `useIsMobile()` is safe here even though that hook reads the
 * real viewport on the first client render while the server sees none. Both
 * branches render nothing at all while closed, and every caller starts closed,
 * so there is no markup for the two passes to disagree about. That is not true
 * of `calendar-surface.tsx`, which switches between two rendered views and
 * therefore needs its `hasMounted` gate.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  initialFocus,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Pinned focus target, for quick capture's keyboard-already-up path. */
  initialFocus?: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()

  const shadow = 'shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]'

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" initialFocus={initialFocus} className={`max-h-[85vh] ${shadow}`}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `DialogContent` centres itself and caps at `sm:max-w-sm`, which is
          narrower than this form wants; `md:max-w-lg` widens it back without
          touching the centring. `p-0` because the header and body below carry
          their own padding, matching the sheet's layout. */}
      <DialogContent
        initialFocus={initialFocus}
        className={`flex max-h-[85vh] flex-col gap-4 p-0 pt-4 md:max-w-lg ${shadow}`}
      >
        <DialogHeader className="px-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
