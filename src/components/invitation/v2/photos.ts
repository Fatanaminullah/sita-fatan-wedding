/**
 * The prewedding photographs the page itself leans on (the cover, the couple
 * panels, the RSVP). The gallery has its own two sets, at the bottom of this
 * file. 3360px on the long edge, served from
 * /public/prewedding. next/image resizes and re-encodes per viewport.
 * /public/prewedding/md holds 1400px copies for the gallery's GPU textures,
 * generated from the same files.
 *
 * Re-encoded from the photographer's own 3360px files on 2026-09-19 at
 * quality 90 with no chroma subsampling. The set that shipped before came
 * through a web compressor at roughly 0.03 bits per pixel, which is what
 * "the photos still are not HD" was: the lace, the stonework and the neon
 * all carried blocking a phone could see. The delivered bytes are unchanged
 * in shape, because next/image re-encodes anyway; only the source it works
 * from is honest now.
 *
 * Three series from the same day: at home (warm brown and cream), the stone
 * estate (ivory lace, arches, the pool), and the night bar (all black, one
 * neon loop of light). The page is built on that arc.
 *
 * The home series is personal. It is shown only to guests whose lookup
 * returns `candid: true`: in the gallery, and as the two of them together
 * in the couple section (4248 on a phone, 3920 on a desk).
 */
export type Photo = {
  src: string
  width: number
  height: number
  alt: string
}

const L = (id: string, alt: string): Photo => ({
  src: `/prewedding/${id}.jpg`,
  width: 3360,
  height: 2240,
  alt,
})
const P = (id: string, alt: string): Photo => ({
  src: `/prewedding/${id}.jpg`,
  width: 2240,
  height: 3360,
  alt,
})

export const PHOTOS = {
  // Stone estate, day
  coverArch: L('4610', 'Sita and Fatan walking under a stone arch above a pool'),
  archStill: L('4556', 'The couple standing under the arch'),
  oliveTree: L('4702', 'Laughing beside an olive tree'),
  veil: L('4747', 'Under the veil'),
  stoneWall: P('4832', 'Either side of a stone pillar'),
  facade: L('5158', 'The estate facade'),
  brideDay: P('4441', 'Sita in ivory lace above the valley'),
  groomDay: P('5217', 'Fatan in a black suit'),
  /** Landscape frames of the same scenes, for the wide screen. */
  brideDayWide: { src: '/prewedding/bride-day-desktop.jpg', width: 3360, height: 2240, alt: 'Sita above the valley, the pool beside her' } satisfies Photo,
  groomDayWide: { src: '/prewedding/groom-day-desktop.jpg', width: 3360, height: 2240, alt: 'Fatan under the stone arches' } satisfies Photo,
  // Night bar
  barCouple: P('5454', 'At the bar under the neon loop'),
  brideNight: P('5551', 'Sita in black at the bar'),
  brideNightWideDesk: { src: '/prewedding/bride-night-desktop.jpg', width: 3360, height: 2240, alt: 'Sita at the bar under the neon loops' } satisfies Photo,
  brideNightWide: P('5528', 'Sita under the neon loop'),
  brideNightSeated: P('5550', 'Sita at the bar counter'),
  groomNight: P('5563', 'Fatan seated in the dark'),
  // Home, candid. Gated: the doorway frame is part of this series too, and
  // like the rest of it is not for the family's eyes.
  doorway: L('4295', 'Silhouettes in a glass doorway'),
  kitchen1: L('3834', 'Coffee in the kitchen'),
  kitchen2: L('3920', 'Laughing over coffee'),
  kitchen3: L('4096', 'At the kitchen counter'),
  kitchen4: P('4107', 'In the kitchen'),
  kitchen5: P('4248', 'A quiet moment'),
  /**
   * The studio set, unveiled, against the red curtain. Candid-gated like the
   * home series and phone-only: there are no landscape frames of it, so the
   * desk keeps the estate and the bar.
   */
  studioBride: {
    src: '/prewedding/studio-bride.jpg',
    width: 2016,
    height: 3024,
    alt: 'Sita in white lace before the red curtain',
  } satisfies Photo,
  studioGroom: {
    src: '/prewedding/studio-groom.jpg',
    width: 2016,
    height: 3024,
    alt: 'Fatan in black tie before the red curtain',
  } satisfies Photo,
  /**
   * The hijab invitation's couple panels on a phone, supplied by the owner on
   * 2026-09-20 and served as exported. The night series at the bar, but these
   * three rather than the prewedding set's: her own portrait, the two of them,
   * his own. The desk keeps its landscape frames.
   */
  hijabBride: {
    src: '/couple/hijab-bride.jpg',
    width: 1904,
    height: 2856,
    alt: 'Sita in black under the neon loop',
  } satisfies Photo,
  hijabBoth: {
    src: '/couple/hijab-both.jpg',
    width: 2240,
    height: 3360,
    alt: 'Sita and Fatan at the bar under the neon loop',
  } satisfies Photo,
  hijabGroom: {
    src: '/couple/hijab-groom.jpg',
    width: 1904,
    height: 2856,
    alt: 'Fatan seated under the neon loop',
  } satisfies Photo,
  /**
   * The same studio set in landscape, for the desk (owner, 2026-09-22).
   * Before these the non-hijab invitation borrowed the estate and the home
   * series on a wide screen, so the two layouts told different stories.
   */
  studioBrideWide: {
    src: '/couple/studio-bride-desktop.png',
    width: 2880,
    height: 1620,
    alt: 'Sita before the red curtain',
  } satisfies Photo,
  studioBothWide: {
    src: '/couple/studio-both-desktop.png',
    width: 2880,
    height: 1620,
    alt: 'Sita and Fatan before the red curtain',
  } satisfies Photo,
  studioGroomWide: {
    src: '/couple/studio-groom-desktop.png',
    width: 2880,
    height: 1620,
    alt: 'Fatan before the red curtain',
  } satisfies Photo,
  studioCouple: {
    src: '/prewedding/studio-couple.jpg',
    width: 2016,
    height: 3024,
    alt: 'Sita and Fatan arm in arm before the red curtain',
  } satisfies Photo,
} as const

