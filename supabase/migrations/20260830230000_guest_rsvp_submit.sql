-- A guest answering their own invitation.
--
-- Two problems to solve at once.
--
-- The page is unauthenticated, so there is no role to scope by. `guests` has
-- no anon policy and must not get one, for the same reason as
-- guest_by_public_slug: a policy broad enough to serve this page would permit
-- enumerating 334 people and their phone numbers.
--
-- And `guard_guest_events_rsvp_columns` locks the five RSVP columns to admin,
-- superadmin, or a service-role connection, so that an inviter cannot answer
-- on a guest's behalf.
--
-- CLAUDE.md sanctions the service role for exactly this case: "the
-- unauthenticated RSVP route, which has no logged-in role to be scoped by".
-- Doing it inside a definer function rather than with SUPABASE_SECRET_KEY in
-- Node is strictly better than what that permission allows: the key never
-- leaves the database, the elevation lasts one statement, and the only way in
-- is this function, which validates everything before it writes.

-- ---------------------------------------------------------------------------
-- The page needs to know what it already answered
-- ---------------------------------------------------------------------------
--
-- Return types cannot be altered in place, so this drops and recreates.
-- Everything deliberately absent before stays absent: no token, no phone, no
-- note, no id.
drop function if exists guest_by_public_slug(text);

create function guest_by_public_slug(p_slug text)
returns table (
  name text,
  pax integer,
  side text,
  is_vip boolean,
  invited_akad boolean,
  invited_resepsi boolean,
  akad_rsvp text,
  resepsi_rsvp text,
  akad_pax integer,
  resepsi_pax integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    g.name,
    g.pax,
    g.side,
    g.is_vip,
    exists (
      select 1 from guest_events e
      where e.guest_id = g.id and e.event = 'akad' and e.invite_status = 'confirmed'
    ) as invited_akad,
    exists (
      select 1 from guest_events e
      where e.guest_id = g.id and e.event = 'resepsi' and e.invite_status = 'confirmed'
    ) as invited_resepsi,
    (select e.rsvp_status from guest_events e where e.guest_id = g.id and e.event = 'akad') as akad_rsvp,
    (select e.rsvp_status from guest_events e where e.guest_id = g.id and e.event = 'resepsi') as resepsi_rsvp,
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'akad') as akad_pax,
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'resepsi') as resepsi_pax
  from guests g
  where g.public_slug = p_slug
$$;

grant execute on function guest_by_public_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recording the answer
-- ---------------------------------------------------------------------------
--
-- Every rule the admin path enforces is enforced here too, because this caller
-- is anonymous and nothing else stands between them and the table:
--
--   the slug must resolve                  or nothing is written
--   the event must be CONFIRMED for them   a waitlisted guest cannot accept a
--                                          place that was never offered
--   pax is down only, 1..guests.pax        the invitation is the ceiling
--   declining records no headcount         two answers to one question
--
-- Returns true when something was written, false when the slug or the
-- invitation did not resolve. It never says which, so it cannot be used to
-- discover whether a slug exists.
create or replace function submit_rsvp(
  p_slug text,
  p_event text,
  p_attending boolean,
  p_pax integer default null
)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_guest_id uuid;
  v_invited_pax integer;
begin
  if p_event not in ('akad', 'resepsi') then
    return false;
  end if;

  select g.id, g.pax into v_guest_id, v_invited_pax
    from guests g
    join guest_events e on e.guest_id = g.id
   where g.public_slug = p_slug
     and e.event = p_event
     -- Waitlisted is not an invitation. They were never sent a link either,
     -- but a forwarded one must not become a way to accept.
     and e.invite_status = 'confirmed';

  if v_guest_id is null then
    return false;
  end if;

  if p_attending then
    -- Pax down only. A guest may come as fewer than invited, never more:
    -- capacity was planned against the invitation, and bringing an extra
    -- person is a conversation with the couple rather than a number a guest
    -- can raise themselves.
    if p_pax is null or p_pax < 1 or p_pax > v_invited_pax then
      return false;
    end if;
  end if;

  -- The elevation, and its whole scope: one statement, on one row, after
  -- every check above has passed.
  set local role service_role;

  update guest_events
     set rsvp_status = case when p_attending then 'attending' else 'not_attending' end,
         -- A decline records no headcount. Nobody is coming, so there is no
         -- number, and one typed alongside it is answering a different
         -- question.
         pax_confirmed = case when p_attending then p_pax else null end,
         responded_at = now(),
         responded_via = 'guest_form',
         -- Nobody signed in did this. Leaving an admin here would make the
         -- audit trail claim a person answered when the guest did.
         responded_by = null
   where guest_id = v_guest_id
     and event = p_event;

  return true;
end;
$$;

grant execute on function submit_rsvp(text, text, boolean, integer) to anon, authenticated;
