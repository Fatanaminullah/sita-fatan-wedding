'use client'

import { useEffect, useRef } from 'react'
import { bodoni, jost } from './invitation-shell'

/**
 * The greeting a guest sees the moment they are let in.
 *
 * Ported from the owner's Claude Design comp (`Welcome Screen.dc.html`), which
 * replaced an earlier warm-paper version of this screen. The comp is the
 * authority for every value here.
 *
 * The direction changed on purpose and the reasoning is worth keeping: this is
 * read across a metre of air, on a tablet mounted at a lit reception, by
 * someone who has just walked in from outside. A pale ground glares under
 * venue lighting and a name set on paper competes with everything behind it. A
 * photograph carries at that distance, and dark ground with light type is what
 * every cinema and every theatre foyer already uses for the same reason.
 *
 * It carries no controls. The tablet faces the guest on a stand, so a button
 * would be a button pointed at the wrong person. It clears itself, and a tap
 * anywhere clears it sooner for an usher with a queue.
 */

/** Exactly the comp's palette. */
const INK = '#0d0c0a'
const PAPER = '#f4f0e8'
const SIGNAL = '#96ad7c'

/**
 * The comp's own scale, keyed to name length.
 *
 * Indonesian names run long ("Bapak H. Muhammad Syafruddin & Ibu"), and a
 * fixed size either shrinks every short name or wraps every long one into a
 * paragraph. The tiers are the comp's, unchanged.
 */
function nameSizeFor(name: string): number {
  const length = name.length
  if (length <= 8) return 84
  if (length <= 14) return 72
  if (length <= 22) return 60
  if (length <= 30) return 50
  return 43
}

/**
 * The comp was drawn on a 500px-wide preview, so its pixel values are really
 * proportions of that width. Held as fixed pixels they shrink to nothing on
 * the tablet this actually runs on, which is roughly 810px across: everything
 * came out around two thirds the size it was designed to be, read from a metre
 * away.
 *
 * So each size is expressed as its share of the comp's width and allowed to
 * grow with the screen. The floor keeps it legible on a phone; the ceiling
 * stops a short name filling a laptop.
 */
function scaled(px: number, { floor = 0.85, ceiling = 1.75 } = {}): string {
  const vw = (px / 500) * 100
  return `clamp(${Math.round(px * floor)}px, ${vw.toFixed(2)}vw, ${Math.round(px * ceiling)}px)`
}

export type ArrivalGreetingProps = {
  name: string
  /** How many actually walked in, not how many were invited. */
  paxArrived: number
  event: 'akad' | 'resepsi'
  /**
   * Optional portrait behind the greeting. The screen is complete without one:
   * with no photo it falls back to the flat ink ground the comp sits on, which
   * is a deliberate look rather than a hole.
   *
   * Point this at a display-sized file, never the camera original. This screen
   * has to appear the instant a guest is admitted, and a full-resolution export
   * is several seconds of venue wifi plus a large decode on a tablet that is
   * already running a camera.
   */
  photoSrc?: string | null
  /** Seconds the greeting holds before clearing itself. The comp's default. */
  holdSeconds?: number
  onDone: () => void
}

const EVENT_NAME: Record<'akad' | 'resepsi', string> = { akad: 'Akad', resepsi: 'Resepsi' }

