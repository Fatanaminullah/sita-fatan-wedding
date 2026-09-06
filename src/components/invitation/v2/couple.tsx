'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { PHOTOS, type Photo } from './photos'
import { COUPLE, WEDDING_DATE } from './content'

/**
 * Bride and groom, as one held sequence.
 *
 * From the owner's recording of the reference: full-bleed panels, each next
 * one wiped in from the right edge, the outgoing image drifting a little; a
 * caption at the bottom keeps the active word bright and slides to centre
 * it; then the next section rises over the whole thing. (The reference also
 * grows a small picture into the first panel; the owner dropped that.)
 *
 * Three panels: the bride, the two of them, the groom. Held with CSS
 * sticky inside a tall wrapper (no ScrollTrigger pin),
 * the timeline scrubbed against the wrapper. The events section that follows
 * carries a -100lvh top margin and a higher z-index, so the last screen of
 * the wrapper is the cover.
 */
/** `wide` is the landscape frame a desk gets; phones keep the portrait. */
type Who = 'bride' | 'both' | 'groom'
type Panel = { photo: Photo; wide?: Photo; who: Who; pos?: string }

const PANELS: Panel[] = [
  { photo: PHOTOS.brideDay, wide: PHOTOS.brideDayWide, who: 'bride' },
  // The arch frame on both: cropped to a phone the two of them still sit
  // in the middle of it, which no portrait of the pair does.
  { photo: PHOTOS.archStill, who: 'both', pos: '57% 60%' },
  { photo: PHOTOS.groomDay, wide: PHOTOS.groomDayWide, who: 'groom' },
]

/** The handle, as a link; the only thing in the chrome a finger can press. */
function Instagram({ handle }: { handle: string }) {
  return (
    <a className="inv-name__ig inv-label" href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
      {handle}
    </a>
  )
}

export function Couple() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const captionRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const wrap = wrapRef.current
      const stage = stageRef.current
      const caption = captionRef.current
      if (!wrap || !stage || !caption) return
      const panels = gsap.utils.toArray<HTMLElement>('.inv-panel')
      const words = gsap.utils.toArray<HTMLElement>('.inv-caption__word')
      const dots = gsap.utils.toArray<HTMLElement>('.inv-dots__dot')
      const names: Record<Who, Element | null> = {
        bride: stage.querySelector('.inv-name--bride'),
        both: stage.querySelector('.inv-name--both'),
        groom: stage.querySelector('.inv-name--groom'),
      }

      // Which panel is on top, from progress. Also drives the caption and dots.
      let current = -1
      const setActive = (i: number) => {
        if (i === current) return
        current = i
        const who = PANELS[i].who
        words.forEach((w) => w.classList.toggle('is-active', w.dataset.who === who))
        // Only the visible block may be pressed; the others lie under it.
        for (const [k, el] of Object.entries(names)) el?.classList.toggle('is-active', k === who)
        dots.forEach((d, j) => d.classList.toggle('is-active', j === i))
        // Slide the caption so the active word sits at the centre.
        const active = words.find((w) => w.dataset.who === who)
        if (active) {
          const shift = caption.offsetWidth / 2 - (active.offsetLeft + active.offsetWidth / 2)
          gsap.to(caption.firstElementChild, { x: shift, duration: 0.6, ease: 'power3.out', overwrite: true })
        }
      }

      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: wrap,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.6,
            onUpdate: (self) => {
              const p = self.progress
              // Segment boundaries below: hold .5 / wipe 1, twice, then hold 1.
              const t = p * 4
              setActive(t < 1.0 ? 0 : t < 2.5 ? 1 : 2)
            },
          },
        })

        // Each next panel wipes in from the right; the outgoing drifts left.
        let at = 0.5
        for (let i = 1; i < panels.length; i++) {
          tl.fromTo(panels[i], { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', ease: 'none', duration: 1 }, at)
            .fromTo(panels[i].querySelector('img'), { xPercent: 8 }, { xPercent: 0, ease: 'none', duration: 1 }, at)
            .to(panels[i - 1].querySelector('img'), { xPercent: -8, ease: 'none', duration: 1 }, at)
          tl.to(names[PANELS[i - 1].who], { opacity: 0, y: -10, duration: 0.3 }, at + 0.2).fromTo(
            names[PANELS[i].who],
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.3 },
            at + 0.6
          )
          at += 1.5
        }
        // Hold while the next section rises over us.
        tl.to({}, { duration: 1 }, at)
      })
      mm.add(MOTION_REDUCED, () => {
        gsap.set(panels.slice(1), { clipPath: 'inset(0 0 0 100%)' })
        setActive(0)
      })
    },
    { scope: wrapRef }
  )

  return (
    <div ref={wrapRef} className="inv-couple-wrap" id="couple">
      <section ref={stageRef} className="inv-couple" aria-label="Bride and groom">
        {PANELS.map((p, i) => (
          <div key={i} className="inv-panel" style={{ zIndex: i + 1 }}>
            <Image
              src={p.photo.src}
              alt={p.photo.alt}
              fill
              sizes="100vw"
              quality={85}
              className={p.wide ? 'inv-panel__img inv-panel__img--tall' : 'inv-panel__img'}
              style={p.pos ? { objectPosition: p.pos } : undefined}
            />
            {p.wide ? (
              <Image src={p.wide.src} alt={p.wide.alt} fill sizes="100vw" quality={85} className="inv-panel__img inv-panel__img--wide" />
            ) : null}
          </div>
        ))}
        <div className="inv-panel__wash" aria-hidden />

        <div className="inv-couple__chrome">
          <div className="inv-dots" aria-hidden>
            {PANELS.map((_, i) => (
              <span key={i} className="inv-dots__dot" />
            ))}
          </div>

          <div className="inv-name inv-name--bride">
            <p className="inv-name__full inv-display">{COUPLE.bride.full}</p>
            <p className="inv-body inv-name__parents">{COUPLE.bride.parents}</p>
            <Instagram handle={COUPLE.bride.instagram} />
          </div>
          <div className="inv-name inv-name--both">
            <p className="inv-name__full inv-display">
              {COUPLE.bride.short} <i>and</i> {COUPLE.groom.short}
            </p>
            <p className="inv-body inv-name__parents">{WEDDING_DATE.long}</p>
          </div>
          <div className="inv-name inv-name--groom">
            <p className="inv-name__full inv-display">{COUPLE.groom.full}</p>
            <p className="inv-body inv-name__parents">{COUPLE.groom.parents}</p>
            <Instagram handle={COUPLE.groom.instagram} />
          </div>

          <div ref={captionRef} className="inv-caption inv-display" aria-hidden>
            <div className="inv-caption__track">
              <span className="inv-caption__word" data-who="bride">
                <i>the</i> Bride
              </span>
              <span className="inv-caption__sep">·</span>
              <span className="inv-caption__word" data-who="both">
                <i>the</i> Two
              </span>
              <span className="inv-caption__sep">·</span>
              <span className="inv-caption__word" data-who="groom">
                <i>the</i> Groom
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
