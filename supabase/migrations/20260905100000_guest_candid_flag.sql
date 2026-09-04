-- The invitation page shows a second, more personal set of prewedding photos
-- (the at-home series) to a chosen subset of guests only. The owner has not yet
-- decided how that subset will be stored. Until a real column exists, the rule
-- is: friends invited directly by the couple, not through the parents.
--
-- The rule lives here, in SQL, so that the page never learns `type` or
-- `inviter_key` and swapping in a real column later is a one-line change to
-- the `candid` expression below.
--
-- Return types cannot be altered in place, so this drops and recreates.
-- Everything deliberately absent before stays absent: no token, no phone, no
-- note, no id, no inviter.
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
  candid boolean
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
    (g.type = 'friend' and g.inviter_key in ('Fatan', 'Sita')) as candid
  from guests g
  where g.public_slug = p_slug
$$;

grant execute on function guest_by_public_slug(text) to anon, authenticated;
