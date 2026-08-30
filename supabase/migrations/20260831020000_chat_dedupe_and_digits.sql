-- Two corrections the conversation needs.
--
-- ---------------------------------------------------------------------------
-- 1. Say whether the message was new
-- ---------------------------------------------------------------------------
--
-- `wa_webhook_record_message` already ignores a duplicate id, which is right:
-- Meta redelivers, and the same reply must not be stored twice. But it says
-- nothing about what it did, and now something depends on the answer. A tap
-- redelivered is a tap already answered, and replying again sends the guest a
-- second copy of the same question.
--
-- Returns true when the row was genuinely new. Callers that do not care can
-- ignore it.
drop function if exists wa_webhook_record_message(text, text, text, text, text, text, timestamptz);

create function wa_webhook_record_message(
  p_secret text,
  p_direction text,
  p_wa_id text,
  p_provider_message_id text,
  p_type text,
  p_body text,
  p_sent_at timestamptz
)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  matched_guest uuid;
  inserted boolean := false;
begin
  if not private.wa_secret_ok(p_secret) then
    raise exception 'unauthorized';
  end if;

  select g.id into matched_guest
  from guests g
  where g.phone is not null
    and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_wa_id, '\D', '', 'g')
  limit 1;

  insert into wa_messages (
    direction, wa_id, guest_id, provider_message_id, type, body, sent_at
  ) values (
    p_direction, p_wa_id, matched_guest, p_provider_message_id, p_type, p_body, p_sent_at
  )
  on conflict (provider_message_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Match a number the way the rest of the system already does
-- ---------------------------------------------------------------------------
--
-- Meta sends digits with no plus. `guests.phone` is E.164 with one. The
-- webhook already compares on digits alone; the two functions added for the
-- chat compared exactly, so every guest would have failed to resolve and the
-- whole conversation would have silently handed over to a human.
--
-- Caught by reading them side by side rather than by running them, which is
-- the kind of thing that only shows up once a real guest taps a button.
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
  v_matches integer;
begin
  select count(*) into v_matches
    from guests g
   where g.phone is not null
     and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g');

  if v_matches <> 1 then
    return false;
  end if;

  select g.id, g.pax into v_guest_id, v_invited_pax
    from guests g
   where g.phone is not null
     and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g');

  if v_guest_id is null then
    return false;
  end if;

  if p_attending and p_pax is not null then
    -- Pax down only, the same ceiling the web form and the chat both enforce.
    if p_pax < 1 or p_pax > v_invited_pax then
      return false;
    end if;
  end if;

  update guest_events e
     set rsvp_status = case
           when p_events is null then e.rsvp_status
           when e.event = any (p_events) then (case when p_attending then 'attending' else 'not_attending' end)
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
