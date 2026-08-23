import { redirect } from 'next/navigation'
import { buildConversations, replyState } from '@/domain/inbox'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { listInboxMessages, type InboxGuestContext } from '@/server/repositories/inbox-repository'
import { getServerSupabase } from '@/server/supabase/server-client'
import { InboxView, type ConversationView } from './inbox-view'

export default async function InboxPage() {
  const profile = await getCurrentProfile()
  // Redirect rather than an inline explanation: unlike the guests screen,
  // there is no reading of this page that is useful to an inviter or usher.
  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
    redirect('/dashboard')
  }

  const supabase = await getServerSupabase()
  // RLS scopes this: superadmin sees every thread, an admin sees their own
  // side's guests plus every number that matched nobody. No filter here.
  const rows = await listInboxMessages(supabase)

  // Guest context is attached per message by the join, but it belongs to the
  // thread. Taking the first non-null keeps a thread labelled even if its
  // earliest messages arrived before a phone backfill resolved the number.
  const guestByWaId = new Map<string, InboxGuestContext>()
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
          Guest replies to the wedding WhatsApp number. This is the only place they appear.
        </p>
      </div>

      <InboxView conversations={conversations} />
    </main>
  )
}
