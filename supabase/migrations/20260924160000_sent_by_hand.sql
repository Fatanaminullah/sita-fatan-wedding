-- The invitation the couple delivered themselves.
--
-- Forty-five guests have no number on purpose: they are being invited in
-- person, or through a message the couple send from their own phone. Nothing
-- recorded that, so the guests screen called every one of them "Not sent" and
-- they sat in the same column as genuine outstanding work.
--
-- Deliberately not is_physical_invitation, which is the nearest thing that
-- already exists. That flag means a printed card, it is rationed by
-- side_caps.physical_cap, and physicalFlag warns when a side is running out of
-- them. Marking forty-five guests physical to mean "I sent this myself" would
-- corrupt a count that exists to ration paper.
--
-- A guest carrying this is out of the digital waves for the invitation step,
-- which is the point for anyone who does have a number: they have had it
-- already, and a wave must not send it twice.
alter table guests add column sent_manually_at timestamptz;

comment on column guests.sent_manually_at is
  'When the couple delivered this invitation themselves, by hand or from their own phone. Distinct from is_physical_invitation, which means a printed card and is capped per side.';
