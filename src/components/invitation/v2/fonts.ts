import { Instrument_Serif, Jost } from 'next/font/google'

/**
 * Instrument Serif for display: a high-contrast editorial face with a true
 * italic, the voice of the references the owner pointed at, and light enough
 * to run at 30vw on a phone. Jost for text and UI, kept from v1: it is the
 * closest free Futura, which the printed suite uses.
 *
 * Self-hosted through next/font, so the page makes no third-party font
 * request.
 */
export const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

export const text = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-text',
  display: 'swap',
})
