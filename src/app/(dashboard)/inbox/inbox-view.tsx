'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import type { Conversation, ReplyState } from '@/domain/inbox'
import type { InboxGuestContext } from '@/server/repositories/inbox-repository'
import { sendReply } from '@/server/actions/inbox-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/planner/responsive-modal'
import { inviterLabel } from '@/lib/inviter-label'

export type ConversationView = Conversation & {
  guest: InboxGuestContext | null
  reply: ReplyState
}

const SIDE_LABEL = { fatan: 'Fatan', sita: 'Sita' } as const
const RSVP_LABEL = {
  pending: 'no answer yet',
  attending: 'attending',
  not_attending: 'not attending',
} as const

// nativeFieldClass is fixed at h-9, which is right for a filter row and wrong
// for something you compose a sentence in.
const replyBoxClass =
  'w-full min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm'

function timeLabel(date: Date) {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** A number nobody has claimed still has to be readable as something. */
function threadTitle(conversation: ConversationView) {
  return conversation.guest?.name ?? `+${conversation.waId}`
}

function GuestContext({ guest }: { guest: InboxGuestContext | null }) {
  if (!guest) {
    return (
      <p className="text-sm text-muted-foreground">
        This number matches no guest. Add it to their row on the guests screen and the thread will
        name them.
      </p>
    )
  }

  const invited = guest.events.filter((event) => event.inviteStatus === 'confirmed')

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div>
        <dt className="text-xs text-muted-foreground">Side</dt>
        <dd className="mt-0.5">{SIDE_LABEL[guest.side]}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Pax</dt>
        <dd className="mt-0.5 tabular-nums">{guest.pax}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Inviter</dt>
        <dd className="mt-0.5">{inviterLabel(guest.inviterKey)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Language</dt>
        <dd className="mt-0.5">{guest.language === 'id' ? 'Indonesian' : 'English'}</dd>
      </div>
      <div className="col-span-2">
        <dt className="text-xs text-muted-foreground">Events</dt>
        <dd className="mt-0.5 space-y-1">
          {invited.length === 0 ? (
            <span className="text-muted-foreground">Not invited to either event.</span>
          ) : (
            invited.map((event) => (
              <p key={event.event} className="capitalize">
                {event.event}: {RSVP_LABEL[event.rsvpStatus]}
                {event.paxConfirmed !== null ? (
                  <span className="tabular-nums"> ({event.paxConfirmed} pax)</span>
                ) : null}
              </p>
            ))
          )}
        </dd>
      </div>
      {guest.isVip ? (
        <div className="col-span-2">
          <Badge variant="secondary">VIP</Badge>
        </div>
      ) : null}
    </dl>
  )
}

function ReplyBox({ conversation }: { conversation: ConversationView }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (conversation.reply.kind !== 'open') {
    // Stated, not hidden. A disabled box with no reason reads as a bug.
    return (
      <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
        <p className="font-medium text-warning">Cannot reply with a plain message</p>
        <p className="mt-1 text-muted-foreground">
          {conversation.reply.kind === 'never_written'
            ? 'They have never messaged this number, so no reply window has opened. Only an approved template can reach them.'
            : `Their last message was more than 24 hours ago, so the window closed on ${timeLabel(conversation.reply.expiredAt)}. Only an approved template can reach them now.`}
        </p>
      </div>
    )
  }

  const expiresAt = conversation.reply.expiresAt

  function submit() {
    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('waId', conversation.waId)
      formData.set('body', body)
      if (conversation.guestId) formData.set('guestId', conversation.guestId)
      const result = await sendReply(formData)
      if ('error' in result) setError(result.error)
      else setBody('')
    })
  }

  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor="reply-body">
        Reply to {threadTitle(conversation)}
      </label>
      <textarea
        id="reply-body"
        className={replyBoxClass}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write a reply"
        disabled={pending}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Free to send until {timeLabel(expiresAt)}.
        </p>
        <Button onClick={submit} disabled={pending || !body.trim()} className="h-11 md:h-9">
          <Send className="size-4" aria-hidden />
          {pending ? 'Sending' : 'Send'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Thread({ conversation }: { conversation: ConversationView }) {
  return (
    <div className="space-y-4">
      <GuestContext guest={conversation.guest} />

      <div className="space-y-2 border-t pt-4">
        {conversation.messages.map((message) => {
          const outbound = message.direction === 'outbound'
          return (
            <div key={message.id} className={outbound ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                  outbound ? 'bg-card ring-1 ring-border' : 'bg-accent'
                }`}
              >
                {/* Named, not merely aligned: the Never-Color-Alone Rule
                    applies to position too. */}
                <p className="text-xs text-muted-foreground">
                  {outbound ? 'You' : threadTitle(conversation)} · {timeLabel(message.sentAt)}
                </p>
                <p className="mt-1 break-words whitespace-pre-wrap">
                  {message.body ?? (
                    <span className="text-muted-foreground italic">
                      {message.type} message, not shown here
                    </span>
                  )}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <ReplyBox conversation={conversation} />
    </div>
  )
}

export function InboxView({ conversations }: { conversations: ConversationView[] }) {
  const [selectedWaId, setSelectedWaId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const selected = conversations.find((c) => c.waId === selectedWaId) ?? null

  if (conversations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No guest has messaged the wedding number yet. Their replies will appear here, and nowhere
        else: a Cloud API number cannot be opened in WhatsApp itself.
      </p>
    )
  }

  function open(waId: string) {
    setSelectedWaId(waId)
    setSheetOpen(true)
  }

  const list = (
    <ul className="space-y-2">
      {conversations.map((conversation) => {
        const isSelected = conversation.waId === selectedWaId
        return (
          <li key={conversation.waId}>
            <button
              type="button"
              onClick={() => open(conversation.waId)}
              className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-accent ${
                isSelected ? 'bg-accent' : 'bg-card'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{threadTitle(conversation)}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {timeLabel(conversation.lastMessage.sentAt)}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {conversation.lastMessage.direction === 'outbound' ? 'You: ' : ''}
                {conversation.lastMessage.body ?? `(${conversation.lastMessage.type})`}
              </p>
              {conversation.guest ? null : (
                <Badge variant="outline" className="mt-2 text-warning">
                  Unknown number
                </Badge>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
      {/* Below md the two panes cannot sit side by side (the No-Sideways
          Rule), so the thread becomes a sheet the list opens. */}
      <div className="md:hidden">{list}</div>
      <div className="md:hidden">
        <ResponsiveModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={selected ? threadTitle(selected) : 'Conversation'}
        >
          {selected ? <Thread conversation={selected} /> : null}
        </ResponsiveModal>
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-[20rem_1fr]">
        <div>{list}</div>
        {/* Docked, not floating, so it carries a ring and no shadow: a shadow
            would promise it can be dismissed. */}
        <div className="rounded-md border bg-card p-4">
          {selected ? (
            <Thread conversation={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick a conversation to read it and reply.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
