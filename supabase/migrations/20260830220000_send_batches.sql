-- Which batch a guest goes out in, and which template each step uses.
--
-- The 220 numbers fit under the 250-a-day cap, so nothing forces a split. The
-- couple want one anyway, and for a better reason than a limit: a first batch
-- that can be read on a real phone and talked about before the rest of the
-- family hears anything. Batches are chosen, not computed.

alter table guests add column send_batch smallint
  check (send_batch is null or send_batch in (1, 2));

comment on column guests.send_batch is
  'Which wave this guest goes out in. NULL means not assigned yet, and an unassigned guest is never swept up by a batch send.';

-- The screen asks "who is in batch 1 and not yet sent", which reads by batch
-- across the whole list.
create index if not exists guests_send_batch_idx on guests (send_batch);

-- ---------------------------------------------------------------------------
-- Which template each step sends
-- ---------------------------------------------------------------------------
--
-- Stored rather than compiled in, because a template can be rejected by Meta
-- and resubmitted under a new name days before a wave, and because the couple
-- should not need a deploy to point a step at a different approved template.
--
-- These are defaults. The screen offers whatever Meta actually has approved.
insert into app_settings (key, value) values
  ('template_invite', 'wedding_invitation_v1'),
  ('template_reminder', 'wedding_rsvp_reminder_v1'),
  ('template_qr_checkin', 'wedding_qr_v1')
on conflict (key) do nothing;
