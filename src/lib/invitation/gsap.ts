'use client'

import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { SplitText } from 'gsap/SplitText'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'

/**
 * One registration for the whole invitation. Every section imports gsap from
 * here so the plugins are guaranteed registered before the first tween, and
 * the admin bundle, which never imports this file, never carries them.
 */
gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin, SplitText, DrawSVGPlugin)

export { gsap, useGSAP, ScrollTrigger, SplitText }

/** Guests who asked the OS for less motion get end states, no pins, no scrubs. */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)'
export const MOTION_REDUCED = '(prefers-reduced-motion: reduce)'
