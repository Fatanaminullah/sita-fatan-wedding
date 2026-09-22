-- The invitation needs to know who invited the guest.
--
-- Fatan's parents asked that their own guests not be shown the photographs
-- where the couple are holding hands. Which guests those are is a fact about
-- the inviter, and the invitation had no way to ask: guest_by_public_slug
-- returned everything the page renders except that.
--
-- The key, not the label. `Mama Fatan` and `Papa Fatan` are the primary keys
-- in `inviters`; the interface calls them Umi and Abi through inviterLabel,
-- and that map is the one place the two are allowed to differ.
--
-- Nothing here is a credential and nothing widens what an unauthenticated
-- caller can read: the function already returned this guest's name, pax and
-- RSVP for anyone holding the slug. An inviter key adds no new person to the
-- set of people the caller can learn about.
--
-- Dropped, not replaced: adding a column to a RETURNS TABLE changes the
-- function's return type, and Postgres refuses that in a CREATE OR REPLACE.
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
  resepsi_pax integer,
  candid boolean,
  language text,
  inviter_key text
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
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'resepsi') as resepsi_pax,
    g.candid,
    g.language,
    g.inviter_key
  from guests g
  where g.public_slug = p_slug
$$;

grant execute on function guest_by_public_slug(text) to anon, authenticated;
