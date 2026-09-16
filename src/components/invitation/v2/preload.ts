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
const IMAGES = [PHOTOS.coverArch, VENUES.istiqlal, VENUES.luxus].map((p) => p.src)
/** The couple's panels: portrait on a phone, landscape on a desk. */
const panelsTall = (candid: boolean) => [PHOTOS.brideNight, candid ? PHOTOS.kitchen5 : PHOTOS.barCouple, PHOTOS.groomNight].map((p) => p.src)
const panelsWide = (candid: boolean) => [PHOTOS.brideNightWideDesk, candid ? PHOTOS.kitchen2 : PHOTOS.archStill, PHOTOS.groomDayWide].map((p) => p.src)

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

export function preloadInvitation(candid: boolean, onProgress: (done: number, total: number) => void) {
  const wide = window.matchMedia('(min-width: 900px) and (orientation: landscape)').matches
  const tasks: Promise<unknown>[] = [
    (document.fonts?.ready ?? Promise.resolve()).catch(() => undefined),
    ...IMAGES.map(loadImage),
    ...(wide ? panelsWide(candid) : panelsTall(candid)).map(loadImage),
    ...TEXTURES.map(loadImage),
    import('./paper-letter').catch(() => undefined),
    import('./ring-scene').catch(() => undefined),
    import('./tunnel-scene').catch(() => undefined),
    import('./dress-scene').catch(() => undefined),
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
