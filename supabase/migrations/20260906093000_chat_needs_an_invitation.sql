-- The chat may only answer somebody who has actually been invited.
--
-- The RSVP conversation is the invitation's reply channel. It had no idea
-- whether the invitation had gone out, so it ran the whole form for anyone
-- whose number matched a guest row and who wrote anything at all.
--
-- That is not hypothetical. On 5 September a guest received the utility test
-- message, wrote "Tes" back, and was answered with "Will you be joining us?".
-- She said yes and gave a headcount, and was recorded as attending, seven
-- minutes before her invitation was sent. She answered a wedding invitation
-- she had not yet received.
--
-- wave-actions already refuses to remind a guest who was never invited, on
-- exactly this reasoning: silence from somebody who was never asked is not
-- silence. The chat needs the same fact, so guest_for_chat returns it.
--
-- Paper counts. A guest handed a physical invitation has been invited as
-- surely as one sent a template, and telling them to wait would be absurd.
--
-- A failed send does not count, and that is the case that matters: a guest
-- whose invitation was rejected has received nothing at all.
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
  invitation_sent boolean
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