/** The venues, supplied by the owner. */
export const VENUES = {
  istiqlal: { src: '/venues/istiqlal.jpg', width: 1800, height: 1440, alt: 'Masjid Istiqlal at dusk' } satisfies Photo,
  luxus: { src: '/venues/luxus.jpg', width: 1350, height: 1800, alt: 'The chandelier at Luxus Grand Ballroom' } satisfies Photo,
}

/**
 * The gallery, two sets, supplied by the owner on 2026-09-20 and served from
 * /public/gallery exactly as they were exported. No copy of them is made and
 * no size is generated: the tunnel loads these files. If they need to be
 * smaller, that is the owner's export, not this repo's re-encode.
 */
const G = (set: 'hijab' | 'nonhijab', file: string, width: number, height: number, alt: string): Photo => ({
  src: `/gallery/${set}/${file}.jpg`,
  width,
  height,
  alt,
})

/** Gallery order: for everyone. */
export const GALLERY_PUBLIC: Photo[] = [
  G('hijab', 'DPR_4618', 2000, 1333, 'Walking towards each other under the stone arch'),
  G('hijab', 'DPR_4752', 3360, 2240, 'Under the veil'),
  G('hijab', 'DPR_4832', 1500, 2250, 'Beside the stone pillar and the planter'),
  G('hijab', 'IMG_7515', 2240, 3360, 'The two of them in black'),
  G('hijab', 'DPR_4880', 1500, 2250, 'Above the valley, the pool below'),
  G('hijab', 'DPR_4715', 3360, 2240, 'Crossing the courtyard'),
  G('hijab', 'IMG_7516', 1904, 2898, 'On the stairs'),
  G('hijab', 'IMG_7521', 1850, 2775, 'Under the stone arch at night'),
  G('hijab', 'DPR_5176', 1500, 2250, 'The steps up to the arches'),
  G('hijab', 'IMG_7517', 1904, 2856, 'Along the arched corridor'),
  G('hijab', 'IMG_7522', 2856, 1904, 'Hand in hand in the lamplight'),
]

/** Gallery order: for the non-hijab invitation. */
export const GALLERY_CANDID: Photo[] = [
  G('nonhijab', 'DPR_3920', 6651, 4434, 'Laughing over coffee in the kitchen'),
  G('nonhijab', 'DPR_4752', 3360, 2240, 'Under the veil'),
  G('nonhijab', 'IMG_7509', 2016, 3024, 'Before the red curtain'),
  G('nonhijab', 'DPR_4295', 2500, 1667, 'Hand in hand past the arched window'),
  G('nonhijab', 'DPR_4880', 1500, 2250, 'Above the valley, the pool below'),
  G('nonhijab', 'DPR_4073', 6720, 4480, 'A rose held up in the kitchen'),
  G('nonhijab', 'DPR_4195', 3360, 2240, 'Coffee at the counter'),
  G('nonhijab', 'IMG_7501', 2240, 3360, 'At the bar under the neon loop'),
  G('nonhijab', 'DPR_5176', 1500, 2250, 'The steps up to the arches'),
  G('nonhijab', 'DPR_4246', 2240, 3360, 'A quiet moment at home'),
  G('nonhijab', 'IMG_7510', 2016, 3024, 'Seated before the red curtain'),
]
