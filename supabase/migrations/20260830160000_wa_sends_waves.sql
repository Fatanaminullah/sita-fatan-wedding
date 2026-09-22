-- `wa_sends` becomes able to hold the three waves, and to refuse a double send.
--
-- Three gaps, all of which bite on the first real wave rather than later.

-- ---------------------------------------------------------------------------
-- 1. The reminder wave has no name
-- ---------------------------------------------------------------------------
--
-- `kind` was a closed CHECK of ('invite', 'qr_checkin'). The follow-up that
-- lets a guest answer inside WhatsApp is a third thing and could not be
-- recorded at all.
alter table wa_sends drop constraint wa_sends_kind_check;

alter table wa_sends add constraint wa_sends_kind_check check (
  kind = any (array['invite', 'reminder', 'qr_checkin'])
);

-- ---------------------------------------------------------------------------
-- 2. Nothing stopped the same guest being sent to twice
-- ---------------------------------------------------------------------------
--
-- A double-tapped send button would have messaged 231 people again. The plan
-- called for the application to skip anyone already sent, but an application
-- check loses that race the same way a souvenir handout would without its
-- UNIQUE: two requests both read "not sent", both write, both send.
--
-- One row per guest per kind, and a retry UPDATES that row rather than
-- inserting a second one. This is what makes the invite wave resumable: it can
-- be run again after a partial failure and will only reach whoever has not
-- been reached.
--
-- The tradeoff, stated because it is not obvious: a second reminder wave
-- overwrites the first wave's record for that guest rather than adding to it.
-- The per-message history is not lost, it lives in `wa_messages`; what is lost
-- is "when did the first of two reminders go out". That is acceptable while
-- the funnel asks whether a guest was reached, not how many times.
delete from wa_sends a
  using wa_sends b
 where a.guest_id = b.guest_id
   and a.kind = b.kind
   and a.ctid > b.ctid;

alter table wa_sends add constraint wa_sends_guest_kind_key unique (guest_id, kind);

-- ---------------------------------------------------------------------------
-- 3. A rejection is not an error, and has to be retried tomorrow
-- ---------------------------------------------------------------------------
--
-- Meta caps how many marketing messages one person receives across ALL
-- businesses in 24 hours, and rejects the rest with error 131049. That is not
-- a fault in this account and not something to fix: the guidance is to wait a
-- day and try that person again.
--
-- So a send needs to remember how many times it has been tried and why it last
-- failed, or the wave cannot tell "rejected by the daily cap, try tomorrow"
-- from "this number is wrong, stop trying".
alter table wa_sends add column attempts integer not null default 0;
alter table wa_sends add column last_error_code text;
alter table wa_sends add column last_attempt_at timestamptz;

-- The wave's own query: everyone of this kind not yet sent, oldest attempt
-- first, so a retry pass picks up where the previous one stopped.
create index if not exists wa_sends_kind_status_idx on wa_sends (kind, status);
