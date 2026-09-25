import { redirect } from 'next/navigation'
import { buildConversations, replyState } from '@/domain/inbox'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { listInboxMessages, type InboxGuestContext } from '@/server/repositories/inbox-repository'
import { getServerSupabase } from '@/server/supabase/server-client'
import { InboxView, type ConversationView } from './inbox-view'

export default async function InboxPage() {
  const profile = await getCurrentProfile()
  // An inviter reads the threads of their own guests, which is the point of
  // letting them in: they already see those guests and their answers, and
  // what the guest actually typed was the one thing they had to ask the
  // couple for. An usher still has no reading of this page that helps them.
  if (
    !profile ||
    (profile.role !== 'superadmin' && profile.role !== 'admin' && profile.role !== 'inviter')
  ) {
    redirect('/dashboard')
  }

  const supabase = await getServerSupabase()
  // RLS scopes this: superadmin sees every thread, an admin their own side's
  // guests plus every number that matched nobody, an inviter only their own
  // guests. No filter here, and deliberately none: the policy is the boundary
  // and a second one in TypeScript would be the thing that drifts.
  const rows = await listInboxMessages(supabase)

  /*
   * Guest context is attached per message by the join, but it belongs to the
   * thread, and the two do not always agree.
   *
   * A message records which guest it was sent to, and that is right: an
   * invitation sent to a number really was sent to it, whoever owned it at the
   * time. A conversation, though, belongs to whoever holds that number now.
   *
   * Taking the first message's guest got this wrong the moment a wrong number
   * was corrected. Yani's record briefly carried Winda's number, so his
   * invitation went to her phone; the list is newest first, his message was
   * newest, and his name sat over her conversation. Correcting his number
   * could not fix it, because the label never looked at a number.
   *
   * So: the guest whose current number is this thread, and only if nobody owns
   * it, the most recent message's guest, which keeps a thread labelled while a
   * backfill has yet to resolve it.
   */
  const guestByWaId = new Map<string, InboxGuestContext>()
  for (const row of rows) {
    if (row.guest?.phoneKey === row.waId) guestByWaId.set(row.waId, row.guest)
  }
  for (const row of rows) {
    if (row.guest && !guestByWaId.has(row.waId)) guestByWaId.set(row.waId, row.guest)
  }

  const now = new Date()
  const conversations: ConversationView[] = buildConversations(
    rows.map((row) => ({
      id: row.id,
      waId: row.waId,
      guestId: row.guestId,
      direction: row.direction,
      body: row.body,
      type: row.type,
      templateName: row.templateName,
      status: row.status,
      sentAt: new Date(row.sentAt),
    }))
  ).map((conversation) => ({
    ...conversation,
    guest: guestByWaId.get(conversation.waId) ?? null,
    // Resolved once, at render. A tab left open across the boundary will
    // still offer the box; sendReply re-checks and refuses with the reason,
    // so the worst case is an explained failure rather than a silent one.
    reply: replyState(conversation.lastInboundAt, now),
  }))

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Every message to and from the wedding WhatsApp number: invitations and reminders sent,
          answers given in the chat, and replies typed here. This is the only place any of it
          appears.
        </p>
      </div>

      <InboxView
        conversations={conversations}
        canReply={
          profile.role === 'superadmin' || profile.role === 'admin' || profile.role === 'inviter'
        }
      />
    </main>
  )
}
