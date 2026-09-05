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
  useEffect(() => {
    if (!entered) return
    const id = setTimeout(() => ScrollTrigger.refresh(), 80)
    return () => clearTimeout(id)
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
          <DressCode />
          <Gallery candid={guest.candid} />
          <Rsvp slug={guest.slug} pax={guest.pax} events={guest.events} onAnswered={onAnswered} />
          <Gift />
          <Closing pending={!answered} onRsvp={() => scrollTo('rsvp')} />
          <RsvpPill show={!answered} onClick={() => scrollTo('rsvp')} />
        </>
      ) : null}

      <Music play={entered} />
    </main>
  )
}
