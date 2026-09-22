-- The invitation opens in the guest's own language. `guests.language` has
-- existed since 20260823100000 for the WhatsApp templates; the public slug
-- lookup now returns it too, so /to/<slug> can pick the default the same way
-- the templates do. The guest can still switch on the page.
--
-- The return table changes shape, so the function is dropped and recreated
-- rather than replaced. Same security posture as before: SECURITY DEFINER,
-- exactly one guest, no credential.
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
  language text
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
    g.language
  from guests g
  where g.public_slug = p_slug
$$;

grant execute on function guest_by_public_slug(text) to anon, authenticated;
