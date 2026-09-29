'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { printGuestLabel, printUnlistedLabel } from '@/server/actions/envelope-actions'
import type { EnvelopeLabel } from '@/server/repositories/envelopes-repository'
import { inviterLabel } from '@/lib/inviter-label'

/**
 * The envelope label, drawn once as a picture.
 *
 * 50 x 30 mm at 203 dpi, which is the Niimbot B1's roll and resolution. It is
 * a bitmap rather than HTML so the one drawing serves both ways of printing:
 * today it goes through Android's print screen as an image sized to the
 * label, and when the printers arrive the same pixels go straight to the
 * printer over Bluetooth. Two layouts would drift; one cannot.
 */
export const LABEL_WIDTH = 400
export const LABEL_HEIGHT = 240

const SIDE = { fatan: 'Fatan side', sita: 'Sita side' } as const

function fontStack(variable: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return value ? `${value}, ${fallback}` : fallback
}

/** Largest size, down to `min`, at which the text fits `lines` lines of `width`. */
function fitLines(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, width: number, max: number, min: number, lines: number) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = font(size)
    const wrapped = wrap(ctx, text, width)
    if (wrapped.length <= lines) return { size, wrapped }
  }
  ctx.font = font(min)
  const wrapped = wrap(ctx, text, width).slice(0, lines)
  // Still too long at the smallest size: end the last line with an ellipsis.
  let last = wrapped[lines - 1] ?? ''
  while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  if (wrapped.length === lines) wrapped[lines - 1] = `${last}…`
  return { size: min, wrapped }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function drawEnvelopeLabel(label: EnvelopeLabel): Promise<HTMLCanvasElement> {
  const sans = fontStack('--font-fira-sans', 'ui-sans-serif, system-ui, sans-serif')
  const mono = fontStack('--font-fira-code', 'ui-monospace, monospace')
  // A face the page has not used yet is not loaded yet, and canvas silently
  // draws in the fallback. Ask for each one the label uses.
  try {
    await Promise.all([
      document.fonts.load(`400 20px ${sans}`),
      document.fonts.load(`500 17px ${sans}`),
      document.fonts.load(`600 40px ${sans}`),
      document.fonts.load(`600 44px ${mono}`),
    ])
  } catch {
    // Draw in the fallback rather than not at all.
  }

  const canvas = document.createElement('canvas')
  canvas.width = LABEL_WIDTH
  canvas.height = LABEL_HEIGHT
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'

  const pad = 18
  const inner = LABEL_WIDTH - pad * 2

  ctx.font = `500 17px ${sans}`
  ctx.fillText('Sita & Fatan · 10.10.2026', pad, pad + 14)

  const { size, wrapped } = fitLines(ctx, label.name, (s) => `600 ${s}px ${sans}`, inner, 40, 24, 2)
  let y = pad + 14 + 12 + size
  for (const line of wrapped) {
    ctx.font = `600 ${size}px ${sans}`
    ctx.fillText(line, pad, y)
    y += size * 1.12
  }

  const who = label.inviterKey
    ? `${inviterLabel(label.inviterKey)}${label.side ? ` · ${SIDE[label.side]}` : ''}`
    : 'Not on the guest list'
  ctx.font = `400 20px ${sans}`
  ctx.fillText(who, pad, Math.min(y + 4, LABEL_HEIGHT - 72))

  ctx.fillRect(pad, LABEL_HEIGHT - 62, inner, 2)
  ctx.font = `600 44px ${mono}`
  ctx.fillText(label.code, pad, LABEL_HEIGHT - pad)
  return canvas
}

/**
 * Print labels from any screen. Returns `print(guestId)` and
 * `printUnlisted(name)`; the label is drawn, placed in a print-only layer,
 * and handed to the browser's print screen sized to the label.
 */
export function useEnvelopeLabel() {
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const show = useCallback(async (label: EnvelopeLabel) => {
    const canvas = await drawEnvelopeLabel(label)
    setImage(canvas.toDataURL('image/png'))
  }, [])

  const print = useCallback(
    (guestId: string) => {
      setError(null)
      startTransition(async () => {
        const result = await printGuestLabel(guestId)
        if ('error' in result) setError(result.error)
        else await show(result.label)
      })
    },
    [show]
  )

  const printUnlisted = useCallback(
    (name: string) => {
      setError(null)
      startTransition(async () => {
        const result = await printUnlistedLabel(name)
        if ('error' in result) setError(result.error)
        else await show(result.label)
      })
    },
    [show]
  )

  const layer = image ? <PrintLayer src={image} onDone={() => setImage(null)} /> : null
  return { print, printUnlisted, pending, error, clearError: () => setError(null), layer }
}

/** Hidden on screen; the only thing on the page when printing. */
function PrintLayer({ src, onDone }: { src: string; onDone: () => void }) {
  const [ready, setReady] = useState(false)
  // Exactly one print per label. The parent re-renders while this is up (its
  // pending state settles), and a second print screen over the first is the
  // kind of thing that makes an usher print two labels.
  const printed = useRef(false)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!ready || printed.current) return
    printed.current = true
    // Not torn down on cleanup: the guard above means this effect body runs
    // once, and a cleanup would leave the layer up forever. Clearing a layer
    // that is already gone is a no-op.
    window.addEventListener('afterprint', () => done.current(), { once: true })
    window.print()
    // Some Android builds never fire afterprint; the layer is invisible on
    // screen either way, so clearing it late costs nothing.
    window.setTimeout(() => done.current(), 60_000)
  }, [ready])

  return createPortal(
    <div className="envelope-print" aria-hidden>
      <style>{`
        .envelope-print { display: none; }
        @media print {
          @page { size: 50mm 30mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body > *:not(.envelope-print) { display: none !important; }
          .envelope-print { display: block; width: 50mm; height: 30mm; }
          .envelope-print img { display: block; width: 50mm; height: 30mm; }
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn on this device */}
      <img src={src} alt="" onLoad={() => setReady(true)} />
    </div>,
    document.body
  )
}
