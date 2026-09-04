/**
 * The prewedding photographs, resized to 1800px on the long edge and served
 * from /public/prewedding. next/image resizes further per viewport.
 *
 * Three series from the same day: at home (warm brown and cream), the stone
 * estate (ivory lace, arches, the pool), and the night bar (all black, one
 * neon loop of light). The page is built on that arc.
 *
 * The home series is personal. It is shown only to guests whose lookup
 * returns `candid: true`, and appears nowhere except the gallery.
 */
export type Photo = {
  src: string
  width: number
  height: number
  alt: string
}

const L = (id: string, alt: string): Photo => ({
  src: `/prewedding/${id}.jpg`,
  width: 1800,
  height: 1200,
  alt,
})
const P = (id: string, alt: string): Photo => ({
  src: `/prewedding/${id}.jpg`,
  width: 1200,
  height: 1800,
  alt,
})

export const PHOTOS = {
  // Stone estate, day
  coverArch: L('4610', 'Sita and Fatan walking under a stone arch above a pool'),
  doorway: L('4295', 'Silhouettes in a glass doorway'),
  archStill: L('4556', 'The couple standing under the arch'),
  oliveTree: L('4702', 'Laughing beside an olive tree'),
  veil: L('4747', 'Under the veil'),
  stoneWall: P('4832', 'Either side of a stone pillar'),
  facade: L('5158', 'The estate facade'),
  brideDay: P('4441', 'Sita in ivory lace above the valley'),
  groomDay: P('5217', 'Fatan in a black suit'),
  // Night bar
  barCouple: P('5454', 'At the bar under the neon loop'),
  brideNight: P('5551', 'Sita in black at the bar'),
  brideNightWide: P('5528', 'Sita under the neon loop'),
  brideNightSeated: P('5550', 'Sita at the bar counter'),
  groomNight: P('5563', 'Fatan seated in the dark'),
  // Home, candid. Gated.
  kitchen1: L('3834', 'Coffee in the kitchen'),
  kitchen2: L('3920', 'Laughing over coffee'),
  kitchen3: L('4096', 'At the kitchen counter'),
  kitchen4: P('4107', 'In the kitchen'),
  kitchen5: P('4248', 'A quiet moment'),
} as const

/** Gallery order: for everyone. */
export const GALLERY_PUBLIC: Photo[] = [
  PHOTOS.stoneWall,
  PHOTOS.veil,
  PHOTOS.oliveTree,
  PHOTOS.brideDay,
  PHOTOS.facade,
  PHOTOS.archStill,
  PHOTOS.brideNightSeated,
  PHOTOS.barCouple,
  PHOTOS.groomDay,
  PHOTOS.doorway,
]

/** Gallery order: for candid guests. The home series is woven in, not appended. */
export const GALLERY_CANDID: Photo[] = [
  PHOTOS.kitchen2,
  PHOTOS.stoneWall,
  PHOTOS.kitchen5,
  PHOTOS.veil,
  PHOTOS.oliveTree,
  PHOTOS.kitchen1,
  PHOTOS.brideDay,
  PHOTOS.facade,
  PHOTOS.kitchen4,
  PHOTOS.archStill,
  PHOTOS.brideNightSeated,
  PHOTOS.kitchen3,
  PHOTOS.barCouple,
  PHOTOS.groomDay,
]
