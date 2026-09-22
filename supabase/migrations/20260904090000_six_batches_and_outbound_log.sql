-- Six batches, and every outbound message in the inbox.
--
-- ---------------------------------------------------------------------------
-- 1. Six batches instead of two
-- ---------------------------------------------------------------------------
--
-- The original split was two: a first batch to read on a real phone before the
-- rest of the family hears anything. In practice the couple want to release the
-- list in smaller steps than half at a time, so the ceiling moves to six.
--
-- Nothing about the rule changes. Batches are still chosen rather than
-- computed, NULL still means unassigned, and an unassigned guest is still never
-- swept up by a batch send. Existing rows in 1 and 2 stay exactly where they
-- are: widening a CHECK invalidates no data.
alter table guests drop constraint guests_send_batch_check;
alter table guests add constraint guests_send_batch_check
  check (send_batch is null or send_batch between 1 and 6);

comment on column guests.send_batch is
  'Which wave this guest goes out in, 1 to 6. NULL means not assigned yet, and an unassigned guest is never swept up by a batch send.';

-- ---------------------------------------------------------------------------
-- 2. What we sent, in the thread that received it
-- ---------------------------------------------------------------------------
--
-- wa_messages held inbound replies and the free-form answers typed in the
-- inbox, and nothing else. Every template a wave sent and every automated
-- answer the RSVP conversation gave went to wa_sends, which is a campaign
-- ledger and not a thread. So the inbox showed the guest's half of a
-- conversation with our half missing: on the screen they answer questions
-- nobody appears to have asked.
--
-- The fix is that every outbound message is recorded here too, which needs one
-- column: which approved template a row was, when it was one. wa_sends still
-- owns campaign state (claims, retries, per-kind uniqueness). This is the
-- transcript.
alter table wa_messages add column template_name text;

comment on column wa_messages.template_name is
  'The approved template this outbound message was sent as, or NULL for free-form text and inbound messages. Campaign state stays in wa_sends; this table is the transcript.';

-- The webhook's recorder predates outbound rows and takes no template name.
-- The RSVP conversation replies from inside that same unauthenticated webhook,
-- so its messages need the same door the inbound ones came through.
--
-- Dropped and recreated rather than replaced with a defaulted argument: adding
-- one would leave the seven-argument version in place beside it and every
-- existing seven-argument call would become ambiguous.
drop function if exists wa_webhook_record_message(text, text, text, text, text, text, timestamptz);

create function wa_webhook_record_message(
  p_secret text,
  p_direction text,
  p_wa_id text,
  p_provider_message_id text,
  p_type text,
  p_body text,
  p_sent_at timestamptz,
  p_template_name text
)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  matched_guest uuid;
  rows_written integer := 0;
begin
  if not private.wa_secret_ok(p_secret) then
    raise exception 'unauthorized';
  end if;

  select g.id into matched_guest
  from guests g
  where g.phone is not null
    and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_wa_id, '\D', '', 'g')
  limit 1;

  insert into wa_messages (
    direction, wa_id, guest_id, provider_message_id, type, body, sent_at, template_name
  ) values (
    p_direction, p_wa_id, matched_guest, p_provider_message_id, p_type, p_body, p_sent_at,
    p_template_name
  )
  on conflict (provider_message_id) do nothing;

  -- Still says nothing about whether the number matched a guest, so this
  -- cannot be turned into an enumeration oracle against the guest list. It
  -- reports only whether this exact message id was new, which a caller that
  -- just sent the message already knows.
  get diagnostics rows_written = row_count;
  return rows_written > 0;
end;
$$;

revoke execute on function wa_webhook_record_message(text, text, text, text, text, text, timestamptz, text) from public;
grant execute on function wa_webhook_record_message(text, text, text, text, text, text, timestamptz, text) to anon, authenticated;
