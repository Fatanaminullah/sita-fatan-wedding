-- The at-home photo series is shown to hand-picked guests only. Until now
-- the invitation page derived "hand-picked" from type + inviter, which put
-- every friend of the couple in; the owner wants to choose. A real column,
-- default off, set by the couple.
--
-- guest_by_public_slug returns it as `candid`, same shape as before, so the
-- page does not change. Nothing else about the function moves.
alter table guests add column candid boolean not null default false;

comment on column guests.candid is
  'Shows the at-home prewedding series on this guest''s invitation. Set by the couple.';

create or replace function guest_by_public_slug(p_slug text)
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
    g.candid
  from guests g
  where g.public_slug = p_slug
$$;

grant execute on function guest_by_public_slug(text) to anon, authenticated;
