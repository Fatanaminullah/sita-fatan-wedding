'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED, ScrollTrigger } from '@/lib/invitation/gsap'
import { CATCH_VELOCITY, useCatch } from './smooth-scroll'
import type { WeddingEvent } from './content'
import { useCopy } from './lang'
import type { Photo } from './photos'
import { EASE_INOUT, EASE_OUT } from './theme'

/**
 * One event, built as a door the guest walks through.
 *
 * The door is 300lvh tall and holds a 100lvh stage with position: sticky,
 * the way the vow holds the screen. Over the first part of that hold the venue name, set at
 * architectural scale, scales up and parts, the upper half going up and the
 * lower half going down, while the photograph behind it opens from a
 * door-height slit to full bleed. The guest ends up inside the venue, and
 * the practical block rises into the lower third. Then the room stands
 * still for the rest of the hold (about 123vh of scroll) so the details
 * can be read before the page moves on.
 *
 * A guest who flings through it is caught: the page stops where the details
 * have arrived, once per door per visit, and they scroll on themselves.
 * Sita's worry was exactly that a fast scroll skipped the times and places.
 *
 * Everything that moves is transform and opacity. No canvas, no filter, no
 * clip-path: the section sits close enough to the vow's ring that a second
 * live canvas on a mid-range Android was the one cost this design had to
 * refuse. See docs/superpowers/specs/2026-09-14-events-pass-through-design.md.
 */
