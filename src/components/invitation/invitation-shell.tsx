import { Bodoni_Moda, Jost } from 'next/font/google'

/**
 * The shared frame for the public pages: root, 404 and the guest greeting.
 *
 * Direction, decided 2026-08-16: the printed suite's palette, the brief's
 * typography. No florals, no script.
 *
 * ## Why the ground is not the artwork's blush
 *
 * The blush in `richlink.png` and `favicon.png` is exactly `#F2D6CB`, and the
 * first build used it full-bleed. It read as pink, because area changes the
 * reading: on the card that blush is a small panel surrounded by white paper
 * and broken up by rose linework, where on a screen it was the whole viewport.
 *
 * The printed suite is white-paper dominant with blush panels. The invitation
 * card itself is white with red type. So the ratio here is inverted to match:
 * warm near-white ground, blush as the accent that carries held objects, and
 * oxblood as the only ink. Same three colours, printed proportions.
 */

// Bodoni for display: the printed suite sets the names in a high-contrast
// didone, and this is that voice. Jost for text and UI, replacing Archivo:
// Archivo is a workhorse grotesque and read as software, where the card's sans
// is geometric. Jost is the closest good free Futura, which is what the suite
// is reaching for. Didone plus geometric grotesque is the classic editorial
// pairing, and it stays inside the brief's no-script rule.
export const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-display',
})
export const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-text',
})

export const SUITE = {
  /** Page ground. The blush hue at near-paper lightness, so a full viewport of
   *  it reads as paper rather than as pink. */
  paper: '#FAF4F0',
  /** The artwork's blush, sampled exactly. Panels and held objects only. */
  blush: '#F2D6CB',
  /** The monogram's ink. The only ink on these pages. */
  oxblood: '#5E040E',
  /** Body copy. Warm near-black, never pure. */
  ink: '#33201C',
} as const

/**
 * The date as a stacked graphic object, mirroring the printed suite where
 * 10 / 10 / 26 is set as three stacked numerals rather than a written date.
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
          className="font-medium"
          style={{
            fontSize: `${1.35 * scale}rem`,
            letterSpacing: '0.22em',
            // Optical centring: the tracking adds space after the last glyph,
            // which drags a centred block visibly left without this.
            textIndent: '0.22em',
            borderTop: i === 0 ? 'none' : `1px solid ${SUITE.oxblood}2E`,
            paddingTop: i === 0 ? 0 : `${0.4 * scale}rem`,
            marginTop: i === 0 ? 0 : `${0.4 * scale}rem`,
          }}
        >
          {n}
        </span>
      ))}
    </div>
  )
}

/** Small tracked label. Used for "The wedding of", "Kepada", the footer. */
export function Label({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <p
      className={`text-[0.68rem] font-medium uppercase ${className}`}
      style={{
        fontFamily: 'var(--font-text)',
        letterSpacing: '0.3em',
        textIndent: '0.3em',
        ...style,
      }}
    >
      {children}
    </p>
  )
}
