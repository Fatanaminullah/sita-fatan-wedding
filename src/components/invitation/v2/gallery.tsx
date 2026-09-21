'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap, useGSAP, MOTION_OK, ScrollTrigger } from '@/lib/invitation/gsap'
import { GALLERY_CANDID, GALLERY_PUBLIC, type Photo } from './photos'
import { LIT_SLOTS, TRAVEL_PER_SCREEN, ribbonTravel } from './tunnel-ribbon'
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

/** Stable shuffles: the same guest, and every guest, sees the same order. */
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The set, then the set again in a different order.
 *
 * Eleven photographs went by too soon, and there are no more of them to
 * ask for. Walking the ribbon twice doubles the time in the tunnel; the
 * shuffle is what keeps the second pass from reading as a rerun, and the
 * seed is fixed so the order is the same for everyone and a note about
 * "the fourth photograph" still means something.
 *
 * The second pass is dealt rather than simply shuffled: a photograph is
 * only laid down if the same one is not still lit further up the tunnel.
 * Several planes are on screen at once, so a repeat that merely avoids
 * being adjacent can still be seen twice in one glance.
 *
 * The planes share their textures, so a second pass costs the GPU nothing
 * beyond its own geometry. See the note in tunnel-scene.tsx.
 */
function walkedTwice(photos: Photo[]): Photo[] {
  if (photos.length < 3) return photos
  const rand = mulberry32(0x5e1a5)
  const pool = photos.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const out = photos.slice()
  while (pool.length) {
    const lit = out.slice(-LIT_SLOTS)
    let pick = pool.findIndex((p) => !lit.some((q) => q.src === p.src))
    if (pick < 0) pick = 0
    out.push(pool.splice(pick, 1)[0])
  }
  return out
}

/**
 * The picture wall as a tunnel. Pinned for as long as the ribbon needs: the
 * guest's scroll pushes the photographs past and the names sit in the middle.
 *
 * `candid` decides which set is loaded. The home series is requested only for
 * guests the lookup marks for it.
 */
/**
 * The tunnel asks for the photographs through next/image rather than for the
 * files themselves.
 *
 * Not an edit and not a second copy in the repo: the originals stay in
 * /public untouched, and Next resizes on the server, once, then caches. It
 * has to happen because a texture is not a JPEG. A photograph on the GPU
 * costs width x height x 4 bytes whatever the file weighs, so the eleven
 * supplied frames came to 600MB of texture on the non-hijab invitation, and
 * an iPhone killed the tab as the section mounted (owner's recording,
 * 2026-09-21: white screen at the countdown, then the splash again).
 *
 * 1280 on the long edge is about 110MB for the set and still more pixels
 * than a plane ever occupies: they peak near 700px wide on a phone. A wide
 * screen can afford 1600.
 */
const TEXTURE_WIDTH = () => (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 1600 : 1280)

function textureSet(photos: Photo[]) {
  const w = TEXTURE_WIDTH()
  return photos.map((p) => ({
    ...p,
    src: `/_next/image?url=${encodeURIComponent(p.src)}&w=${w}&q=90`,
  }))
}

export function Gallery({ candid }: { candid: boolean }) {
  // The files as supplied, at the size they were supplied. Nothing here
  // resizes them and nothing generates a second copy.
  const set = candid ? GALLERY_CANDID : GALLERY_PUBLIC
  // Mounted only on the client (the scene is ssr: false), so the texture
  // width may read the real viewport without risking a hydration mismatch.
  const photos = useMemo(() => walkedTwice(textureSet(set)), [set])
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
        // three to a screen. Twenty-two of them now, the set walked twice,
        // so the hold grew with it and the tunnel still ends empty.
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
          {/* The no-WebGL fallback goes through <Image> in the ordinary way,
              from the original files, not from the tunnel's texture URLs. */}
          {set.slice(0, 6).map((p) => (
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
