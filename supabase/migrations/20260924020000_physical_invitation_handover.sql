-- When the printed card actually reached the guest.
--
-- `is_physical_invitation` says a guest gets a card instead of a WhatsApp
-- message. It does not say the card has been handed over, and nothing else
-- did either, so the guests screen read "Not sent" against all nineteen of
-- them forever: a row of outstanding work that could never be cleared.
--
-- It was already wrong rather than merely unhelpful. Eight of the nineteen
-- have answered, so they plainly have their card; the screen still called
-- their invitation unsent.
--
-- guest_for_chat has counted a physical invitation as an invitation since
-- 20260906093000, which is the same reasoning one step earlier: paper counts.
-- This records the fact that reasoning assumes.
--
-- Nullable and no default, so adding it is a catalogue change rather than a
-- table rewrite, and every existing row starts as "not handed over yet" --
-- which is true of the ones that have been, but it is the honest starting
-- point and the couple can tick them off.
alter table guests add column physical_given_at timestamptz;

comment on column guests.physical_given_at is
  'When the printed card was handed to this guest. Null means not yet, and is meaningless unless is_physical_invitation is true.';
