-- Final whole-branch review hardening. Three unrelated but small fixes,
-- bundled because each is one statement.

-- 1. State the EXECUTE grants the RLS helpers actually depend on. Until now
-- this rested on Supabase's bootstrap default grant, which is a property of
-- the hosted project rather than anything this repo declares. A rebuild from
-- migrations alone should not silently lose it.
grant execute on function current_profile_role() to authenticated, service_role;
grant execute on function current_inviter_key() to authenticated, service_role;

-- 2. The RSVP-column guard's service-role escape hatch tested auth.role(),
-- which reads a JWT claim. With the current key format (sb_secret_...) there
-- may be no such claim to read, which would have turned the escape hatch into
-- a dead branch and blocked the import script / the future /rsvp/[token]
-- route. current_user is the Postgres role the connection actually runs as,
-- which is what this check meant all along.
create or replace function guard_guest_events_rsvp_columns() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'service_role' or current_profile_role() = 'admin' then
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

-- 3. validate_pax_confirmed was SECURITY INVOKER, so its lookup of the parent
-- guest ran through the caller's RLS. If the guest row was invisible to the
-- caller, invited_pax came back NULL, `new.pax_confirmed > NULL` evaluated to
-- NULL, and the check silently passed — the trigger failed open exactly when
-- it mattered. SECURITY DEFINER plus an explicit null guard closes both.
create or replace function validate_pax_confirmed() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  invited_pax int;
begin
  if new.pax_confirmed is null then
    return new;
  end if;
  select pax into invited_pax from guests where id = new.guest_id;
  if invited_pax is null then
    raise exception 'guest % not found or not visible', new.guest_id;
  end if;
  if new.pax_confirmed > invited_pax then
    raise exception 'pax_confirmed (%) exceeds invited pax (%) for guest %',
      new.pax_confirmed, invited_pax, new.guest_id;
  end if;
  return new;
end;
$$;
