-- Only admin (or a service-role connection, e.g. the import script / the
-- future unauthenticated /rsvp/[token] route) may set or change the
-- RSVP-related columns on guest_events. Inviters may still manage the
-- non-RSVP fields on their own guests' events (invite_status, waitlist_rank)
-- via the existing guest_events_inviter_own policy -- this trigger only
-- guards the five RSVP columns, closing the gap between DATA_MODEL.md's
-- prose ("only admin may proxy-RSVP") and its RLS matrix ("inviter: own
-- guests only, CRUD"), which the matrix alone didn't enforce.

create function guard_guest_events_rsvp_columns() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.role() = 'service_role' or current_profile_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.rsvp_status is distinct from 'pending'
       or new.pax_confirmed is not null
       or new.responded_at is not null
       or new.responded_via is not null
       or new.responded_by is not null
    then
      raise exception 'Only admin may set RSVP fields on guest_events at creation (rsvp_status, pax_confirmed, responded_at, responded_via, responded_by).';
    end if;
  else
    if new.rsvp_status is distinct from old.rsvp_status
       or new.pax_confirmed is distinct from old.pax_confirmed
       or new.responded_at is distinct from old.responded_at
       or new.responded_via is distinct from old.responded_via
       or new.responded_by is distinct from old.responded_by
    then
      raise exception 'Only admin may change RSVP fields on guest_events (rsvp_status, pax_confirmed, responded_at, responded_via, responded_by).';
    end if;
  end if;

  return new;
end;
$$;

create trigger guest_events_guard_rsvp_columns
  before insert or update on guest_events
  for each row execute function guard_guest_events_rsvp_columns();
