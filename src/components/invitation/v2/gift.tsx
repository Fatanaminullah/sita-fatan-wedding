'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PaperSheet, type DrawFn, type PaperSheetHandle } from './paper-sheet'
import { PAPER, INK, SOFT, mid, track, wrapMid, paperGrain, engravedFrame, rule } from './paper-draw'
import { GIFT } from './content'

/**
 * A small card in the same paper as the letter. Front: the monogram and a
 * line from the couple. Turn it over (drag, or the button) and the back
 * carries the bank line and the QRIS. Copy is inline; no toast library.
 */
const GW = 1400
const GH = 900
const CX = GW / 2

function drawFront(ctx: CanvasRenderingContext2D, o: { display: string; text: string; mark: HTMLImageElement | null }) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, GW, GH)
  paperGrain(ctx, GW, GH, 913)
  engravedFrame(ctx, GW, GH, 48, 14)

  if (o.mark) {
    const mw = 300
    ctx.drawImage(o.mark, CX - mw / 2, 130, mw, mw)
  }
  ctx.fillStyle = SOFT
  ctx.font = `italic 400 46px ${o.display}`
  mid(ctx, 'with love,', 540, CX)
  ctx.fillStyle = INK
  ctx.font = `400 96px ${o.display}`
  mid(ctx, 'Sita & Fatan', 650, CX)
  rule(ctx, CX, 720, 140)
  ctx.fillStyle = SOFT
  ctx.font = `500 20px ${o.text}`
  track(ctx, 'TURN OVER', CX, 790, 8)
}

function drawBack(ctx: CanvasRenderingContext2D, o: { display: string; text: string; qris: HTMLImageElement | null }) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, GW, GH)
  paperGrain(ctx, GW, GH, 271)
  engravedFrame(ctx, GW, GH, 48, 14)

  const hasQr = !!o.qris
  const colX = hasQr ? 480 : CX
  ctx.fillStyle = SOFT
  ctx.font = `500 22px ${o.text}`
  track(ctx, GIFT.bank.name.toUpperCase(), colX, 250, 9)
  ctx.fillStyle = INK
  ctx.font = `400 92px ${o.display}`
  mid(ctx, GIFT.bank.account, 380, colX)
  ctx.fillStyle = SOFT
  ctx.font = `400 30px ${o.text}`
  mid(ctx, `a.n. ${GIFT.bank.holder}`, 440, colX)
  rule(ctx, colX, 520, 120)
  ctx.font = `italic 400 34px ${o.display}`
  wrapMid(ctx, GIFT.intro, 600, hasQr ? 600 : 900, 44, colX)

  if (o.qris) {
    const s = 520
    const x = GW - 140 - s
    const y = (GH - s) / 2
    ctx.fillStyle = '#fff'
    ctx.fillRect(x - 16, y - 16, s + 32, s + 32)
    ctx.drawImage(o.qris, x, y, s, s)
    ctx.fillStyle = SOFT
    ctx.font = `500 18px ${o.text}`
    track(ctx, 'QRIS', x + s / 2, y + s + 52, 8)
  }
}

export function Gift() {
  const sheet = useRef<PaperSheetHandle>(null)
  const hostRef = useRef<HTMLElement>(null)
  const [started, setStarted] = useState(false)
  const [face, setFace] = useState<0 | 1>(0)
  const [copied, setCopied] = useState(false)
  const [qris, setQris] = useState<HTMLImageElement | null>(null)

  // Boot when the section is near, not at page load: a second WebGL scene
  // has no business running while the guest is still on the cover.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { rootMargin: '40% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!GIFT.qrisSrc) return
    const img = new window.Image()
    img.onload = () => setQris(img)
    img.src = GIFT.qrisSrc
  }, [])

  const front = useCallback<DrawFn>((ctx, env) => drawFront(ctx, env), [])
  const back = useCallback<DrawFn>((ctx, env) => drawBack(ctx, { ...env, qris }), [qris])

  async function copy() {
    try {
      await navigator.clipboard.writeText(GIFT.bank.account.replace(/\s/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard denied: the number is on the card, they can read it. */
    }
  }

  return (
    <section ref={hostRef} id="gift" className="inv-section inv-gift" aria-label="Gift">
      <div className="inv-column inv-gift__col">
        <p className="inv-label" style={{ color: 'var(--oxblood)', opacity: 0.7 }}>
          Gift
        </p>
        <h2 className="inv-display" style={{ fontSize: 'clamp(2.6rem, 11vw, 4.6rem)', marginTop: '0.6rem' }}>
          Only if you <i>wish.</i>
        </h2>
        <p className="inv-body" style={{ marginTop: '1rem', opacity: 0.8, maxWidth: '24rem', marginInline: 'auto' }}>
          Your presence is the gift. The card carries the rest.
        </p>
      </div>

      <div className="inv-gift__stage">
        <PaperSheet
          ref={sheet}
          grid={{ w: GW, h: GH }}
          pixels={{ w: 1600, h: 1029 }}
          world={{ w: 3.4, h: 2.19 }}
          fit={0.9}
          amp={0.5}
          ambient={2}
          halo={0.22}
          glow={0.42}
          mode="turn"
          front={front}
          back={back}
          fontsToLoad={['400 96px $display', 'italic 400 46px $display', '500 22px $text']}
          started={started}
          onFace={setFace}
          ariaLabel={`Gift card: ${GIFT.bank.name} ${GIFT.bank.account}, ${GIFT.bank.holder}`}
        />
      </div>

      <div className="inv-column inv-gift__actions">
        <button type="button" className="inv-btn inv-btn--ghost" onClick={() => sheet.current?.flip()}>
          {face === 0 ? 'Turn the card over' : 'Turn it back'}
        </button>
        <button type="button" className="inv-btn" onClick={copy} aria-live="polite">
          {copied ? 'Copied' : 'Copy account number'}
        </button>
        <p className="inv-label inv-gift__hint">Drag the card to turn it</p>
      </div>
    </section>
  )
}
