'use client'

import { COUPLE, VERSE } from './content'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { Fragment, useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { PHOTOS } from './photos'
import type { PaperLetterHandle } from './paper-letter'
import { LetterFallback } from './paper-fallback'
import { EASE_INOUT, EASE_OUT } from './theme'

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
 * The front of the invitation, and its second act.
 *
 * The photograph, and a letter hanging in the air in front of it, addressed
 * to the guest. Drag turns it, the pointer lights it. Let go to open: the
 * letter lifts away, and the music starts inside that same gesture, which is
 * the one the browser will honour. Then the section holds while the
 * photograph softens and darkens and the verse arrives on its own clock, at
 * a reading pace, with nothing to scroll. When the last word is lit the
 * scroll cue appears and the page lets go of the scroll. Any attempt to
 * scroll during the verse finishes it at once: nobody is held.
 *
 * The section stays stuck for a second screen of scroll so the vow's stone
 * sheet slides up over the softened photograph, the way it used to slide up
 * over the verse's charcoal. See
 * docs/superpowers/specs/2026-09-14-verse-sequence-design.md.
 *
 * Nothing here is visible until `started`, which the loader raises as its
 * curtain begins to move, so the reveal and the curtain are one motion.
 */
export function Cover({
  guestName,
  answered,
  started,
  onGesture,
  onOpen,
  onRead,
}: {
  guestName: string
  answered: boolean
  started: boolean
  /**
   * Fired synchronously inside the pointerup or click that opens the letter.
   * The only place on the page that may start audio.
   */
  onGesture: () => void
  /** The letter has left. The sections below mount now; the scroll stays locked. */
  onOpen: () => void
  /** The verse has been read, or skipped. The page may scroll. */
  onRead: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const paper = useRef<PaperLetterHandle | null>(null)
  const openedRef = useRef(false)
  const [fallback, setFallback] = useState(false)
  const [gone, setGone] = useState(false)
  const words = VERSE.text.split(' ')
  // Read through a ref, as paper-sheet does: the parent hands down fresh
  // arrows on every render, and none of that should re-run the sequence.
  const cbs = useRef({ onGesture, onOpen, onRead })
  useEffect(() => {
    cbs.current = { onGesture, onOpen, onRead }
  }, [onGesture, onOpen, onRead])

  useGSAP(
    () => {
      if (!started) return
      ref.current?.classList.remove('inv-cover--pending')
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.fromTo('.inv-cover__photo', { scale: 1.14 }, { scale: 1, duration: 7, ease: 'power2.out' })
        gsap.from('.inv-cover__top', { opacity: 0, y: -10, duration: 1, delay: 0.5 })
        gsap.from('.inv-cover__cta', { opacity: 0, y: 16, duration: 1, delay: 1.4, ease: 'power3.out' })
      })
      mm.add(MOTION_REDUCED, () => {
        gsap.set(['.inv-cover__photo', '.inv-cover__top', '.inv-cover__cta'], { clearProps: 'all' })
      })
    },
    { scope: ref, dependencies: [started] }
  )

  // Both routes end in openedRef2: the drag when the sheet has left, the
  // button after dismiss(). The sequence runs from there.
  const openedRef2 = useRef<() => void>(() => {})
  useGSAP(
    (_ctx, contextSafe) => {
      openedRef2.current = contextSafe!(() => {
        if (openedRef.current) return
        openedRef.current = true
        setGone(true)
        ref.current?.classList.add('inv-cover--open')
        // The sections below mount now, while the guest is still here, so
        // their triggers are measured before anyone scrolls.
        cbs.current.onOpen()
        paintSoft(ref.current)

        let seq: gsap.core.Timeline | null = null
        let read = false
        // Any attempt to scroll finishes the verse at once.
        const skip = () => {
          if (seq && seq.progress() < 1) seq.progress(1)
        }
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') skip()
        }
        const finish = contextSafe!(() => {
          if (read) return
          read = true
          window.removeEventListener('wheel', skip)
          window.removeEventListener('touchmove', skip)
          window.removeEventListener('keydown', onKey)
          // The way on. Nothing moves by itself: the cue is the only hint.
          gsap.fromTo('.inv-cover__next', { opacity: 0, y: 8, display: 'grid' }, { opacity: 1, y: 0, duration: 0.8, ease: EASE_OUT })
          cbs.current.onRead()
        })

        // A plain matchMedia, not gsap.matchMedia: on a browser that knows
        // neither query, a gsap.matchMedia branch would never run and the
        // page would stay locked forever. The animated path is the default;
        // only an explicit "reduce" takes the still one.
        if (window.matchMedia(MOTION_REDUCED).matches) {
          gsap.set('.inv-cover__hint', { display: 'none' })
          gsap.set('.inv-cover__top', { opacity: 0 })
          gsap.set('.inv-cover__soft', { opacity: 1 })
          gsap.set('.inv-cover__dim', { opacity: 0.62 })
          gsap.set('.inv-cover__verse .word', { opacity: 1 })
          gsap.set('.inv-cover__verse-source', { opacity: 0.7 })
          finish()
        } else {
          seq = gsap
            .timeline({ onComplete: finish })
            .to('.inv-cover__hint', { opacity: 0, y: -6, duration: 0.3 }, 0)
            .set('.inv-cover__hint', { display: 'none' })
            .to('.inv-cover__top', { opacity: 0, y: -6, duration: 0.5 }, 0)
            // The photograph goes soft and dark: a cross-fade to a copy drawn
            // small and scaled up, opacity only, no filter.
            .to('.inv-cover__soft', { opacity: 1, duration: 1.5, ease: EASE_INOUT }, 0.2)
            .to('.inv-cover__dim', { opacity: 0.62, duration: 1.5, ease: EASE_INOUT }, 0.2)
            // The verse, word by word, at a reading pace.
            .fromTo(
              '.inv-cover__verse .word',
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', stagger: 0.2 },
              1.1
            )
            .to('.inv-cover__verse-source', { opacity: 0.7, duration: 0.8 }, '-=0.2')
            .to({}, { duration: 0.4 })
          window.addEventListener('wheel', skip, { passive: true })
          window.addEventListener('touchmove', skip, { passive: true })
          window.addEventListener('keydown', onKey)
        }
      })
    },
    { scope: ref }
  )

  return (
    <div className="inv-cover-wrap">
      <section ref={ref} className="inv-cover inv-cover--pending" aria-label="Cover">
        <div className="inv-cover__photo">
          <Image src={PHOTOS.coverArch.src} alt={PHOTOS.coverArch.alt} fill priority sizes="100vw" quality={85} />
          {/* Inside the same box as the sharp image, so the cross-fade shares
              its inset and the intro's slow zoom and holds still. */}
          <canvas className="inv-cover__soft" aria-hidden />
        </div>
        <div className="inv-cover__dim" aria-hidden />
        <div className="inv-cover__wash" aria-hidden />

        <div className="inv-cover__verse" id="verse" aria-label="Verse">
          <div className="inv-column">
            <p className="inv-cover__verse-text inv-display" aria-label={VERSE.text}>
              {words.map((w, i) => (
                <Fragment key={i}>
                  <span className="word" aria-hidden>
                    {i === 0 ? '“' : ''}
                    {w}
                    {i === words.length - 1 ? '”' : ''}
                  </span>
                  {i < words.length - 1 ? ' ' : ''}
                </Fragment>
              ))}
            </p>
            <p className="inv-label inv-cover__verse-source">{VERSE.source}</p>
          </div>
        </div>

        <div className="inv-cover__inner">
          <div className="inv-cover__top" style={{ textAlign: 'center' }}>
            <p className="inv-label" style={{ opacity: 0.85 }}>
              The wedding of Sita &amp; Fatan
            </p>
            <p className="inv-cover__tag inv-body">{COUPLE.hashtag}</p>
          </div>

          {fallback ? (
            gone ? (
              <div className="inv-paper" aria-hidden />
            ) : (
              <LetterFallback
                guestName={guestName}
                answered={answered}
                onOpen={() => {
                  onGesture()
                  openedRef2.current()
                }}
              />
            )
          ) : (
            <PaperLetter
              ref={paper}
              guestName={guestName}
              answered={answered}
              started={started}
              onRelease={(opening) => {
                if (opening) onGesture()
              }}
              onOpened={() => openedRef2.current()}
              onFallback={() => setFallback(true)}
            />
          )}

          <div className="inv-cover__cta">
            <div className="inv-label inv-cover__hint" style={fallback ? { visibility: 'hidden' } : undefined}>
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className="inv-cover__arrow" aria-hidden />
                Drag the letter up to open
              </p>
              <button
                type="button"
                className="inv-cover__tap"
                onClick={() => {
                  // Nothing starts unless the letter can actually leave: with
                  // the scene not up yet, music would play with no letter
                  // gone and no mute control on screen.
                  if (!paper.current?.ready()) return
                  onGesture()
                  void paper.current.dismiss()
                }}
              >
                or tap here to open
              </button>
            </div>
            <div className="inv-cover__next inv-scrollcue" style={{ display: 'none' }}>
              <span className="inv-scrollcue__capsule" aria-hidden>
                <span className="inv-scrollcue__dot" />
              </span>
              <p className="inv-label">Scroll down to continue</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * The softened photograph, painted once at the moment the letter leaves:
 * the cover image drawn at a twenty-fourth of its size, then a sixth, then
 * up to half, so bilinear scaling does the blurring and no filter ever runs.
 * Painted into the photo's own box with the same object-position, so the
 * cross-fade holds still. If the image is not ready or cannot be read, the
 * dim alone carries the verse.
 */
function paintSoft(root: HTMLElement | null) {
  const box = root?.querySelector<HTMLElement>('.inv-cover__photo')
  const img = box?.querySelector<HTMLImageElement>('img')
  const canvas = box?.querySelector<HTMLCanvasElement>('canvas.inv-cover__soft')
  if (!box || !img || !canvas || !img.complete || !img.naturalWidth) return
  try {
    // The photo's own box (inset -6% of the cover), not the cover's.
    const W = box.clientWidth
    const H = box.clientHeight
    const wide = window.matchMedia('(min-width: 900px)').matches
    const px = wide ? 0.5 : 0.47
    const py = wide ? 0.5 : 0.58
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight)
    const dw = img.naturalWidth * s
    const dh = img.naturalHeight * s
    const dx = (W - dw) * px
    const dy = (H - dh) * py

    const a = document.createElement('canvas')
    a.width = Math.max(2, Math.round(W / 24))
    a.height = Math.max(2, Math.round(H / 24))
    const b = document.createElement('canvas')
    b.width = Math.max(2, Math.round(W / 6))
    b.height = Math.max(2, Math.round(H / 6))
    const ga = a.getContext('2d')
    const gb = b.getContext('2d')
    const gc = canvas.getContext('2d')
    if (!ga || !gb || !gc) return
    ga.drawImage(img, dx / 24, dy / 24, dw / 24, dh / 24)
    gb.imageSmoothingEnabled = true
    gb.imageSmoothingQuality = 'high'
    gb.drawImage(a, 0, 0, b.width, b.height)
    canvas.width = Math.round(W / 2)
    canvas.height = Math.round(H / 2)
    gc.imageSmoothingEnabled = true
    gc.imageSmoothingQuality = 'high'
    gc.drawImage(b, 0, 0, canvas.width, canvas.height)
  } catch {
    // A tainted or half-loaded image. Nothing to do; the dim is enough.
  }
}
