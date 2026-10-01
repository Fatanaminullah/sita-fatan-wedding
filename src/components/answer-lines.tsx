import type { ReactNode } from 'react'

export type EventAnswer = {
  event: 'akad' | 'resepsi'
  status: 'pending' | 'attending' | 'not_attending' | null
  pax: number | null
}

function line(status: EventAnswer['status'], pax: number | null) {
  if (status === 'attending') {
    return (
      <span>
        Coming
        {pax !== null ? (
          <>
            , <span className="font-mono tabular-nums">{pax}</span> pax
          </>
        ) : null}
      </span>
    )
  }
  if (status === 'not_attending') return <span>Not coming</span>
  return <span className="text-muted-foreground">No answer</span>
}

/**
 * The answer on file, with the pax it confirms.
 *
 * Per event, because a guest can come to the Akad and not the Resepsi, but
 * collapsed to one line when both answers agree: two identical rows in a narrow
 * cell is noise, and the disagreement is the only case worth the space.
 *
 * Shared by the guests table and the dashboard, so the two cannot describe the
 * same guest differently.
 */
export function AnswerLines({ events, when }: { events: EventAnswer[]; when?: ReactNode }) {
  const [first, second] = events
  if (!first) return null

  const agree =
    events.length === 1 ||
    (events.length === 2 && first.status === second?.status && first.pax === second?.pax)

  if (agree) {
    return (
      <span className="block text-sm">
        {line(first.status, first.pax)}
        {when}
      </span>
    )
  }

  return (
    <span className="block text-sm">
      {events.map((e) => (
        <span key={e.event} className="block">
          <span className="text-xs text-muted-foreground">
            {e.event === 'akad' ? 'Akad' : 'Resepsi'}:{' '}
          </span>
          {line(e.status, e.pax)}
        </span>
      ))}
      {when}
    </span>
  )
}
