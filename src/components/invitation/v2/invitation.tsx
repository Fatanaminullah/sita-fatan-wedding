'use client'

import { useEffect, useState } from 'react'
import { ScrollTrigger } from '@/lib/invitation/gsap'
import { SmoothScroll, useScrollTo } from './smooth-scroll'
import { Loader } from './loader'
import { Cover } from './cover'
import { Verse } from './verse'
import { Vow } from './vow'
import { Couple } from './couple'
import { Events } from './events'
import { Countdown } from './countdown'
import { DressCode } from './dress-code'
import { Gallery } from './gallery'
import { Rsvp, type RsvpEvent } from './rsvp'
import { Gift } from './gift'
import { Closing } from './closing'
import { Music, RsvpPill } from './persistent'
import { display, text } from './fonts'
import './invitation.css'

export type InvitationGuest = {
  slug: string
  name: string
  pax: number
  events: RsvpEvent[]
  candid: boolean
}

/**
 * The whole walk, top to bottom. This component owns three bits of state and
 * nothing else: whether the loader has left, whether the guest has opened
 * the invitation, and whether they have answered. Sections are otherwise
 * independent and can be reordered by moving a line.
 */
export function Invitation({ guest }: { guest: InvitationGuest }) {
  const [loaded, setLoaded] = useState(false)
  const [started, setStarted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [answered, setAnswered] = useState(guest.events.some((e) => e.answer !== 'pending'))
  const invited = guest.events.map((e) => e.event)

  return (
    <SmoothScroll locked={!entered}>
      <Body
        guest={guest}
        invited={invited}
        loaded={loaded}
        started={started}
        entered={entered}
        answered={answered}
        onStarted={() => setStarted(true)}
        onLoaded={() => setLoaded(true)}
        onEnter={() => setEntered(true)}
        onAnswered={() => setAnswered(true)}
      />
    </SmoothScroll>
  )
}

function Body({
  guest,
  invited,
  loaded,
  started,
  entered,
  answered,
  onStarted,
  onLoaded,
  onEnter,
  onAnswered,
}: {
  guest: InvitationGuest
  invited: RsvpEvent['event'][]
  loaded: boolean
  started: boolean
  entered: boolean
  answered: boolean
  onStarted: () => void
  onLoaded: () => void
  onEnter: () => void
  onAnswered: () => void
}) {
  const scrollTo = useScrollTo()

  // Sections below the cover mount once the guest opens; their triggers are
  // measured after that paint, not against a page that was hidden. The guest
  // stays on the cover and scrolls on themselves.
  //
  // That one measurement used to be the only one, and it was not enough. A
  // trigger holds the scroll offsets it was given; anything that changes the
  // height of the page afterwards leaves every trigger below it pointing at
  // a page that no longer exists. The display font landing late is enough to
  // do it: the date is set in `clamp(7rem, 38vw, 17rem)`, so a fallback face
  // and the real one differ by hundreds of pixels, and the loader's 12s
  // ceiling can hand over before `document.fonts.ready`. The symptom was a
  // section that never animated at all.
  //
  // So: measure again whenever the page's own height moves, coalesced into
  // one refresh per frame so a run of image loads costs a single pass.
  useEffect(() => {
    if (!entered) return
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => ScrollTrigger.refresh(), 120)
    }
    schedule()
    document.fonts?.ready.then(schedule).catch(() => undefined)
    window.addEventListener('load', schedule)
    // documentElement's box is the page's height: images decoding, scenes
    // mounting and fonts swapping all show up here.
    const ro = new ResizeObserver(schedule)
    ro.observe(document.documentElement)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('load', schedule)
      ro.disconnect()
    }
  }, [entered])

  return (
    <main className={`inv ${display.variable} ${text.variable}`}>
      {loaded ? null : <Loader onExitStart={onStarted} onDone={onLoaded} />}

      <Cover guestName={guest.name} answered={answered} started={started} onOpen={onEnter} />

      {entered ? (
        <>
          <Verse />
          <Vow />
          <Couple />
          <Events invited={invited} pax={guest.pax} />
          <Countdown invited={invited} />
          <DressCode candid={guest.candid} />
          <Gallery candid={guest.candid} />
          <Gift />
          <Rsvp slug={guest.slug} pax={guest.pax} events={guest.events} onAnswered={onAnswered} />
          <Closing guestName={guest.name} pending={!answered} onRsvp={() => scrollTo('rsvp')} />
          <RsvpPill show={!answered} onClick={() => scrollTo('rsvp')} />
        </>
      ) : null}

      <Music play={entered} />
    </main>
  )
}
