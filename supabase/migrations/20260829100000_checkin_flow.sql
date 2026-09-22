-- Day-of check-in: what the door records, and the two ways it finds a guest.
--
-- Phase 3. Until now `checkin_events` and `souvenir_claims` existed with their
-- RLS policies but nothing wrote to them and no route read them.

-- ---------------------------------------------------------------------------
-- 1. What actually walked in
-- ---------------------------------------------------------------------------
--
-- `guest_events.pax_confirmed` is what a guest said weeks ago. It is not what
-- turns up. A family of four confirms four and arrives as two, or as five with
-- a cousin nobody mentioned. The venue caps (Akad 200, Resepsi 500) are
-- counted against bodies in the room, so the room needs its own number.
--
-- No upper bound against `guests.pax`. A door with a queue behind it is the
-- wrong place to refuse a fifth person: the row saves and the screen shows
-- amber. That is the same "warn, allow, flag" rule the quota engine already
-- follows (docs/PRD.md).
alter table checkin_events
  add column pax_arrived integer not null default 1
    check (pax_arrived > 0);

alter table checkin_events alter column pax_arrived drop default;

-- Deliberately NOT unique on (guest_id, event).
--
-- A second scan of the same guest is a real event that happened at a real
-- door, and it is the gate-crasher and passed-back-phone case. The UI refuses
-- to admit them twice; the row is kept so there is a record that someone
-- tried. This is the opposite of `souvenir_claims`, which IS unique, because
-- there the cost of a duplicate is a souvenir that physically leaves the
-- table.
create index if not exists checkin_events_guest_event_idx
  on checkin_events (guest_id, event);

-- ---------------------------------------------------------------------------
-- 2. One guest, from their entry ticket
-- ---------------------------------------------------------------------------
--
-- Security definer, because ushers have no read on `guests` and must not get
-- one. Exact uuid match only: there is no pattern, no range, and no way to
-- walk the table by guessing.
--
-- Deliberately absent from the return, the same list as guest_by_public_slug:
--   phone   nobody at a door needs it, and it is the most sensitive column
--   note    internal, often about the guest rather than for them
--           ("Mertua Mita Aldi", "Bu Bidan")
--   rsvp_token / public_slug  credentials; returning a credential to the
--           screen that just consumed it serves nothing
--
-- An unknown token returns zero rows. No distinction between "never existed"
-- and "revoked", so the function cannot be used to probe.
create or replace function guest_by_rsvp_token(p_token uuid, p_event text)
returns table (
  id uuid,
  name text,
  pax integer,
  side text,
  inviter_key text,
  is_vip boolean,
  invite_status text,
  rsvp_status text,
  pax_confirmed integer,
  checked_in_at timestamptz,
  checked_in_by_name text,
  souvenir_claimed_at timestamptz,
  souvenir_claimed_via text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  -- The guard the WHERE clause cannot provide. Security definer bypasses RLS,
  -- so without this any authenticated inviter could resolve any guest on the
  -- other side of the wedding by holding a token.
  if current_profile_role() not in ('usher', 'admin', 'superadmin') then
    raise exception 'not authorised to resolve a guest by entry ticket';
  end if;

  if p_event not in ('akad', 'resepsi') then
    raise exception 'unknown event: %', p_event;
  end if;

  return query
  select
    g.id,
    g.name,
    g.pax,
    g.side,
    g.inviter_key,
    g.is_vip,
    ge.invite_status,
    ge.rsvp_status,
    ge.pax_confirmed,
    ci.checked_in_at,
    p.full_name as checked_in_by_name,
    sc.claimed_at as souvenir_claimed_at,
    sc.claimed_via as souvenir_claimed_via
  from guests g
  -- left, not inner: a guest with no row for this event is invited to the
  -- other one, and the screen must say so rather than 404. Absence of an
  -- invitation is a state the door has to handle, not a lookup failure.
  left join guest_events ge
    on ge.guest_id = g.id and ge.event = p_event
  -- the earliest check-in for this event is the one that counts; later rows
  -- are the duplicate attempts described above
  left join lateral (
    select c.checked_in_at, c.checked_in_by
    from checkin_events c
    where c.guest_id = g.id and c.event = p_event
    order by c.checked_in_at asc
    limit 1
  ) ci on true
  left join profiles p on p.user_id = ci.checked_in_by
  left join souvenir_claims sc on sc.guest_id = g.id
  where g.rsvp_token = p_token;
end;
$$;

grant execute on function guest_by_rsvp_token(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The roster, for when the QR will not read
-- ---------------------------------------------------------------------------
--
-- This reverses "Ushers have no guest-list read" in docs/DATA_MODEL.md, on the
-- owner's decision of 2026-08-29. Two reasons, both operational:
--
--   1. A QR that will not scan (cracked screen, dead battery, guest never
--      opened the message) must not become a blocked door. The usher takes the
--      tablet, finds the name, admits them by hand.
--   2. An usher who cannot tell a VIP from anyone else cannot do the job. VIP
--      recognition at the door is the whole point of the tier.
--
-- What the original rule was actually protecting is preserved. Ushers still
-- get no policy on `guests`, because row-level security cannot hide a column:
-- a SELECT policy broad enough to serve this would also hand over `phone` and
-- `note`. This function returns the columns a door needs and no others, so the
-- two sensitive fields stay unreachable by construction rather than by
-- discipline.
create or replace function guest_roster_for_event(p_event text, p_query text default null)
returns table (
  id uuid,
  name text,
  pax integer,
  side text,
  inviter_key text,
  is_vip boolean,
  invite_status text,
  rsvp_status text,
  pax_confirmed integer,
  checked_in_at timestamptz,
  souvenir_claimed_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if current_profile_role() not in ('usher', 'admin', 'superadmin') then
    raise exception 'not authorised to read the door roster';
  end if;

  if p_event not in ('akad', 'resepsi') then
    raise exception 'unknown event: %', p_event;
  end if;

  return query
  select
    g.id,
    g.name,
    g.pax,
    g.side,
    g.inviter_key,
    g.is_vip,
    ge.invite_status,
    ge.rsvp_status,
    ge.pax_confirmed,
    ci.checked_in_at,
    sc.claimed_at as souvenir_claimed_at
  from guests g
  -- inner: the roster for a door is the people invited to that event. A guest
  -- invited only to the Akad is not on the Resepsi door's list at all.
  join guest_events ge
    on ge.guest_id = g.id and ge.event = p_event
  left join lateral (
    select c.checked_in_at
    from checkin_events c
    where c.guest_id = g.id and c.event = p_event
    order by c.checked_in_at asc
    limit 1
  ) ci on true
  left join souvenir_claims sc on sc.guest_id = g.id
  where p_query is null
     or p_query = ''
     or g.name ilike '%' || p_query || '%'
  order by g.name;
end;
$$;

grant execute on function guest_roster_for_event(text, text) to authenticated;
