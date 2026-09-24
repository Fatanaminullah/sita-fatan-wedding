-- The invitation prints the RSVP deadline, so it has to be told what it is.
--
-- The letter on the cover says "Mohon konfirmasi sebelum 26 September", and
-- that date was a literal in src/components/invitation/v2/copy/en.ts and
-- id.ts. The real deadline lives in app_settings.rsvp_deadline, where the
-- couple set it to 30 September, and where the WhatsApp template already
-- reads it from.
--
-- So the message told a guest one date and the invitation it linked to told
-- them another, four days earlier, in both languages.
--
-- app_settings is readable only by a logged-in profile (app_settings_read),
-- and /to/<slug> has no session by design, so the page could not ask. This
-- function already runs as definer and already returns this guest's name, pax
-- and RSVP to anyone holding the slug. The deadline is printed on the page it
-- serves, so returning it discloses nothing the caller is not about to read.
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
  inviter_key text,
  rsvp_deadline text
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
    ),
    exists (
      select 1 from guest_events e
      where e.guest_id = g.id and e.event = 'resepsi' and e.invite_status = 'confirmed'
    ),
    (select e.rsvp_status from guest_events e where e.guest_id = g.id and e.event = 'akad'),
    (select e.rsvp_status from guest_events e where e.guest_id = g.id and e.event = 'resepsi'),
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'akad'),
    (select e.pax_confirmed from guest_events e where e.guest_id = g.id and e.event = 'resepsi'),
    g.candid,
    g.language,
    g.inviter_key,
    -- One row, one key. Null when it has never been set, which the page falls
    -- back from rather than printing an empty line.
    (select s.value from app_settings s where s.key = 'rsvp_deadline')
  from guests g
  where g.public_slug = p_slug
$$;

grant execute on function guest_by_public_slug(text) to anon, authenticated;
