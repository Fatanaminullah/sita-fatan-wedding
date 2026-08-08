-- Some guests (family, important people) get a printed card instead of a
-- digital send. This is a delivery-method flag only: it does not change the
-- WA broadcast or QR check-in flow, both still run for every guest so RSVP
-- and check-in still work regardless of how the invitation itself arrived.
--
-- Additive, not null, defaulted false so every existing row reads as digital
-- (today's default) with nothing to backfill.
alter table guests
  add column is_physical_invitation boolean not null default false;
