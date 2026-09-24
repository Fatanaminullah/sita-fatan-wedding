import { galleryFor, PHOTOS, VENUES } from './photos'

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
const panelsTall = (candid: boolean) =>
  (candid
    ? [PHOTOS.studioBride, PHOTOS.studioCouple, PHOTOS.studioGroom]
    : [PHOTOS.hijabBride, PHOTOS.hijabBoth, PHOTOS.hijabGroom]
  ).map((p) => p.src)
const panelsWide = (candid: boolean) =>
  (candid
    ? [PHOTOS.studioBrideWide, PHOTOS.studioBothWide, PHOTOS.studioGroomWide]
    : [PHOTOS.brideDayWide, PHOTOS.archStill, PHOTOS.groomDayWide]
  ).map((p) => p.src)

/**
 * The first few gallery frames, as the tunnel will ask for them: the files
 * themselves, at full size. They are the largest thing the splash waits for,
 * so it takes four and lets the rest arrive behind the cover.
 */
const textures = (candid: boolean, hideHandHolding: boolean) =>
  galleryFor({ candid, hideHandHolding })
    .slice(0, 4)
    .map((p) => optimized(p.src))

/**
 * Next's own device widths, and the quality every full-bleed <Image> on the
 * page asks for.
 *
 * The splash used to fetch the raw files in /public. That was survivable
 * while they were web-compressed; with honest 3360px photographs behind
 * them it meant pulling fifteen megabytes before the cover appeared, and
 * none of it was what the page then rendered: next/image serves its own
 * resized copy from a different URL, so the splash warmed a cache nobody
 * read. Asking for the same URL the component will ask for makes the
 * preload real and small.
 */
const DEVICE_WIDTHS = [640, 750, 828, 1080, 1200, 1280, 1600, 1920, 2048, 3840]
const QUALITY = 85

function optimized(src: string) {
  const want = Math.ceil(window.innerWidth * (window.devicePixelRatio || 1))
  const w = DEVICE_WIDTHS.find((d) => d >= want) ?? DEVICE_WIDTHS[DEVICE_WIDTHS.length - 1]
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${QUALITY}`
}

function loadImage(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image()
    img.onload = () => {
      // Feature-detected, not assumed. decode() arrived in Chrome 64, and a
      // stock Android WebView that was never updated does not have it: the
      // call then throws inside this handler, resolve is never reached, and
      // the promise below never settles. One image is enough to hang the
      // whole preload, and the loader waits on it.
      if (typeof img.decode === 'function') {
        // then(resolve, resolve) rather than finally(resolve): same effect on
        // both outcomes, and it does not need Promise.prototype.finally, which
        // is the other thing a WebView of that age is missing.
        img.decode().then(
          () => resolve(),
          () => resolve()
        )
      } else {
        resolve()
      }
    }
    img.onerror = () => resolve()
    img.src = src
  })
}

export function preloadInvitation(
  candid: boolean,
  hideHandHolding: boolean,
  onProgress: (done: number, total: number) => void
) {
  const wide = window.matchMedia('(min-width: 900px) and (orientation: landscape)').matches
  const tasks: Promise<unknown>[] = [
    (document.fonts?.ready ?? Promise.resolve()).catch(() => undefined),
    ...IMAGES.map((src) => loadImage(optimized(src))),
    ...(wide ? panelsWide(candid) : panelsTall(candid)).map((src) => loadImage(optimized(src))),
    ...textures(candid, hideHandHolding).map(loadImage),
    import('./paper-letter').catch(() => undefined),
    import('./ring-scene').catch(() => undefined),
    import('./tunnel-scene').catch(() => undefined),
    import('./dress-scene').catch(() => undefined),
  ]
  const total = tasks.length
  let done = 0
  onProgress(0, total)
  // Counted on both outcomes, without Promise.prototype.finally. That method
  // arrived in Chrome 63, and calling it where it does not exist throws here,
  // synchronously, before this function has returned anything the caller can
  // attach to. Written this way, an old WebView gets a working preload rather
  // than a rescued one.
  const mark = () => {
    done++
    onProgress(done, total)
  }
  return Promise.all(tasks.map((t) => t.then(mark, mark)))
}
