'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { gsap, useGSAP } from '@/lib/invitation/gsap'
import { GIFT } from './content'

/**
 * A closed box. Tap, the lid lifts, and in its place one small ivory card:
 * the QRIS if there is one, the bank line, a copy button. Nothing else.
 * "Copied" is inline; no toast library.
 */
export function Gift() {
  const ref = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const openRef = useRef<() => void>(() => {})
  useGSAP(
    (_ctx, contextSafe) => {
      openRef.current = contextSafe!(() => {
        setOpen(true)
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        gsap
          .timeline()
          .to('.inv-giftbox__lid', { rotateX: -110, y: -10, duration: 0.7, ease: 'power3.inOut' })
          .to('.inv-giftbox__bow', { y: -30, opacity: 0, duration: 0.4 }, 0)
          .to('.inv-giftbox', { y: 20, opacity: 0, duration: 0.45, ease: 'power2.in' }, '+=0.05')
          .set('.inv-giftbox', { display: 'none' })
          .from('.inv-gift__inside', { y: 24, opacity: 0, duration: 0.7, ease: 'power3.out' })
      })
    },
    { scope: ref }
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(GIFT.bank.account.replace(/\s/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard denied: the number is on screen, they can read it. */
    }
  }

  return (
    <section ref={ref} id="gift" className="inv-section inv-gift" aria-label="Gift">
      <div className="inv-column inv-gift__col">
        <p className="inv-label" style={{ color: 'var(--oxblood)', opacity: 0.7 }}>
          Gift
        </p>
        <h2 className="inv-display" style={{ fontSize: 'clamp(2.6rem, 11vw, 4.6rem)', marginTop: '0.6rem' }}>
          Only if you <i>wish.</i>
        </h2>
        <p className="inv-body" style={{ marginTop: '1rem', opacity: 0.8, maxWidth: '24rem', marginInline: 'auto' }}>
          {GIFT.intro}
        </p>

        {open ? null : (
          <button
            type="button"
            className="inv-giftbox"
            style={{ marginTop: '2.25rem' }}
            onClick={() => openRef.current()}
            aria-expanded={open}
            aria-label="Open the gift box"
          >
            <span className="inv-giftbox__body" />
            <span className="inv-giftbox__ribbon" />
            <span className="inv-giftbox__lid" />
            <span className="inv-giftbox__bow" />
          </button>
        )}

        {open ? (
          <div className="inv-card inv-gift__inside">
            {GIFT.qrisSrc ? (
              <Image src={GIFT.qrisSrc} alt="QRIS code" width={512} height={512} className="inv-gift__qris" />
            ) : null}
            <p className="inv-label" style={{ opacity: 0.55 }}>
              {GIFT.bank.name}
            </p>
            <p className="inv-display inv-gift__account">{GIFT.bank.account}</p>
            <p className="inv-body" style={{ opacity: 0.7, fontSize: '0.92rem' }}>
              a.n. {GIFT.bank.holder}
            </p>
            <button type="button" className="inv-btn inv-btn--ghost" style={{ marginTop: '1.1rem', width: '100%' }} onClick={copy} aria-live="polite">
              {copied ? 'Copied' : 'Copy account number'}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
