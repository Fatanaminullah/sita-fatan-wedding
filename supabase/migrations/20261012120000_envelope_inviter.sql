-- Whose guest a gift from someone not on the list came through.
--
-- A gift matched to a guest already knows its inviter, from the guest. One
-- from somebody not on the list, or with no name on it, did not, so the
-- Gifts page could not count it under an inviter or a side. The couple set it
-- by hand when they recognise who brought them.
--
-- Read only when guest_id is null; for a matched gift the guest's inviter
-- wins, so the two can never disagree on screen. Nullable: plenty of these
-- will never be placed.

alter table envelopes
  add column inviter_key text references inviters (key) on update cascade;
