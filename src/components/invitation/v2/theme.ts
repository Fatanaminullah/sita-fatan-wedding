/**
 * "Stone & Ink": the invitation's visual system, v2.
 *
 * Sampled from the prewedding photographs rather than the printed suite: warm
 * sandstone, ivory lace, olive leaves, and the black of the night series. The
 * monogram's oxblood survives as the only ink, so the site and the printed
 * card still read as one family.
 *
 * The page travels from ivory to charcoal top to bottom, the way the shoot
 * went from a morning at home to a night at the bar.
 */
export const INK = {
  /** Page ground. Sandstone at paper lightness. */
  stone: '#EDE6DC',
  /** Lighter step: cards, the RSVP sheet, type on dark grounds. */
  ivory: '#F7F3EC',
  /** Warm mid tone: rules, hard offset shadows, secondary type. */
  sand: '#C8B59A',
  /** From the greenery. Small doses only. */
  olive: '#6B735C',
  /** The night chapter's ground. Never pure black. */
  charcoal: '#191716',
  /** The monogram's ink. The single accent on the page. */
  oxblood: '#5E040E',
  /** Body copy on light grounds. */
  ink: '#2A2321',
  /** The ring, and nothing else. A material, not a colour. */
  gold: '#C9A24B',
} as const

/** One easing for every reveal, so the page moves as one body. */
export const EASE_OUT = 'power3.out'
export const EASE_INOUT = 'power2.inOut'