export function ArrivalGreeting({
  name,
  paxArrived,
  event,
  photoSrc = null,
  holdSeconds = 12,
  onDone,
}: ArrivalGreetingProps) {
  // onDone is called from a timer; the ref keeps a parent that re-creates the
  // callback each render from restarting the countdown. Written in an effect,
  // never during render.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), holdSeconds * 1000)
    return () => window.clearTimeout(timer)
  }, [holdSeconds])

  const words = name.trim().split(/\s+/)
  const nameSize = nameSizeFor(name)

  return (
    <div
      // Not a button and not focusable: the guest is looking at this, the
      // usher is reaching past it. Dismissal is a convenience for one of them
      // and must never read as an instruction to the other.
      onClick={() => done.current()}
      className={`${bodoni.variable} ${jost.variable} fixed inset-0 select-none overflow-hidden`}
      style={{ background: INK, fontFamily: 'var(--font-text)', cursor: 'pointer' }}
      role="status"
      aria-live="polite"
      aria-label={`Welcome, ${name}. ${paxArrived} at the ${EVENT_NAME[event]}.`}
    >
      {photoSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photoSrc}
          alt=""
          // Eager and high priority: it is the whole screen, and a greeting
          // that paints its background a beat late is worse than one that
          // waits. It stays warm in the browser cache between guests.
          loading="eager"
          fetchPriority="high"
          decoding="sync"
          className="absolute inset-0 h-full w-full object-cover"
          // Off-centre on purpose: faces sit above the middle of a portrait,
          // and the lower half of the frame is where the type goes.
          style={{ objectPosition: '50% 42%' }}
        />
      ) : null}

      {/* Darkens top and bottom and leaves the middle alone, so the pill and
          the name hold their contrast without flattening the photograph. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(13,12,10,0.55) 0%, rgba(13,12,10,0) 20%, rgba(13,12,10,0) 42%, rgba(13,12,10,0.58) 72%, rgba(13,12,10,0.88) 100%)',
        }}
      />

      {/* The one thing the usher needs to read from behind the tablet, and the
          one thing the guest needs to know happened. */}
      <div className="dc-fade-pill absolute inset-x-0 top-[30px] flex justify-center">
        <div
          className="flex items-center gap-[11px] rounded-full px-5 py-[11px] backdrop-blur-[10px]"
          style={{
            background: 'rgba(13,12,10,0.66)',
            border: '1px solid rgba(244,240,232,0.3)',
          }}
        >
          <span
            className="block size-[9px] rounded-full"
            style={{ background: SIGNAL, boxShadow: `0 0 10px rgba(150,173,124,0.9)` }}
          />
          <span
            className="font-semibold"
            style={{ fontSize: scaled(13), letterSpacing: '0.24em', color: PAPER }}
          >
            CHECKED IN
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-10 pb-[108px] text-center">
        <div
          className="dc-track-in font-medium"
          style={{
            // Deliberately larger than its share of the comp. It is the first
            // thing a guest reads and the whole point of the screen: they
            // should know they are being welcomed before they read their name.
            fontSize: scaled(15, { floor: 1.2, ceiling: 2.6 }),
            letterSpacing: '0.4em',
            textIndent: '0.4em',
            color: 'rgba(244,240,232,0.82)',
            textShadow: '0 1px 10px rgba(0,0,0,0.5)',
          }}
        >
          WELCOME
        </div>

        {/* Word by word, each rising from behind its own edge, so a long name
            arrives as a sequence rather than a block landing at once. */}
        <div
          className="mb-6 mt-[18px] flex flex-wrap justify-center"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: PAPER,
            fontSize: scaled(nameSize),
            lineHeight: 1.12,
            textWrap: 'balance',
            textShadow: '0 2px 28px rgba(0,0,0,0.55)',
            columnGap: '0.28em',
          }}
        >
          {words.map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="inline-block overflow-hidden"
              style={{ paddingBottom: '0.06em', marginBottom: '-0.06em' }}
            >
              <span
                className="dc-mask-rise inline-block"
                style={{ animationDelay: `${(0.25 + i * 0.11).toFixed(2)}s` }}
              >
                {word}
              </span>
            </span>
          ))}
        </div>

        <div
          className="dc-rule-grow mb-[22px] h-px w-11 origin-center"
          style={{ background: 'rgba(244,240,232,0.65)' }}
        />

        <div
          className="dc-blur-up flex items-center gap-4 uppercase"
          style={{
            fontSize: scaled(17),
            letterSpacing: '0.22em',
            textIndent: '0.22em',
            color: 'rgba(244,240,232,0.92)',
            textShadow: '0 1px 10px rgba(0,0,0,0.5)',
          }}
        >
          <span>
            {paxArrived} {paxArrived === 1 ? 'Guest' : 'Guests'}
          </span>
          <span
            className="block size-1 rotate-45"
            style={{ background: 'rgba(244,240,232,0.7)' }}
          />
          <span>{EVENT_NAME[event]}</span>
        </div>
      </div>

      {/* The clock. A bar emptying across the foot says "this is about to
          clear" without putting a countdown numeral in front of a guest, which
          would read as being timed at the door. */}
      <div className="dc-fade-footer absolute inset-x-0 bottom-0 flex flex-col items-center gap-4">
        <div
          className="uppercase"
          style={{
            fontSize: scaled(12),
            letterSpacing: '0.2em',
            textIndent: '0.2em',
            color: 'rgba(244,240,232,0.55)',
          }}
        >
          Tap anywhere to continue
        </div>
        <div className="h-[3px] w-full" style={{ background: 'rgba(244,240,232,0.16)' }}>
          <div
            className="dc-bar-shrink h-full w-full origin-left"
            style={{
              background: 'rgba(244,240,232,0.75)',
              animationDuration: `${holdSeconds}s`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * What the tablet shows between guests.
 *
 * Also from the comp. It replaces a live camera preview, which was the wrong
 * thing to point at a queue: a guest walking up to a screen showing their own
 * face reads as being filmed. The camera keeps running underneath and the
 * scanner keeps reading frames from it; only the picture is hidden.
 */
export function ReadyToScan() {
  return (
    <div
      className="dc-fade-panel absolute inset-0 flex flex-col items-center justify-center gap-[34px]"
      style={{ background: 'rgba(13,12,10,0.92)', fontFamily: 'var(--font-text)' }}
    >
      <div
        className="flex size-[190px] items-center justify-center rounded-[22px]"
        style={{ border: '1.5px solid rgba(244,240,232,0.35)' }}
      >
        <div
          className="dc-dot-pulse size-3 rounded-full"
          style={{ background: SIGNAL }}
        />
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <div
          className="text-[15px] font-semibold"
          style={{ letterSpacing: '0.3em', textIndent: '0.3em', color: PAPER }}
        >
          READY TO SCAN
        </div>
        <div
          className="text-sm"
          style={{ letterSpacing: '0.06em', color: 'rgba(244,240,232,0.6)' }}
        >
          Point the next guest&rsquo;s QR code at the camera
        </div>
      </div>
    </div>
  )
}
