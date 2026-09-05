'use client'

import { forwardRef, useCallback } from 'react'
import { PaperSheet, type DrawFn, type PaperSheetHandle } from './paper-sheet'
import { PAPER, INK, SOFT, mid, track, wrapMid, paperGrain, engravedFrame, rule, drawMark } from './paper-draw'
import { RSVP_DEADLINE, WEDDING_DATE } from './content'

/**
 * The letter on the cover: the guest's name as the largest thing on the
 * sheet, drawn on a 1200 x 1656 grid. A drag lifts it away.
 */
export type PaperLetterHandle = PaperSheetHandle

const TW = 1200
const TH = 1656
const CX = 600

function drawLetter(ctx: CanvasRenderingContext2D, o: { name: string; answered: boolean; display: string; text: string; mark: HTMLImageElement | null }) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, TW, TH)
  paperGrain(ctx, TW, TH)
  engravedFrame(ctx, TW, TH)

  drawMark(ctx, CX, 150, 190)

  ctx.fillStyle = SOFT
  ctx.font = `500 24px ${o.text}`
  track(ctx, 'DEAR', CX, 440, 10)

  // The guest's name is the largest thing on the sheet. Long names step
  // down, then wrap, until they sit inside the rules.
  ctx.fillStyle = INK
  let size = 132
  ctx.font = `400 ${size}px ${o.display}`
  while (ctx.measureText(o.name).width > 940 && size > 72) {
    size -= 6
    ctx.font = `400 ${size}px ${o.display}`
  }
  const nameBottom = wrapMid(ctx, o.name, 560, 940, size * 1.02, CX)

  ctx.fillStyle = SOFT
  ctx.font = `italic 400 40px ${o.display}`
  const inviteY = wrapMid(ctx, 'you are invited to the wedding of', nameBottom + 96, 900, 48, CX)

  ctx.fillStyle = INK
  ctx.font = `400 128px ${o.display}`
  mid(ctx, 'Sita', inviteY + 150, CX)
  ctx.font = `italic 400 54px ${o.display}`
  mid(ctx, 'and', inviteY + 214, CX)
  ctx.font = `400 128px ${o.display}`
  const namesBottom = inviteY + 340
  mid(ctx, 'Fatan', namesBottom, CX)
  rule(ctx, CX, namesBottom + 60, 150)

  ctx.fillStyle = INK
  ctx.font = `500 23px ${o.text}`
  track(ctx, WEDDING_DATE.long.toUpperCase(), CX, namesBottom + 130, 7)

  if (!o.answered) {
    ctx.fillStyle = SOFT
    ctx.font = `400 25px ${o.text}`
    mid(ctx, `Kindly reply by ${RSVP_DEADLINE.long}`, namesBottom + 184, CX)
  }

  rule(ctx, CX, 1500, 180)
  ctx.fillStyle = SOFT
  ctx.font = `500 18px ${o.text}`
  track(ctx, 'JAKARTA · MMXXVI', CX, 1556, 6)
}

type Props = {
  guestName: string
  answered: boolean
  started: boolean
  onOpened: () => void
  onFallback?: () => void
}

export const PaperLetter = forwardRef<PaperLetterHandle, Props>(function PaperLetter(
  { guestName, answered, started, onOpened, onFallback },
  ref
) {
  const front = useCallback<DrawFn>(
    (ctx, env) => drawLetter(ctx, { name: guestName, answered, ...env }),
    [guestName, answered]
  )
  return (
    <PaperSheet
      ref={ref}
      grid={{ w: TW, h: TH }}
      pixels={{ w: 1400, h: 1932 }}
      world={{ w: 2.3, h: 2.72 }}
      mode="lift"
      front={front}
      fontsToLoad={['400 150px $display', 'italic 400 60px $display', '500 22px $text']}
      started={started}
      onOpened={onOpened}
      onFallback={onFallback}
      ariaLabel={`A letter addressed to ${guestName}`}
    />
  )
})
