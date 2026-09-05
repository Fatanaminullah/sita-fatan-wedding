import { GALLERY_PUBLIC, PHOTOS, VENUES } from './photos'

/**
 * What the splash waits for, so nothing below the cover arrives late.
 *
 * Fonts, the photographs every section leans on, the first gallery
 * textures, and the three.js chunks (the ring, the tunnel, the letter).
 * Each item counts once toward progress, resolves whether it succeeded or
 * not, and the whole thing is capped by the loader's ceiling: a slow link
 * shortens the list, it never blocks the invitation.
 */
const IMAGES = [
  PHOTOS.coverArch,
  PHOTOS.facade,
  PHOTOS.brideDay,
  PHOTOS.brideNight,
  PHOTOS.groomDay,
  PHOTOS.groomNight,
  VENUES.istiqlal,
  VENUES.luxus,
  PHOTOS.barCouple,
].map((p) => p.src)

const TEXTURES = GALLERY_PUBLIC.slice(0, 6).map((p) => p.src.replace('/prewedding/', '/prewedding/md/'))

function loadImage(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image()
    img.onload = () => {
      img.decode().catch(() => undefined).finally(resolve)
    }
    img.onerror = () => resolve()
    img.src = src
  })
}

export function preloadInvitation(onProgress: (done: number, total: number) => void) {
  const tasks: Promise<unknown>[] = [
    (document.fonts?.ready ?? Promise.resolve()).catch(() => undefined),
    ...IMAGES.map(loadImage),
    ...TEXTURES.map(loadImage),
    import('./paper-letter').catch(() => undefined),
    import('./ring-scene').catch(() => undefined),
    import('./tunnel-scene').catch(() => undefined),
  ]
  const total = tasks.length
  let done = 0
  onProgress(0, total)
  return Promise.all(
    tasks.map((t) =>
      t.finally(() => {
        done++
        onProgress(done, total)
      })
    )
  )
}
