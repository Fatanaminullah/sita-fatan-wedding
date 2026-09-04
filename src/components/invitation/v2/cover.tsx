'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { PHOTOS } from './photos'
import type { PaperLetterHandle } from './paper-letter'

const PaperLetter = dynamic(() => import('./paper-letter').then((m) => m.PaperLetter), { ssr: false })

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
  const paper = useRef<PaperLetterHandle>(null)
  const openedRef = useRef(false)

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
        gsap.to('.inv-cover__cta', { opacity: 0, y: 10, duration: 0.3 })
        onOpen()
      })
    },
    { scope: ref, dependencies: [onOpen] }
  )

  return (
    <section ref={ref} className="inv-cover inv-cover--pending" aria-label="Cover">
      <div className="inv-cover__photo">
        <Image src={PHOTOS.coverArch.src} alt={PHOTOS.coverArch.alt} fill priority sizes="100vw" quality={78} />
      </div>
      <div className="inv-cover__wash" aria-hidden />

      <div className="inv-cover__inner">
        <div className="inv-cover__top inv-label" style={{ textAlign: 'center', opacity: 0.85 }}>
          The wedding of Sita &amp; Fatan
        </div>

        <PaperLetter
          ref={paper}
          guestName={guestName}
          answered={answered}
          started={started}
          onOpened={() => openedRef2.current()}
        />

        <div className="inv-cover__cta">
          <p className="inv-label inv-cover__hint">
            <span className="inv-cover__arrow" aria-hidden />
            Drag the letter up to open
          </p>
          <button type="button" className="inv-btn inv-btn--ghost inv-btn--light" onClick={() => paper.current?.dismiss()}>
            Open the invitation
          </button>
        </div>
      </div>

    </section>
  )
}
