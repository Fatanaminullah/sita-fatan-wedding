'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { PHOTOS } from './photos'
import type { PaperLetterHandle } from './paper-letter'
import { LetterFallback } from './paper-fallback'

/** If the three.js chunk itself fails to load, the plain letter stands in. */
function LetterUnavailable({ onFallback }: { onFallback?: () => void }) {
  useEffect(() => {
    onFallback?.()
  }, [onFallback])
  return null
}
const PaperLetter = dynamic(
  () => import('./paper-letter').then((m) => m.PaperLetter).catch(() => LetterUnavailable),
  { ssr: false }
)

/**
 * The front of the invitation: the photograph, and a letter hanging in the
 * air in front of it, addressed to the guest. Drag turns it, the pointer
 * lights it. Open: the letter lifts away and the page lets go of the scroll.
 * That tap is also the one gesture allowed to start music.
 *
 * Nothing here is visible until `started`, which the loader raises as its
 * curtain begins to move, so the reveal and the curtain are one motion.
 */
export function Cover({
  guestName,
  answered,
  started,
  onOpen,
}: {
  guestName: string
  answered: boolean
  started: boolean
  onOpen: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const paper = useRef<PaperLetterHandle | null>(null)
  const openedRef = useRef(false)
  const [fallback, setFallback] = useState(false)
  const [gone, setGone] = useState(false)

  useGSAP(
    () => {
      if (!started) return
      ref.current?.classList.remove('inv-cover--pending')
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.fromTo('.inv-cover__photo', { scale: 1.14 }, { scale: 1, duration: 7, ease: 'power2.out' })
        gsap.from('.inv-cover__top', { opacity: 0, y: -10, duration: 1, delay: 0.5 })
        gsap.from('.inv-cover__cta', { opacity: 0, y: 16, duration: 1, delay: 1.4, ease: 'power3.out' })
        gsap.to('.inv-cover__photo', {
          yPercent: 18,
          ease: 'none',
          scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true },
        })
      })
      mm.add(MOTION_REDUCED, () => {
        gsap.set(['.inv-cover__photo', '.inv-cover__top', '.inv-cover__cta'], { clearProps: 'all' })
      })
    },
    { scope: ref, dependencies: [started] }
  )

  // Both routes end in onOpened: the drag when the sheet has left, the
  // button after dismiss(). The page then scrolls itself to the verse.
  const openedRef2 = useRef<() => void>(() => {})
  useGSAP(
    (_ctx, contextSafe) => {
      openedRef2.current = contextSafe!(() => {
        if (openedRef.current) return
        openedRef.current = true
        setGone(true)
        onOpen()
        // The sheet has gone; the hint turns into the way forward.
        gsap
          .timeline()
          .to('.inv-cover__hint', { opacity: 0, y: -6, duration: 0.3 })
          .set('.inv-cover__hint', { display: 'none' })
          .fromTo('.inv-cover__next', { opacity: 0, y: 8, display: 'grid' }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
      })
    },
    { scope: ref, dependencies: [onOpen] }
  )

  return (
    <section ref={ref} className="inv-cover inv-cover--pending" aria-label="Cover">
      <div className="inv-cover__photo">
        <Image src={PHOTOS.coverArch.src} alt={PHOTOS.coverArch.alt} fill priority sizes="100vw" quality={85} />
      </div>
      <div className="inv-cover__wash" aria-hidden />

      <div className="inv-cover__inner">
        <div className="inv-cover__top inv-label" style={{ textAlign: 'center', opacity: 0.85 }}>
          The wedding of Sita &amp; Fatan
        </div>

        {fallback ? (
          gone ? (
            <div className="inv-paper" aria-hidden />
          ) : (
            <LetterFallback guestName={guestName} answered={answered} onOpen={() => openedRef2.current()} />
          )
        ) : (
          <PaperLetter
            ref={paper}
            guestName={guestName}
            answered={answered}
            started={started}
            onOpened={() => openedRef2.current()}
            onFallback={() => setFallback(true)}
          />
        )}

        <div className="inv-cover__cta">
          <p className="inv-label inv-cover__hint" style={fallback ? { visibility: 'hidden' } : undefined}>
            <span className="inv-cover__arrow" aria-hidden />
            Drag the letter up to open
          </p>
          <div className="inv-cover__next inv-scrollcue" style={{ display: 'none' }}>
            <span className="inv-scrollcue__capsule" aria-hidden>
              <span className="inv-scrollcue__dot" />
            </span>
            <p className="inv-label">Scroll down to continue</p>
          </div>
        </div>
      </div>

    </section>
  )
}
