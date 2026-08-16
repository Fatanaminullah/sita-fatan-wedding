-- Resolve one guest from their invite slug, for the unauthenticated /to/<slug>
-- page.
--
-- SECURITY DEFINER with an exact-match lookup, rather than a table grant to
-- anon. `guests` has no anon policy and must not get one: a policy broad
-- enough to serve this page would also permit enumeration, and the guest list
-- is 336 real people with phone numbers.
--
-- It returns only what the page renders. Deliberately absent:
--
--   rsvp_token   the entry ticket. docs/ROUTING.md Decision 2 keeps the invite
--                credential and the entry ticket separate, precisely so a
--                forwarded invite link cannot become entry. Returning it here
--                would undo that, since anything this function returns is
--                readable by anyone holding the slug.
--   phone        never needed by the guest's own page
--   note         internal, often about the guest rather than for them
--                ("Mertua Mita Aldi", "Bu Bidan")
--   id           no reason to expose a primary key to an anonymous caller
--
-- An unknown slug returns zero rows, which the page renders as a plain
-- not-found. No distinction is made between "never existed" and "deleted":
-- both are simply absent, so the function cannot be used to probe.
create or replace function guest_by_public_slug(p_slug text)
returns table (
  name text,
  pax integer,
  side text,
  is_vip boolean,
  invited_akad boolean,
  invited_resepsi boolean
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
    ) as invited_resepsi
  from guests g
  where g.public_slug = p_slug
$$;

-- anon can call it: that is the point, the page is unauthenticated. The
-- function's own WHERE clause is the access control, and it can only ever
-- return a single guest to a caller who already holds that guest's slug.
grant execute on function guest_by_public_slug(text) to anon, authenticated;
