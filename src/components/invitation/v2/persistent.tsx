'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { gsap, useGSAP, ScrollTrigger } from '@/lib/invitation/gsap'
import { MUSIC_SRC } from './content'
import { useCopy } from './lang'

const MUTE_KEY = 'inv:muted'

/**
 * Music starts once the verse has been read, and is unlocked by the cover
 * tap: iOS refuses a play() outside a gesture's call stack, so the tap
 * plays and pauses the element (the permission sticks), and `play` later
 * starts it for real from the top. The toggle sits in the corner in
 * difference blend so it reads on ivory and charcoal alike, and remembers
 * its state across reloads.
 */
export type MusicHandle = {
  /** Call synchronously inside the gesture that opens the letter. */
  unlock: () => void
}

export const Music = forwardRef<MusicHandle, { prime: boolean; play: boolean }>(function Music({ prime, play }, ref) {
  const audio = useRef<HTMLAudioElement>(null)
  const [muted, setMuted] = useState(false)
  const c = useCopy()
  const wanted = useRef(play)
  useEffect(() => {
    wanted.current = play
  }, [play])

  useImperativeHandle(
    ref,
    () => ({
      unlock: () => {
        const a = audio.current
        if (!a) return
        a.muted = muted
        a.play()
          .then(() => {
            // Unless the verse has already been read by the time the
            // promise settles, this was only the unlock.
            if (!wanted.current) a.pause()
          })
          .catch(() => {})
      },
    }),
    [muted]
  )

  // The letter has opened: fetch the track now, while the verse plays, so
  // it can start the moment the verse ends.
  useEffect(() => {
    const a = audio.current
    if (!a || !prime) return
    a.preload = 'auto'
    a.load()
  }, [prime])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        setMuted(localStorage.getItem(MUTE_KEY) === '1')
      } catch {}
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const startedRef = useRef(false)
  useEffect(() => {
    const a = audio.current
    if (!a || !play) return
    a.muted = muted
    if (!startedRef.current) {
      startedRef.current = true
      a.currentTime = 0
    }
    a.play().catch(() => {})
  }, [play, muted])

  function toggle() {
    const next = !muted
    setMuted(next)
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0')
    } catch {}
  }

  if (!MUSIC_SRC) return null

  return (
    <>
      <audio ref={audio} src={MUSIC_SRC} loop preload="none" />
      {play ? (
        <button
          type="button"
          className="inv-fixed inv-mute inv-iconbtn"
          onClick={toggle}
          aria-pressed={muted}
          aria-label={muted ? c.chrome.unmute : c.chrome.mute}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
            {muted ? (
              <path d="M2 6.5h3l4-3.5v12l-4-3.5H2zM12 6l4 6M16 6l-4 6" />
            ) : (
              <path d="M2 6.5h3l4-3.5v12l-4-3.5H2zM12 6.5a3.5 3.5 0 010 5M14 4a7 7 0 010 10" />
            )}
          </svg>
        </button>
      ) : null}
    </>
  )
})

/**
 * The reminder. Appears after the cover, hides while the RSVP sheet itself is
 * on screen and while the bride and groom hold the screen (their names sit
 * in its corner), and goes away for good once the guest has answered.
 */
export function RsvpPill({ show, onClick }: { show: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const c = useCopy()

  useGSAP(
    () => {
      if (!ref.current) return
      const el = ref.current
      let onRsvp = false
      let onCouple = false
      let onCover = true
      const apply = () => {
        gsap.to(el, {
          y: show && !onRsvp && !onCouple && !onCover ? 0 : '150%',
          duration: 0.6,
          ease: 'power3.out',
          overwrite: true,
        })
      }
      ScrollTrigger.create({
        trigger: '#rsvp',
        start: 'top 80%',
        end: 'bottom 20%',
        onToggle: (self) => {
          onRsvp = self.isActive
          apply()
        },
      })
      ScrollTrigger.create({
        trigger: '#couple',
        start: 'top 35%',
        end: 'bottom 65%',
        onToggle: (self) => {
          onCouple = self.isActive
          apply()
        },
      })
      ScrollTrigger.create({
        start: 0,
        end: () => window.innerHeight * 0.8,
        onToggle: (self) => {
          onCover = self.isActive
          apply()
        },
      })
      apply()
    },
    { dependencies: [show] }
  )

  return (
    <button ref={ref} type="button" className="inv-fixed inv-pill" onClick={onClick} aria-hidden={!show} tabIndex={show ? 0 : -1}>
      {c.chrome.pill}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M2 7h10M8 3l4 4-4 4" />
      </svg>
    </button>
  )
}
