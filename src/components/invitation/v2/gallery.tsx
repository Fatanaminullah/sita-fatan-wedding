'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, ScrollTrigger } from '@/lib/invitation/gsap'
import { GALLERY_CANDID, GALLERY_PUBLIC } from './photos'
import { TRAVEL_PER_SCREEN, ribbonTravel } from './tunnel-ribbon'
import { COUPLE } from './content'
import { useCopy } from './lang'

const TunnelScene = dynamic(() => import('./tunnel-scene'), { ssr: false })

function canRunWebGL() {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number }
    if (nav.deviceMemory !== undefined && nav.deviceMemory < 3) return false
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

/** 1400px copies for the GPU: a plane that fills a 3x phone screen needs them. */


/**
 * The picture wall as a tunnel. Pinned for two screens: the guest's scroll
 * pushes the photographs past, the names sit in the middle, and after three
 * still seconds the tunnel drifts on its own.
 *
 * `candid` decides which set is loaded. The home series is requested only for
 * guests the lookup marks for it.
 */
export function Gallery({ candid }: { candid: boolean }) {
  // The files as supplied, at the size they were supplied. Nothing here
  // resizes them and nothing generates a second copy.
  const photos = candid ? GALLERY_CANDID : GALLERY_PUBLIC
  const ref = useRef<HTMLElement>(null)
  /** Where the guest is inside the hold. The tunnel reads this every frame. */
  const progress = useRef(0)
  const [near, setNear] = useState(false)
  const [webgl] = useState(() => typeof window !== 'undefined' && canRunWebGL())
  const c = useCopy()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '100% 0px 100% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        // The hold is bought from the ribbon, not guessed: enough scroll for
        // every photograph to travel its own length of the tunnel and leave,
        // three to a screen. Nine public photographs and fifteen candid ones
        // therefore get different holds, and both end empty.
        ScrollTrigger.create({
          trigger: ref.current,
          start: 'top top',
          end: `+=${Math.round((ribbonTravel(photos.length) / TRAVEL_PER_SCREEN) * 100)}%`,
          pin: true,
          onUpdate: (self) => {
            progress.current = self.progress
          },
        })
        gsap.from('.inv-tunnel__title', {
          opacity: 0,
          scale: 0.92,
          duration: 1.4,
          ease: 'power3.out',
          scrollTrigger: { trigger: ref.current, start: 'top 60%' },
        })
      })
    },
    { scope: ref }
  )

  return (
    <section ref={ref} id="gallery" className="inv-tunnel" aria-label="Gallery">
      {webgl ? (
        near ? <TunnelScene images={photos} progress={progress} /> : null
      ) : (
        <div className="inv-tunnel__fallback">
          {photos.slice(0, 6).map((p) => (
            <Image key={p.src} src={p.src} alt={p.alt ?? ''} width={450} height={600} sizes="45vw" quality={85} />
          ))}
        </div>
      )}

      <div className="inv-tunnel__title inv-display" aria-hidden>
        <span>
          <i>{COUPLE.bride.short}</i> &amp; <i>{COUPLE.groom.short}</i>
        </span>
      </div>
      <p className="inv-label inv-tunnel__hint">{c.gallery.hint}</p>
    </section>
  )
}
