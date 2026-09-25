-- The send log may not go backwards, and may not be left behind.
--
-- wa_webhook_record_status writes both tables. wa_messages has carried an
-- ordering guard since 20260823100000, with a comment saying why: "Meta's
-- callbacks are not ordered. Never walk a status backwards from read to sent
-- because a delayed retry arrived after the newer one." The update to
-- wa_sends two statements below it never got the same protection.
--
-- The race is real and measured. Meta's `delivered` callback arrives one to
-- two seconds after the send API returns, and markAttempt writes the send row
-- after that: on all five rows where the log and the thread disagreed,
-- wa_sends.updated_at was later than the callback's status_at. So the send row
-- either overwrote a delivered that had just landed, or was not yet carrying
-- the provider_message_id the callback needed to find it.
--
-- wa_sends has no status_at to compare, so the guard is by rank rather than by
-- time, which is the stronger rule anyway: sent < delivered < read, and a
-- status may only move forward. A failure is exempt, because an attempt that
-- has just failed is the newest word however far an earlier one got.
create or replace function wa_webhook_record_status(
  p_secret text,
  p_provider_message_id text,
  p_status text,
  p_status_at timestamptz,
  p_error_code int,
  p_error_title text
) returns void
  language plpgsql volatile security definer set search_path = public, private, pg_temp as $$
begin
  if not private.wa_secret_ok(p_secret) then
    raise exception 'unauthorized';
  end if;

  update wa_messages
     set status = p_status,
         status_at = p_status_at,
         error_code = p_error_code,
         error_title = p_error_title
   where provider_message_id = p_provider_message_id
     -- Meta's callbacks are not ordered. Never walk a status backwards from
     -- read to sent because a delayed retry arrived after the newer one.
     and (status_at is null or p_status_at >= status_at);

  update wa_sends
     set status = p_status,
         error_message = p_error_title
   where provider_message_id = p_provider_message_id
     -- The same rule, by rank: this table has no status_at to compare.
     and (
       p_status = 'failed'
       or coalesce(array_position(array['queued','sent','delivered','read'], p_status), 0)
          > coalesce(array_position(array['queued','sent','delivered','read'], status), 0)
     );
end;
$$;

-- The five already behind. wa_messages is the one that was never wrong: our
-- own insert carries the provider_message_id, so every callback found it.
update wa_sends s
   set status = m.status
  from wa_messages m
 where m.provider_message_id = s.provider_message_id
   and s.status <> 'failed'
   and coalesce(array_position(array['queued','sent','delivered','read'], m.status), 0)
       > coalesce(array_position(array['queued','sent','delivered','read'], s.status), 0);
