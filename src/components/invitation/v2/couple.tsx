'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from '@/lib/invitation/gsap'
import { PHOTOS, type Photo } from './photos'
import { COUPLE } from './content'

/**
 * Bride and groom, as one held sequence.
 *
 * From the owner's recording of the reference: full-bleed panels, each next
 * one wiped in from the right edge, the outgoing image drifting a little; a
 * caption at the bottom keeps the active word bright and slides to centre
 * it; then the next section rises over the whole thing. (The reference also
 * grows a small picture into the first panel; the owner dropped that.)
 *
 * Four panels here: bride by day, bride by night, groom by day, groom by
 * night. Held with CSS sticky inside a tall wrapper (no ScrollTrigger pin),
 * the timeline scrubbed against the wrapper. The events section that follows
 * carries a -100svh top margin and a higher z-index, so the last screen of
 * the wrapper is the cover.
 */
type Panel = { photo: Photo; who: 'bride' | 'groom' }

const PANELS: Panel[] = [
  { photo: PHOTOS.brideDay, who: 'bride' },
  { photo: PHOTOS.brideNight, who: 'bride' },
  { photo: PHOTOS.groomDay, who: 'groom' },
  { photo: PHOTOS.groomNight, who: 'groom' },
]

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
      const names = { bride: stage.querySelector('.inv-name--bride'), groom: stage.querySelector('.inv-name--groom') }

      // Which panel is on top, from progress. Also drives the caption and dots.
      let current = -1
      const setActive = (i: number) => {
        if (i === current) return
        current = i
        const who = PANELS[i].who
        words.forEach((w) => w.classList.toggle('is-active', w.dataset.who === who))
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
              // Segment boundaries below: hold .5 / wipe 1, three times, then hold 1.
              const t = p * 5.5
              setActive(t < 1.0 ? 0 : t < 2.5 ? 1 : t < 4.0 ? 2 : 3)
            },
          },
        })

        // Each next panel wipes in from the right; the outgoing drifts left.
        let at = 0.5
        for (let i = 1; i < panels.length; i++) {
          tl.fromTo(panels[i], { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', ease: 'none', duration: 1 }, at)
            .fromTo(panels[i].querySelector('img'), { xPercent: 8 }, { xPercent: 0, ease: 'none', duration: 1 }, at)
            .to(panels[i - 1].querySelector('img'), { xPercent: -8, ease: 'none', duration: 1 }, at)
          if (PANELS[i].who !== PANELS[i - 1].who) {
            tl.to(names.bride, { opacity: 0, y: -10, duration: 0.3 }, at + 0.2).fromTo(
              names.groom,
              { opacity: 0, y: 10 },
              { opacity: 1, y: 0, duration: 0.3 },
              at + 0.6
            )
          }
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
            <Image src={p.photo.src} alt={p.photo.alt} fill sizes="100vw" quality={75} />
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
          </div>
          <div className="inv-name inv-name--groom">
            <p className="inv-name__full inv-display">{COUPLE.groom.full}</p>
            <p className="inv-body inv-name__parents">{COUPLE.groom.parents}</p>
          </div>

          <div ref={captionRef} className="inv-caption inv-display" aria-hidden>
            <div className="inv-caption__track">
              <span className="inv-caption__word" data-who="bride">
                <i>the</i> Bride
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
