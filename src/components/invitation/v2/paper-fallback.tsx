'use client'

import Image from 'next/image'
import { RSVP_DEADLINE, WEDDING_DATE, GIFT } from './content'

/**
 * The letter and the card as plain HTML, for phones whose browser cannot run
 * the WebGL sheet (no WebGL2, a lost context, a refused shader). Same words,
 * same frame, no simulation. A guest on a 2018 Android reads the same
 * invitation; they just do not get to drag it.
 */
export function LetterFallback({
  guestName,
  answered,
  onOpen,
}: {
  guestName: string
  answered: boolean
  onOpen: () => void
}) {
  return (
    <div className="inv-fallback" role="img" aria-label={`A letter addressed to ${guestName}`}>
      <div className="inv-fallback__sheet">
        <Image src="/monogram-mark.png" alt="" width={72} height={72} className="inv-fallback__mark" />
        <p className="inv-label inv-fallback__soft">Dear</p>
        <p className="inv-fallback__name inv-display">{guestName}</p>
        <p className="inv-fallback__soft inv-display" style={{ fontStyle: 'italic', fontSize: '1rem', marginTop: '0.8rem' }}>
          you are invited to the wedding of
        </p>
        <p className="inv-fallback__names inv-display">
          Sita <i>and</i> Fatan
        </p>
        <p className="inv-label" style={{ marginTop: '0.8rem', color: 'var(--oxblood)' }}>
          {WEDDING_DATE.long}
        </p>
        {answered ? null : (
          <p className="inv-fallback__soft" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
            Kindly reply by {RSVP_DEADLINE.long}
          </p>
        )}
        <button type="button" className="inv-btn" style={{ width: '100%', marginTop: '1.2rem' }} onClick={onOpen}>
          Open the invitation
        </button>
      </div>
    </div>
  )
}

export function GiftFallback() {
  return (
    <div className="inv-fallback inv-fallback--card" role="group" aria-label="Gift card">
      <div className="inv-fallback__sheet">
        <Image src="/monogram-mark.png" alt="" width={56} height={56} className="inv-fallback__mark" />
        <p className="inv-fallback__soft inv-display" style={{ fontStyle: 'italic', fontSize: '1rem' }}>
          with love, Sita &amp; Fatan
        </p>
        <p className="inv-label" style={{ marginTop: '1.2rem', opacity: 0.6 }}>
          {GIFT.bank.name}
        </p>
        <p className="inv-display" style={{ fontSize: '1.7rem', letterSpacing: '0.04em', color: 'var(--oxblood)' }}>
          {GIFT.bank.account}
        </p>
        <p className="inv-fallback__soft" style={{ fontSize: '0.85rem' }}>
          a.n. {GIFT.bank.holder}
        </p>
        {GIFT.qrisSrc ? (
          <Image src={GIFT.qrisSrc} alt="QRIS code" width={256} height={256} style={{ width: '12rem', height: 'auto', margin: '1rem auto 0' }} />
        ) : null}
      </div>
    </div>
  )
}
