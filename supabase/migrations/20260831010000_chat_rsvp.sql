-- Answering the invitation inside WhatsApp.
--
-- ---------------------------------------------------------------------------
-- Why there is a marker at all
-- ---------------------------------------------------------------------------
--
-- The design note said: derive where the guest is from their data, never from
-- a stored step. The reasoning is sound — a stored step goes stale, and Meta
-- redelivers webhooks, so a flow that advances a counter double-advances.
--
-- It does not survive one transition. A guest invited to both events who
-- answers "both, two of us" lands in exactly the state of a guest who has said
-- yes and not yet been asked: both events attending, pax set. Nothing in the
-- data separates "answered everything" from "still owes me an answer", so pure
-- derivation asks the same question forever.
--
-- So: one nullable column naming the question outstanding, and nothing else.
-- It is not a step counter and never advances on its own — every write sets it
-- from the answer just received, so a redelivered webhook writes the same value
-- twice and changes nothing. Message ids are deduped separately.
alter table guests add column chat_awaiting text
  check (chat_awaiting is null or chat_awaiting in ('events', 'pax'));

comment on column guests.chat_awaiting is
  'Which question this guest has been asked in WhatsApp and not yet answered. NULL means nothing is outstanding. Set from the answer received, never incremented, so redelivery is harmless.';

-- ---------------------------------------------------------------------------
-- Recording an answer that arrived in a chat
-- ---------------------------------------------------------------------------
--
-- The webhook runs unauthenticated, like the invitation page, and the same
-- guard stands between it and the RSVP columns. Same solution: a definer
-- function that validates before it writes, so no service-role key is needed
-- in Node and CLAUDE.md's four sanctioned uses stay at four.
--
-- Resolves the guest by phone number rather than slug, because a chat is all
-- the identity a message carries.
create or replace function submit_rsvp_by_phone(
  p_phone text,
  p_events text[],
  p_attending boolean,
  p_pax integer default null,
  p_awaiting text default null
)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_guest_id uuid;
  v_invited_pax integer;
begin
  -- Exactly one guest on this number, or nothing happens. Two guests sharing a
  -- phone cannot be told apart by a chat message, and guessing which of them
  -- replied would put an answer on the wrong person.
  select g.id, g.pax into v_guest_id, v_invited_pax
    from guests g
   where g.phone = p_phone
   group by g.id
   having count(*) = 1;

  if v_guest_id is null then
    return false;
  end if;

  if (select count(*) from guests where phone = p_phone) <> 1 then
    return false;
  end if;

  if p_attending and p_pax is not null then
    -- Pax down only, the same ceiling the web form enforces. A guest cannot
    -- talk their way past their invitation by tapping a bigger number.
    if p_pax < 1 or p_pax > v_invited_pax then
      return false;
    end if;
  end if;

  update guest_events e
     set rsvp_status = case
           when p_events is null then e.rsvp_status
           when e.event = any (p_events) then (case when p_attending then 'attending' else 'not_attending' end)
           -- An event they were invited to but did not choose is a decline.
           -- Leaving it pending would let a half-answer look unanswered
           -- forever and quietly block them at that door.
           else 'not_attending'
         end,
         pax_confirmed = case
           when p_events is not null and e.event = any (p_events) and p_attending then p_pax
           when p_events is not null and not (e.event = any (p_events)) then null
           when p_attending then coalesce(p_pax, e.pax_confirmed)
           else null
         end,
         responded_at = now(),
         responded_via = 'guest_form',
         responded_by = null
   where e.guest_id = v_guest_id
     and e.invite_status = 'confirmed';

  update guests set chat_awaiting = p_awaiting where id = v_guest_id;

  return true;
end;
$$;

grant execute on function submit_rsvp_by_phone(text, text[], boolean, integer, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the chat needs to know about whoever just wrote in
-- ---------------------------------------------------------------------------
--
-- Returns nothing for an unknown number and nothing when two guests share one,
-- so a stranger messaging this line learns nothing and a shared household is
-- handed to a human instead of guessed at.
create or replace function guest_for_chat(p_phone text)
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
  resepsi_pax integer
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
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'resepsi')
  from guests g
  where g.phone = p_phone
    and (select count(*) from guests g2 where g2.phone = p_phone) = 1
$$;

grant execute on function guest_for_chat(text) to anon, authenticated;
