'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED, ScrollTrigger } from '@/lib/invitation/gsap'
import type { WeddingEvent } from './content'
import type { Photo } from './photos'
import { EASE_INOUT, EASE_OUT } from './theme'

/**
 * One event, built as a door the guest walks through.
 *
 * The door is 200lvh tall and holds a 100lvh stage with position: sticky,
 * the way the vow holds the screen. Over that hold the venue name, set at
 * architectural scale, scales up and parts, the upper half going up and the
 * lower half going down, while the photograph behind it opens from a
 * door-height slit to full bleed. The guest ends up inside the venue, and
 * the practical block rises into the lower third.
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
}: {
  event: WeddingEvent
  photo: Photo
  /** object-position for the photograph. */
  focus: string
  /** Ivory on charcoal instead of ink on stone. */
  night: boolean
}) {
  const ref = useRef<HTMLElement>(null)

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
        // One proxy tween drives both, so the product is exact mid-way.
        const ap = { t: 0 }
        const applyAperture = () => {
          const t = ap.t
          const sx = 0.1 + 0.9 * t
          const sy = 0.62 + 0.38 * t
          const push = 1 + 0.12 * (1 - t)
          gsap.set(photoEl, { scaleX: sx, scaleY: sy })
          gsap.set(img, { scaleX: push / sx, scaleY: push / sy })
        }
        applyAperture()

        // Arrival is a one-shot, not scrubbed: the information behaves
        // calmly even though the spectacle did not.
        let arrived = false
        const arrive = gsap
          .timeline({ paused: true })
          .to(details, { opacity: 1, y: 0, duration: 1, ease: EASE_OUT, stagger: 0.07 })

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: door,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.35,
            invalidateOnRefresh: true,
            onToggle: (self) => door.classList.toggle('is-active', self.isActive),
            onUpdate: (self) => {
              if (self.progress > 0.72 && !arrived) {
                arrived = true
                arrive.play()
              } else if (self.progress < 0.64 && arrived) {
                arrived = false
                arrive.reverse()
              }
            },
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
          .to({}, { duration: 0.28 }) // hold the arrived state before the stage releases
      })

      mm.add(MOTION_REDUCED, () => {
        // The end state, standing still. The CSS drops the hold as well.
        gsap.set(photoEl, { opacity: 1, scaleX: 1, scaleY: 1 })
        gsap.set(img, { scaleX: 1, scaleY: 1 })
        gsap.set(dim, { opacity: 0 })
        gsap.set(wall, { autoAlpha: 0 })
        gsap.set(details, { opacity: 1, y: 0 })
      })

      return () => {
        ro.disconnect()
        document.fonts?.removeEventListener('loadingdone', refit)
      }
    },
    { scope: ref }
  )

  return (
    <article ref={ref} className={`inv-door${night ? ' inv-door--night' : ''}`} data-key={event.key} aria-label={event.name}>
      <div className="inv-door__stage">
        <div className="inv-door__photo" aria-hidden>
          <Image src={photo.src} alt="" fill sizes="100vw" quality={85} style={{ objectFit: 'cover', objectPosition: focus }} />
          <div className="inv-door__wash" />
          <div className="inv-door__dim" />
        </div>

        <div className="inv-door__wall">
          <p className="inv-label inv-door__kind">{event.name}</p>
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
          <p className="inv-label">{event.name}</p>
          <p className="inv-display inv-door__time">{event.time}</p>
          <p className="inv-label inv-door__timeline">{event.timeLine}</p>
          <p className="inv-display inv-door__venue">{event.venue}</p>
          <p className="inv-body inv-door__address">{event.address}</p>
          <a className="inv-btn inv-btn--ghost inv-btn--light" href={event.mapsUrl} target="_blank" rel="noreferrer">
            Open in Maps
          </a>
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
