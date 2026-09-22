-- Free text only draws the buttons once the reminder has gone out.
--
-- The invitation is an announcement. It carries a link and no buttons. The
-- reminder is the message that asks "will you be joining us" and carries the
-- two to tap.
--
-- handleReply did not know the difference. Its only gate was invitation_sent,
-- so any typed message after the invitation was answered with "please choose
-- one of the options below so your answer is recorded". On 22 September, one
-- minute after the first real invitation went out, a guest wrote "Waaahhh, 
-- can't wait" and was handed a form.
--
-- 20260906093000 fixed the neighbouring case, where the chat ran for a guest
-- who had received nothing at all. This is the same mistake one step later:
-- knowing an invitation went out is not knowing a question was asked.
--
-- A tap is unaffected. A tap can only come from buttons we sent, and it is
-- unambiguous whoever sent them.
--
-- Dropped, not replaced: adding a column to a RETURNS TABLE changes the
-- function's return type, and Postgres refuses that in a CREATE OR REPLACE.
drop function if exists guest_for_chat(text);

create function guest_for_chat(p_phone text)
returns table (
  id uuid,
  name text,
  pax integer,
  language text,
  chat_awaiting text,
  invited_akad boolean,
  invited_resepsi boolean,
  akad_rsvp text,
  resepsi_rsvp text,
  akad_pax integer,
  resepsi_pax integer,
  invitation_sent boolean,
  reminder_sent boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    g.id,
    g.name,
    g.pax,
    g.language,
    g.chat_awaiting,
    exists (select 1 from guest_events e where e.guest_id = g.id and e.event = 'akad' and e.invite_status = 'confirmed'),
    exists (select 1 from guest_events e where e.guest_id = g.id and e.event = 'resepsi' and e.invite_status = 'confirmed'),
    (select e.rsvp_status from guest_events e where e.guest_id = g.id and e.event = 'akad'),
    (select e.rsvp_status from guest_events e where e.guest_id = g.id and e.event = 'resepsi'),
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'akad'),
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'resepsi'),
    g.is_physical_invitation or exists (
      select 1 from wa_sends s
      where s.guest_id = g.id
        and s.kind = 'invite'
        and s.status <> 'failed'
        and s.sent_at is not null
    ),
    -- No physical equivalent here, unlike the invitation above. A paper
    -- invitation is still an invitation, but nobody hands somebody a paper
    -- reminder carrying two buttons to tap.
    exists (
      select 1 from wa_sends s
      where s.guest_id = g.id
        and s.kind = 'reminder'
        and s.status <> 'failed'
        and s.sent_at is not null
    )
  from guests g
  where g.phone is not null
    and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    -- Two guests on one number cannot be told apart by a chat message, and
    -- guessing which of them replied would put an answer on the wrong person.
    -- Returning nothing hands the household to a human, which is correct.
    and (
      select count(*) from guests g2
      where g2.phone is not null
        and regexp_replace(g2.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    ) = 1
$$;

grant execute on function guest_for_chat(text) to anon, authenticated;
