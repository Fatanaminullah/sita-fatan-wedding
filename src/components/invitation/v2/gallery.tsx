'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, ScrollTrigger } from '@/lib/invitation/gsap'
import { GALLERY_CANDID, GALLERY_PUBLIC, type Photo } from './photos'
import { COUPLE } from './content'

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

/** 900px copies for the GPU; the 1800px originals are for the lightbox elsewhere. */
const small = (p: Photo) => ({ src: p.src.replace('/prewedding/', '/prewedding/sm/'), alt: p.alt })

/**
 * The picture wall as a tunnel. Pinned for two screens: the guest's scroll
 * pushes the photographs past, the names sit in the middle, and after three
 * still seconds the tunnel drifts on its own.
 *
 * `candid` decides which set is loaded. The home series is requested only for
 * guests the lookup marks for it.
 */
export function Gallery({ candid }: { candid: boolean }) {
  const photos = (candid ? GALLERY_CANDID : GALLERY_PUBLIC).map(small)
  const ref = useRef<HTMLElement>(null)
  const impulse = useRef(0)
  const [near, setNear] = useState(false)
  const [webgl] = useState(() => typeof window !== 'undefined' && canRunWebGL())

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
        let last = 0
        ScrollTrigger.create({
          trigger: ref.current,
          start: 'top top',
          end: '+=220%',
          pin: true,
          onUpdate: (self) => {
            // Scroll velocity, folded into the tunnel's momentum.
            const v = self.getVelocity()
            if (Math.abs(v - last) > 1) impulse.current += v * 0.00035
            last = v
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
        near ? <TunnelScene images={photos} impulse={impulse} visibleCount={10} speed={1.1} /> : null
      ) : (
        <div className="inv-tunnel__fallback">
          {photos.slice(0, 6).map((p) => (
            <Image key={p.src} src={p.src} alt={p.alt ?? ''} width={450} height={600} sizes="45vw" quality={70} />
          ))}
        </div>
      )}

      <div className="inv-tunnel__title inv-display" aria-hidden>
        <span>
          <i>{COUPLE.bride.short}</i> &amp; <i>{COUPLE.groom.short}</i>
        </span>
      </div>
      <p className="inv-label inv-tunnel__hint">Scroll to wander</p>
    </section>
  )
}
