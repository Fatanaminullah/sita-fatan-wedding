'use client'

import Image from 'next/image'
import { COUPLE, GIFT } from './content'
import { useCopy } from './lang'

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
  const c = useCopy()
  return (
    <div className="inv-fallback" role="img" aria-label={c.letter.aria(guestName)}>
      <div className="inv-fallback__sheet">
        <Image src="/monogram-mark.png" alt="" width={72} height={72} className="inv-fallback__mark" />
        <p className="inv-label inv-fallback__soft" style={{ textTransform: 'none' }}>
          {c.letter.dear}
        </p>
        <p className="inv-fallback__name inv-display">{guestName}</p>
        <p className="inv-fallback__soft inv-display" style={{ fontStyle: 'italic', fontSize: '1rem', marginTop: '0.8rem' }}>
          {c.letter.invitedTo}
        </p>
        <p className="inv-fallback__names inv-display">
          {COUPLE.bride.short} <i>{c.letter.and}</i> {COUPLE.groom.short}
        </p>
        <p className="inv-label" style={{ marginTop: '0.8rem', color: 'var(--oxblood)' }}>
          {c.dateLong}
        </p>
        {answered ? null : (
          <p className="inv-fallback__soft" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
            {c.letter.replyBy(c.deadlineLong)}
          </p>
        )}
        <button type="button" className="inv-btn" style={{ width: '100%', marginTop: '1.2rem' }} onClick={onOpen}>
          {c.letter.open}
        </button>
      </div>
    </div>
  )
}

export function GiftFallback() {
  const c = useCopy()
  return (
    <div className="inv-fallback inv-fallback--card" role="group" aria-label={c.gift.aria(GIFT.bank.name, GIFT.bank.account, GIFT.bank.holder)}>
      <div className="inv-fallback__sheet">
        <Image src="/monogram-mark.png" alt="" width={56} height={56} className="inv-fallback__mark" />
        <p className="inv-fallback__soft inv-display" style={{ fontStyle: 'italic', fontSize: '1rem' }}>
          {c.gift.withLove} {COUPLE.bride.short} &amp; {COUPLE.groom.short}
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