export function EventDoor({
  event,
  photo,
  focus,
  night,
  note,
}: {
  event: WeddingEvent
  photo: Photo
  /** object-position for the photograph. */
  focus: string
  /** Ivory on charcoal instead of ink on stone. */
  night: boolean
  /** Who this door is for. Set only where a guest may be seeing a door they do not hold. */
  note?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const c = useCopy()
  const catchAt = useCatch()
  const words = c.events[event.key]

  useGSAP(
    () => {
      const door = ref.current
      if (!door) return
      const q = <T extends HTMLElement>(sel: string) => door.querySelector<T>(sel)
      const stage = q('.inv-door__stage')
      const wall = q('.inv-door__wall')
      const kind = q('.inv-door__kind')
      const up = q('.inv-door__up')
      const down = q('.inv-door__down')
      const photoEl = q('.inv-door__photo')
      const img = q<HTMLImageElement>('.inv-door__photo img')
      const dim = q('.inv-door__dim')
      if (!stage || !wall || !kind || !up || !down || !photoEl || !img || !dim) return
      const details = Array.from(door.querySelectorAll<HTMLElement>('.inv-door__details > *'))

      // Fit on mount, again as fonts land, again when the wall changes
      // width. Each refit re-measures the exits below; the refresh is the
      // safe, batched one, since every door refits on the same font event.
      fitLines(wall)
      const refit = () => {
        fitLines(wall)
        ScrollTrigger.refresh(true)
      }
      let lastWidth = wall.clientWidth
      const ro = new ResizeObserver(() => {
        if (wall.clientWidth === lastWidth) return
        lastWidth = wall.clientWidth
        refit()
      })
      ro.observe(wall)
      document.fonts?.ready.then(refit, () => undefined)
      document.fonts?.addEventListener('loadingdone', refit)

      const mm = gsap.matchMedia()

      mm.add(MOTION_OK, () => {
        // The aperture: the outer box scales down to a slit and the image is
        // counter-scaled, so the opening grows and the room behind it holds
        // still. A 1.12 push-in settling to 1 is the walk into the room.
        // One proxy tween drives both, so the product is exact mid-way. The
        // setters are made once: this runs every scrubbed frame, and a
        // tween allocated per frame is the kind of cost the budget refuses.
        const setPhoto = gsap.quickSetter(photoEl, 'css')
        const setImg = gsap.quickSetter(img, 'css')
        const ap = { t: 0 }
        const applyAperture = () => {
          const t = ap.t
          const sx = 0.1 + 0.9 * t
          const sy = 0.62 + 0.38 * t
          const push = 1 + 0.12 * (1 - t)
          setPhoto({ scaleX: sx, scaleY: sy })
          setImg({ scaleX: push / sx, scaleY: push / sy })
        }
        applyAperture()

        // Arrival is a one-shot, not scrubbed: the information behaves
        // calmly even though the spectacle did not. autoAlpha, so the Maps
        // button is out of the tab order until it can be seen.
        let arrived = false
        const arrive = gsap
          .timeline({ paused: true })
          .to(details, { autoAlpha: 1, y: 0, duration: 1, ease: EASE_OUT, stagger: 0.07 })

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          // Keyed to this timeline's own playhead (in seconds of timeline
          // time, not progress, so the hold's length never moves it): the
          // scrub lags the scroll by up to 0.35s, and a flick would
          // otherwise start the arrival while the halves were still over
          // the details. 0.72 of the playhead is past their exit.
          onUpdate: () => {
            const t = tl.time()
            if (t > 0.72 && !arrived) {
              arrived = true
              arrive.play()
            } else if (t < 0.64 && arrived) {
              arrived = false
              arrive.reverse()
            }
          },
          scrollTrigger: {
            trigger: door,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.35,
            invalidateOnRefresh: true,
            onToggle: (self) => door.classList.toggle('is-active', self.isActive),
          },
        })

        tl.to(photoEl, { opacity: 1, duration: 0.1 }, 0.06)
          .to(kind, { opacity: 0, duration: 0.14 }, 0.12)
          // Each half travels until it is entirely off the stage: the upper
          // half's bottom edge past the top, the lower half's top edge past
          // the bottom. Measured transform-free and re-measured on refresh.
          .to(up, { y: () => -(topInStage(up, stage) + up.offsetHeight) - 24, scale: 2.4, ease: 'power2.in', duration: 0.6 }, 0.12)
          .to(down, { y: () => stage.clientHeight - topInStage(down, stage) + 24, scale: 2.4, ease: 'power2.in', duration: 0.6 }, 0.12)
          .to(ap, { t: 1, ease: EASE_INOUT, duration: 0.6, onUpdate: applyAperture }, 0.1)
          .to(dim, { opacity: 0, duration: 0.45 }, 0.32)
          // The hold: the arrived room stands still. The spectacle above
          // ends at 0.77; with 200lvh of scroll behind this timeline, 1.23
          // of hold keeps the walk at about 77vh and leaves about 123vh of
          // reading before the stage releases.
          .to({}, { duration: 1.23 })

        // The catch. 0.5 of the door is timeline time 1.0: the halves are
        // gone and the arrival has been set off at 0.72, so the guest lands
        // on the room with the details rising into it.
        const CATCH_AT = 0.5
        let caught = false
        const maybeCatch = (self: ScrollTrigger, left: boolean) => {
          if (caught || self.direction !== 1) return
          if (!left && self.progress < CATCH_AT) return
          if (Math.abs(self.getVelocity()) < CATCH_VELOCITY) return
          caught = true
          catchAt(self.start + (self.end - self.start) * CATCH_AT)
        }
        ScrollTrigger.create({
          trigger: door,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => maybeCatch(self, false),
          // A fling fast enough to cross the whole door between two frames
          // never reports an update inside it.
          onLeave: (self) => maybeCatch(self, true),
        })
      })

      mm.add(MOTION_REDUCED, () => {
        // The end state, standing still. The CSS drops the hold as well.
        gsap.set(photoEl, { opacity: 1, scaleX: 1, scaleY: 1 })
        gsap.set(img, { scaleX: 1, scaleY: 1 })
        gsap.set(dim, { opacity: 0 })
        gsap.set(wall, { autoAlpha: 0 })
        gsap.set(details, { autoAlpha: 1, y: 0 })
      })

      return () => {
        ro.disconnect()
        document.fonts?.removeEventListener('loadingdone', refit)
      }
    },
    { scope: ref }
  )

  return (
    <article ref={ref} className={`inv-door${night ? ' inv-door--night' : ''}`} data-key={event.key} aria-label={words.name}>
      <div className="inv-door__stage">
        <div className="inv-door__photo" aria-hidden>
          <Image src={photo.src} alt="" fill sizes="100vw" quality={85} style={{ objectFit: 'cover', objectPosition: focus }} />
          <div className="inv-door__wash" />
          <div className="inv-door__dim" />
        </div>


        <div className="inv-door__wall">
          <p className="inv-label inv-door__kind">{words.name}</p>
          <h2 className="inv-door__name" aria-label={event.venue}>
            <span className="inv-door__up" aria-hidden>
              {event.wall.up.map((line) => (
                <span key={line} className="inv-door__line">
                  <span className="inv-door__ink">{line}</span>
                </span>
              ))}
            </span>
            <span className="inv-door__down" aria-hidden>
              {event.wall.down.map((line) => (
                <span key={line} className="inv-door__line">
                  <span className="inv-door__ink">{line}</span>
                </span>
              ))}
            </span>
          </h2>
        </div>

        <div className="inv-door__details">
          {/* What the details are read against: one soft black shape behind
              them, blurred at its own edges so it has no outline at all. The
              photograph underneath stays sharp; only the ground behind the
              words goes dark. It rises with the block, so nothing sits there
              waiting while the room opens. */}
          <div className="inv-door__halo" aria-hidden />
          <p className="inv-label">{words.name}</p>
          {note ? <p className="inv-body inv-door__note">{note}</p> : null}
          <p className="inv-display inv-door__time">{event.time}</p>
          <p className="inv-label inv-door__timeline">{words.timeLine}</p>
          <p className="inv-display inv-door__venue">{event.venue}</p>
          <p className="inv-body inv-door__address">{event.address}</p>
          {words.directions && (
            <div className="inv-body inv-door__directions">
              {words.directions.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
          {/* The arrival animates this wrapper, never the button: GSAP leaves
              an inline transform behind, which would beat .inv-btn:active. */}
          <div className="inv-door__cta">
            <a className="inv-btn inv-btn--ghost inv-btn--light" href={event.mapsUrl} target="_blank" rel="noreferrer">
              {c.openMaps}
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}

/**
 * Each line of the name is sized to touch both gutters. The ink, an
 * inline-block, is what gets measured: a block can be stretched by its
 * container, an inline-block cannot, and every grid on the way down is
 * minmax(0, 1fr) so the wall's own width never comes from its content.
 */
function fitLines(wall: HTMLElement) {
  const target = wall.clientWidth
  for (const line of wall.querySelectorAll<HTMLElement>('.inv-door__line')) {
    const ink = line.firstElementChild as HTMLElement | null
    if (!ink) continue
    line.style.fontSize = '100px'
    const w = ink.offsetWidth
    if (!(w > 0)) continue
    let size = (100 * target) / w
    line.style.fontSize = `${size.toFixed(2)}px`
    // Rounding can leave it a pixel over. Never past the gutter.
    if (ink.offsetWidth > target) {
      size *= target / ink.offsetWidth
      line.style.fontSize = `${size.toFixed(2)}px`
    }
  }
}

/** Distance from the top of the stage to the top of `el`, ignoring transforms. */
function topInStage(el: HTMLElement, stage: HTMLElement) {
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== stage) {
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return y
}
