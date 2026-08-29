'use client'

import { useEffect, useRef, useState } from 'react'
import { MonogramMark } from './monogram-mark'
import { GROUND, Label, Reveal, SUITE, bodoni, jost } from './invitation-shell'

/**
 * The greeting a guest sees the moment they are let in.
 *
 * This is the one screen in the admin app that a guest reads, and it is
 * therefore the one screen that does not follow DESIGN.md. That file governs
 * "The Operations Room" and its own Don'ts send wedding motifs here instead.
 * The authority for this component is the guest surface: the same warm paper,
 * the same Bodoni, the same monogram they saw when the invitation arrived in
 * WhatsApp weeks ago.
 *
 * That repetition is the whole idea. The invitation and the doorway are one
 * object, and the guest recognises the second because they were shown the
 * first.
 *
 * It carries no controls at all. The tablet faces the guest on a stand, so a
 * button would be a button pointed at the wrong person. It clears itself, and
 * a tap anywhere clears it sooner for an usher with a queue.
 */

/** How long the greeting holds before returning to the scanner. */
const HOLD_MS = 5000

export type ArrivalGreetingProps = {
  name: string
  /** Party size. Shown only when it is more than one. */
  paxArrived: number
  event: 'akad' | 'resepsi'
  isVip: boolean
  /** True when this guest has not collected a souvenir yet. */
  souvenirDue: boolean
  /**
   * Optional portrait. Left empty until the couple supply images; drop a file
   * in and pass its path, no other change. Deliberately not required, so the
   * greeting is complete without it rather than looking unfinished.
   */
  photoSrc?: string | null
  onDone: () => void
}

const EVENT_LABEL: Record<'akad' | 'resepsi', string> = {
  akad: 'the Akad',
  resepsi: 'the Resepsi',
}

export function ArrivalGreeting({
  name,
  paxArrived,
  event,
  isVip,
  souvenirDue,
  photoSrc = null,
  onDone,
}: ArrivalGreetingProps) {
  const [leaving, setLeaving] = useState(false)
  // onDone is called from a timer; keeping it in a ref means a parent that
  // re-creates the callback each render does not restart the countdown. The
  // ref is written in an effect, never during render.
  const done = useRef(onDone)

  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLeaving(true)
      done.current()
    }, HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [])

  function dismissNow() {
    if (leaving) return
    setLeaving(true)
    done.current()
  }

  return (
    <div
      // Not a button, and not focusable: the guest is looking at this, the
      // usher is reaching past it. Dismissal is a convenience for one of them
      // and must never read as an instruction to the other.
      onClick={dismissNow}
      className={`${bodoni.variable} ${jost.variable} fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-8 text-center`}
      style={GROUND}
      role="status"
      aria-live="polite"
    >
      <Reveal order={0}>
        <MonogramMark size={72} />
      </Reveal>

      <Reveal order={1} className="mt-8">
        <Label style={{ color: SUITE.oxblood, opacity: 0.5 }}>Welcome</Label>
      </Reveal>

      {photoSrc ? (
        <Reveal order={2} className="mt-7">
          {/* Held-object treatment: the blush panel is the mount, the photo
              sits on it the way the portraits sit on cream cards. */}
          <span
            className="block rounded-[2px] p-2"
            style={{ backgroundColor: SUITE.blush }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoSrc}
              alt=""
              className="block h-28 w-28 object-cover sm:h-36 sm:w-36"
            />
          </span>
        </Reveal>
      ) : null}

      <Reveal order={photoSrc ? 3 : 2} className="mt-7 w-full">
        {/* VIP gets a panel rather than a badge. A badge is an admin object
            and would read as a label stuck on a person; a panel reads as the
            name being mounted, which is what a VIP is owed at a door. */}
        <span
          className={isVip ? 'inline-block px-7 py-4' : 'inline-block'}
          style={isVip ? { backgroundColor: SUITE.blush } : undefined}
        >
          <span
            className="block text-[clamp(2.4rem,9vw,4.6rem)] leading-[1.05]"
            style={{ fontFamily: 'var(--font-display)', color: SUITE.oxblood }}
          >
            {name}
          </span>
        </span>
      </Reveal>

      <Reveal order={photoSrc ? 4 : 3} className="mt-7">
        <p
          className="max-w-[22rem] text-[1.05rem] leading-relaxed"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.85 }}
        >
          We are so glad you are here.
        </p>
      </Reveal>

      <Reveal order={photoSrc ? 5 : 4} className="mt-6">
        <p
          className="text-[0.95rem]"
          style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.55 }}
        >
          {paxArrived > 1
            ? `Welcomed to ${EVENT_LABEL[event]}, ${paxArrived} of you.`
            : `Welcomed to ${EVENT_LABEL[event]}.`}
        </p>
      </Reveal>

      {souvenirDue ? (
        <Reveal order={photoSrc ? 6 : 5} className="mt-3">
          <p
            className="text-[0.95rem]"
            style={{ fontFamily: 'var(--font-text)', color: SUITE.ink, opacity: 0.55 }}
          >
            Your souvenir is waiting at the table by the entrance.
          </p>
        </Reveal>
      ) : null}

      {/* The clock, for the usher only. A depleting hairline says "this is
          about to clear" without putting a countdown numeral in front of the
          guest, which would read as being timed. */}
      <span
        aria-hidden="true"
        className="greeting-timer absolute bottom-0 left-0 h-[2px]"
        style={{ backgroundColor: SUITE.oxblood, opacity: 0.25 }}
      />
    </div>
  )
}
