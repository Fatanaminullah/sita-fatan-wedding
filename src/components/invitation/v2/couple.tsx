'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { PHOTOS, type Photo } from './photos'
import { COUPLE } from './content'

/**
 * One person, two photographs from the same day: ivory at noon, black at
 * night. A seam of light crosses the frame with the scroll and the second
 * picture takes over. The name arrives as the seam passes the middle.
 */
function Portrait({
  id,
  day,
  night,
  role,
  name,
  parents,
}: {
  id: string
  day: Photo
  night: Photo
  role: string
  name: string
  parents: string
}) {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: ref.current,
            start: 'top top',
            end: '+=180%',
            pin: true,
            scrub: 0.7,
          },
        })
        tl.fromTo(
          '.inv-portrait__layer--night',
          { clipPath: 'inset(0 0 0 100%)' },
          { clipPath: 'inset(0 0 0 0%)', ease: 'none', duration: 1 },
          0
        )
          .fromTo('.inv-portrait__seam', { left: '100%' }, { left: '0%', ease: 'none', duration: 1 }, 0)
          .fromTo('.inv-portrait__layer--day img', { scale: 1.08 }, { scale: 1, ease: 'none', duration: 1 }, 0)
          .fromTo('.inv-portrait__layer--night img', { scale: 1, }, { scale: 1.08, ease: 'none', duration: 1 }, 0)
          .from('.inv-portrait__role', { y: 30, opacity: 0, duration: 0.25, ease: 'power2.out' }, 0.05)
          .from('.inv-portrait__name', { y: 20, opacity: 0, duration: 0.25, ease: 'power2.out' }, 0.45)
          .from('.inv-portrait__parents', { opacity: 0, duration: 0.2 }, 0.6)
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id={id} className="inv-portrait" aria-label={role}>
      <div className="inv-portrait__layer inv-portrait__layer--day">
        <Image src={day.src} alt={day.alt} fill sizes="100vw" quality={75} />
      </div>
      <div className="inv-portrait__layer inv-portrait__layer--night">
        <Image src={night.src} alt={night.alt} fill sizes="100vw" quality={75} />
      </div>
      <div className="inv-portrait__seam" aria-hidden />
      <div className="inv-portrait__wash" aria-hidden />
      <div className="inv-portrait__caption">
        <h2 className="inv-portrait__role inv-display">
          <i>the</i> {role}
        </h2>
        <p className="inv-portrait__name inv-display">{name}</p>
        <p className="inv-portrait__parents inv-body" style={{ marginTop: '0.5rem', opacity: 0.75 }}>
          {parents}
        </p>
      </div>
    </section>
  )
}

export function Couple() {
  return (
    <>
      <Portrait
        id="bride"
        day={PHOTOS.brideDay}
        night={PHOTOS.brideNight}
        role="Bride"
        name={COUPLE.bride.full}
        parents={COUPLE.bride.parents}
      />
      <Portrait
        id="groom"
        day={PHOTOS.groomDay}
        night={PHOTOS.groomNight}
        role="Groom"
        name={COUPLE.groom.full}
        parents={COUPLE.groom.parents}
      />
    </>
  )
}
