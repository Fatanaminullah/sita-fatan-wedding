'use client'

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger } from '@/lib/invitation/gsap'

type Ctx = { lenis: React.RefObject<Lenis | null> }
const SmoothCtx = createContext<Ctx>({ lenis: { current: null } })

/**
 * Lenis drives the scroll, GSAP's ticker drives Lenis, ScrollTrigger listens
 * to Lenis. One clock for everything, so a scrubbed pin and a smoothed wheel
 * never disagree about where the page is.
 *
 * `locked` keeps the page at the cover until the guest taps Open. The lock is
 * a class on <html>, never overflow on <body>: sticky pins break the moment
 * body owns the scroll.
 */
export function SmoothScroll({ locked, children }: { locked: boolean; children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({
      lerp: reduced ? 1 : 0.09,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.2,
      // Native touch scroll on phones. Synthetic touch scrolling fights iOS.
      // Slowing the whole page down was tried on 2026-09-16 and read as heavy;
      // what the guest needed was not to fly past the information, which is
      // useCatch below, applied only where there is something to read.
      syncTouch: false,
    })
    lenisRef.current = lenis

    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('inv-locked', locked)
    if (locked) lenisRef.current?.stop()
    else lenisRef.current?.start()
    return () => html.classList.remove('inv-locked')
  }, [locked])

  return <SmoothCtx.Provider value={{ lenis: lenisRef }}>{children}</SmoothCtx.Provider>
}

export function useLenis() {
  return useContext(SmoothCtx).lenis
}

/**
 * A scroll a guest is reading at stays under this, in px/s. A fling does not.
 */
export const CATCH_VELOCITY = 1600

/**
 * Stop the page dead at `y`: the way a section full of information refuses
 * to be flown past. The fling's momentum is killed, the page lands on the
 * section, and the guest scrolls on by their own hand.
 *
 * Overflow hidden on <html> is what ends iOS's native momentum; Lenis's
 * stop ends its own smoothing. Both come off again after a beat. The class
 * is its own, not the RSVP's inv-locked, so neither lock can undo the other.
 */
export function useCatch() {
  const lenis = useLenis()
  return (y: number) => {
    const l = lenis.current
    const html = document.documentElement
    html.classList.add('inv-caught')
    l?.scrollTo(y, { immediate: true, force: true })
    l?.stop()
    window.scrollTo(0, y)
    window.setTimeout(() => {
      html.classList.remove('inv-caught')
      l?.start()
      ScrollTrigger.update()
    }, 450)
  }
}

/** Scroll to a section by id, through Lenis so ScrollTrigger stays in step. */
export function useScrollTo() {
  const lenis = useLenis()
  return (id: string, offset = 0) => {
    const el = document.getElementById(id)
    if (!el) return
    if (lenis.current) {
      // Lenis clamps a target to the limit it last measured. Right after the
      // sections mount that limit is still the cover's, so measure first.
      lenis.current.resize()
      lenis.current.scrollTo(el, { offset, duration: 1.4, force: true })
    } else el.scrollIntoView({ behavior: 'smooth' })
  }
}
