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
      wheelMultiplier: 0.75,
      // Touch goes through Lenis too (2026-09-16). Native flings carried a
      // guest past whole sections; a shorter, softer fling keeps the page
      // readable for someone who does not know how to explore it. If iOS
      // fights this, turn syncTouch off and keep only the longer sections.
      syncTouch: !reduced,
      syncTouchLerp: 0.06,
      touchMultiplier: 0.8,
      touchInertiaExponent: 1.4,
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
