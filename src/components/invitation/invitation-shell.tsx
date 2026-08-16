import { Bodoni_Moda, Archivo } from 'next/font/google'

/**
 * The shared frame for the public pages: root and 404.
 *
 * Direction, decided 2026-08-16: **the printed suite's palette, the brief's
 * typography.** Blush ground and oxblood ink, because that is what guests will
 * be holding in their hands. No florals and no script, because
 * docs/INVITATION_UI_BRIEF.md rules both out and the owner kept that part.
 * The printed suite carries the roses and the calligraphy; the site is the
 * quiet member of the family.
 */

export const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-display',
})
export const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-text',
})

/** Sampled from the artwork, not invented. See globals.css. */
export const SUITE = {
  blush: '#F2D6CB',
  oxblood: '#5E040E',
  ink: '#2B1113',
} as const

/**
 * The date as a stacked graphic object, in heavy Archivo. Mirrors the printed
 * suite, where 10 / 10 / 26 is set as three stacked numerals rather than a
 * written date. The brief asks for the same treatment.
 */
export function DateBlock({ scale = 1 }: { scale?: number }) {
  return (
    <div
      className="flex flex-col items-center leading-none tabular-nums"
      style={{ fontFamily: 'var(--font-text)', color: SUITE.oxblood }}
      role="img"
      aria-label="10 October 2026"
    >
      {['10', '10', '26'].map((n, i) => (
        <span
          key={n + i}
          className="font-bold tracking-[0.06em]"
          style={{
            fontSize: `${1.5 * scale}rem`,
            // A hairline rule between the numerals, as on the card. Not a box:
            // the printed suite boxes them, but at screen sizes a full box
            // reads heavier than the rest of the page.
            borderTop: i === 0 ? 'none' : `1px solid ${SUITE.oxblood}33`,
            paddingTop: i === 0 ? 0 : `${0.35 * scale}rem`,
            marginTop: i === 0 ? 0 : `${0.35 * scale}rem`,
          }}
        >
          {n}
        </span>
      ))}
    </div>
  )
}
