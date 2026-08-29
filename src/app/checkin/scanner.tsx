'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The camera half of the door.
 *
 * Uses the browser's own BarcodeDetector rather than a bundled decoder. That
 * keeps a QR library out of the dependency list, and CLAUDE.md asks before
 * adding one. The cost is that support is not universal: Chrome and Android
 * WebView have it, iOS Safari does not at the time of writing.
 *
 * So the camera is treated as the fast path and never as the only path. When
 * BarcodeDetector is missing, or permission is refused, or there is no camera
 * at all, this reports `unsupported` and the station falls back to searching
 * by name — which is the same fallback used when a guest's QR simply will not
 * read, and is therefore a path that has to work anyway.
 */

type ScannerState = 'starting' | 'scanning' | 'unsupported' | 'denied'

/** How often to sample a frame. Faster than this buys nothing at a door. */
const SAMPLE_MS = 250

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

export function Scanner({
  onCode,
  paused,
}: {
  onCode: (value: string) => void
  /** Held while a result or greeting is on screen, so one QR scans once. */
  paused: boolean
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

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera on a tablet mounted facing the guest is the one
          // pointed at the QR they are holding up.
          video: { facingMode: 'environment' },
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
  }, [])

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
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className="aspect-[4/3] w-full object-cover"
      />
      {/* A frame to aim inside. Corners only: a full rectangle reads as a
          border on the video, corners read as a target. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-40 w-40 border-2 border-white/70 [clip-path:polygon(0_0,28%_0,28%_4%,4%_4%,4%_28%,0_28%,0_72%,4%_72%,4%_96%,28%_96%,28%_100%,0_100%,100%_100%,72%_100%,72%_96%,96%_96%,96%_72%,100%_72%,100%_28%,96%_28%,96%_4%,72%_4%,72%_0,100%_0)]" />
      </div>
      {state === 'starting' ? (
        <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/80">
          Starting the camera…
        </p>
      ) : null}
    </div>
  )
}
