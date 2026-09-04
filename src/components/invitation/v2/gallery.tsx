'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK } from '@/lib/invitation/gsap'
import { GALLERY_CANDID, GALLERY_PUBLIC, type Photo } from './photos'

/**
 * A ring of photographs in CSS 3D. Drag to spin, scrolling past turns it a
 * little too, tap one to see it whole. No WebGL: a transform on one element
 * and the GPU composites the rest.
 *
 * `candid` decides which set is on the wall. The home series is shown only to
 * guests the lookup marks for it and is not in the bundle for anyone else,
 * because the file names sit in this module for both sets; what differs is
 * which are rendered, and so which are ever requested.
 */
export function Gallery({ candid }: { candid: boolean }) {
  const photos = candid ? GALLERY_CANDID : GALLERY_PUBLIC
  const ref = useRef<HTMLElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const rotation = useRef({ y: 0 })
  const [open, setOpen] = useState<Photo | null>(null)

  const n = photos.length
  const step = 360 / n

  useGSAP(
    () => {
      const ring = ringRef.current
      if (!ring) return
      const render = () => gsap.set(ring, { rotateY: rotation.current.y })

      // Drag with inertia.
      let startX = 0
      let startY = 0
      let lastX = 0
      let lastT = 0
      let velocity = 0
      let dragging = false
      let moved = false
      let spin: gsap.core.Tween | null = null

      const down = (e: PointerEvent) => {
        dragging = true
        moved = false
        startX = lastX = e.clientX
        startY = e.clientY
        lastT = performance.now()
        velocity = 0
        spin?.kill()
      }
      const move = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - lastX
        const t = performance.now()
        velocity = dx / Math.max(1, t - lastT)
        lastX = e.clientX
        lastT = t
        if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) moved = true
        rotation.current.y += dx * 0.35
        render()
      }
      const up = () => {
        if (!dragging) return
        dragging = false
        spin = gsap.to(rotation.current, {
          y: rotation.current.y + velocity * 220,
          duration: 1.4,
          ease: 'power3.out',
          onUpdate: render,
        })
      }
      ring.parentElement?.addEventListener('pointerdown', down)
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)

      // Cards only open on a tap, not at the end of a drag.
      const clickGuard = (e: MouseEvent) => {
        if (moved) e.stopPropagation()
      }
      ring.addEventListener('click', clickGuard, true)

      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.to(rotation.current, {
          y: '+=140',
          ease: 'none',
          onUpdate: render,
          scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: 1 },
        })
        gsap.from('.inv-gallery__head > *', {
          y: 24,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: 'top 75%' },
        })
      })

      return () => {
        ring.parentElement?.removeEventListener('pointerdown', down)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        ring.removeEventListener('click', clickGuard, true)
      }
    },
    { scope: ref }
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Radius so cards sit shoulder to shoulder with a small gap.
  const radius = `calc(min(62vw, 300px) * ${(1 / (2 * Math.tan(Math.PI / n))) * 1.15})`

  return (
    <section ref={ref} id="gallery" className="inv-section inv-gallery" aria-label="Gallery">
      <div className="inv-column inv-gallery__head" style={{ textAlign: 'center' }}>
        <p className="inv-label" style={{ color: 'var(--oxblood)', opacity: 0.7 }}>
          Before the day
        </p>
        <h2 className="inv-display" style={{ fontSize: 'clamp(2.6rem, 11vw, 4.6rem)', marginTop: '0.6rem' }}>
          A few <i>pictures.</i>
        </h2>
        <p className="inv-body" style={{ marginTop: '0.75rem', opacity: 0.6, fontSize: '0.9rem' }}>
          Drag to turn. Tap to look closer.
        </p>
      </div>

      <div className="inv-carousel" style={{ marginTop: '2rem' }}>
        <div ref={ringRef} className="inv-carousel__ring">
          {photos.map((p, i) => (
            <button
              key={p.src}
              type="button"
              className="inv-carousel__card"
              style={{ transform: `rotateY(${i * step}deg) translateZ(${radius})` }}
              onClick={() => setOpen(p)}
              aria-label={`Open photo: ${p.alt}`}
            >
              <Image src={p.src} alt="" width={300} height={400} sizes="300px" quality={70} draggable={false} />
            </button>
          ))}
        </div>
      </div>

      {open ? (
        <div className="inv-lightbox" role="dialog" aria-modal aria-label={open.alt} onClick={() => setOpen(null)}>
          <Image src={open.src} alt={open.alt} width={open.width} height={open.height} sizes="100vw" quality={80} priority />
          <button
            type="button"
            className="inv-iconbtn"
            style={{ position: 'absolute', top: 'max(1rem, env(safe-area-inset-top))', right: '1rem', color: 'var(--ivory)' }}
            aria-label="Close"
            onClick={() => setOpen(null)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l14 14M16 2L2 16" />
            </svg>
          </button>
        </div>
      ) : null}
    </section>
  )
}
