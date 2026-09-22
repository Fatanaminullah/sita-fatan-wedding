-- Let the guest's own RSVP through the guard.
--
-- `submit_rsvp` is SECURITY DEFINER and runs as its owner, `postgres`. The
-- guard on the RSVP columns allowed `service_role` and the two admin roles, so
-- the guest's own answer was refused by the very trigger meant to stop an
-- inviter answering for them.
--
-- The first attempt at this was `set local role service_role` inside the
-- function, which Postgres refuses outright: "cannot set parameter role within
-- security-definer function". That refusal is correct and the workaround was
-- the wrong shape anyway.
--
-- So the guard now names the definer context explicitly. What it is actually
-- expressing has not changed: these five columns may only be written by a
-- privileged path. `postgres` is not reachable by any client — Supabase hands
-- out `anon`, `authenticated` and `service_role`, never this — so the only way
-- to arrive here is through a definer function in this schema, all of which we
-- wrote. `submit_rsvp` validates the slug, the invitation, and the headcount
-- before it writes a single column.
--
-- What is still blocked is exactly what was blocked before: an inviter, a
-- viewer, an usher, or a guest reaching the table by any route other than that
-- function.

create or replace function guard_guest_events_rsvp_columns()
returns trigger
language plpgsql as $$
begin
  if current_user in ('service_role', 'postgres')
     or current_profile_role() in ('superadmin', 'admin') then
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

-- The elevation is gone from the function body: being SECURITY DEFINER is now
-- the whole of it, which is one fewer moving part.
create or replace function submit_rsvp(
  p_slug text,
  p_event text,
  p_attending boolean,
  p_pax integer default null
)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_guest_id uuid;
  v_invited_pax integer;
begin
  if p_event not in ('akad', 'resepsi') then
    return false;
  end if;

  select g.id, g.pax into v_guest_id, v_invited_pax
    from guests g
    join guest_events e on e.guest_id = g.id
   where g.public_slug = p_slug
     and e.event = p_event
     and e.invite_status = 'confirmed';

  if v_guest_id is null then
    return false;
  end if;

  if p_attending then
    if p_pax is null or p_pax < 1 or p_pax > v_invited_pax then
      return false;
    end if;
  end if;

  update guest_events
     set rsvp_status = case when p_attending then 'attending' else 'not_attending' end,
         pax_confirmed = case when p_attending then p_pax else null end,
         responded_at = now(),
         responded_via = 'guest_form',
         responded_by = null
   where guest_id = v_guest_id
     and event = p_event;

  return true;
end;
$$;

grant execute on function submit_rsvp(text, text, boolean, integer) to anon, authenticated;
