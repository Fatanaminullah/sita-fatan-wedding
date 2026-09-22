'use client'

import { useEffect, useRef, useState } from 'react'
import { SwitchCamera } from 'lucide-react'
import { ReadyToScan } from '@/components/invitation/arrival-greeting'

/**
 * The camera half of the door.
 *
 * Uses the browser's own BarcodeDetector rather than a bundled decoder. That
 * keeps a QR library out of the dependency list, and CLAUDE.md asks before
 * adding one. The target device is a Samsung Galaxy Tab, so Chromium has it.
 * Where it is missing (iOS Safari), or permission is refused, or there is no
 * camera at all, this reports so and the station falls back to searching by
 * name, which has to work anyway for a cracked screen or a flat battery.
 */

type ScannerState = 'starting' | 'scanning' | 'unsupported' | 'denied'

/** How often to sample a frame. Faster than this buys nothing at a door. */
const SAMPLE_MS = 250

export type Facing = 'user' | 'environment'

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

export function Scanner({
  onCode,
  paused,
  facing,
  onToggleFacing,
}: {
  onCode: (value: string) => void
  /** Held while a result or greeting is on screen, so one QR scans once. */
  paused: boolean
  facing: Facing
  onToggleFacing: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<ScannerState>('starting')

  // Kept in refs so the scan loop never restarts when the parent re-renders,
  // and written in effects rather than during render: a ref mutated mid-render
  // is a value React is allowed to discard.
  const onCodeRef = useRef(onCode)
  const pausedRef = useRef(paused)

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // Re-runs when the camera is switched: the old stream is stopped by this
  // effect's own cleanup before the new one opens, so the tablet never holds
  // two camera tracks at once.
  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: number | null = null
    let stopped = false

    async function start() {
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
        if (!stopped) setState('unsupported')
        return
      }
      const detector = new Ctor({ formats: ['qr_code'] })
      if (!stopped) setState('starting')

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` rather than `exact`: a tablet with only one usable camera
          // should still scan on whatever it has instead of throwing
          // OverconstrainedError and sending the usher to name search.
          video: { facingMode: { ideal: facing } },
        })
      } catch {
        // getUserMedia also throws on an insecure origin, which is why the
        // rehearsal has to happen on deployed staging rather than a LAN IP.
        if (!stopped) setState('denied')
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play().catch(() => {})
      setState('scanning')

      timer = window.setInterval(async () => {
        if (pausedRef.current || !videoRef.current || videoRef.current.readyState < 2) return
        try {
          const found = await detector.detect(videoRef.current)
          const value = found[0]?.rawValue?.trim()
          if (value) onCodeRef.current(value)
        } catch {
          // A frame that fails to decode is the normal case, not an error.
        }
      }, SAMPLE_MS)
    }

    void start()

    return () => {
      stopped = true
      if (timer !== null) window.clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [facing])

  if (state === 'unsupported' || state === 'denied') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm font-medium">
          {state === 'denied' ? 'No camera access' : 'This device cannot scan'}
        </p>
        <p className="max-w-[28ch] text-sm text-muted-foreground">
          Find the guest by name instead. Everything works the same from there.
        </p>
      </div>
    )
  }

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black">
      {/* The viewfinder.
          Briefly hidden behind `opacity-0` when the arrival greeting comp was
          ported over this screen: that comp describes what a guest sees AFTER
          a successful scan, and it should never have decided what the scanning
          state looks like. Nobody can aim a camera they cannot see, and a
          guest holding up a QR has nothing to line it up with.
          Mirrored on the front camera, because an unmirrored self-view makes
          people move the wrong way. The transform is CSS only; BarcodeDetector
          reads the element's frames and is unaffected by it. */}
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-cover ${
          facing === 'user' ? '-scale-x-100' : ''
        }`}
      />

      <ReadyToScan />

      {/* Kept reachable for the usher: on a stand the aim is fixed, but a
          tablet that ends up handheld wants the other lens. */}
      <button
        type="button"
        onClick={onToggleFacing}
        className="absolute bottom-3 right-3 z-10 flex size-11 items-center justify-center rounded-lg bg-white/10 text-white active:translate-y-px"
      >
        <SwitchCamera className="size-5" aria-hidden="true" />
        <span className="sr-only">
          {facing === 'user' ? 'Switch to the back camera' : 'Switch to the front camera'}
        </span>
      </button>
    </div>
  )
}
