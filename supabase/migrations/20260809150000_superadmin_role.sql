-- The couple's role becomes `superadmin` and keeps everything. A new `admin`
-- role sits under it: full guest management and day-of tools, scoped to one
-- side of the wedding, excluded from the planner, the audit trail, caps
-- editing, and account management.
-- Spec: docs/superpowers/specs/2026-08-09-superadmin-role-design.md

-- 1. Role vocabulary. The couple's existing rows migrate to superadmin; the
-- first admin account (Azka, fatan side) is created later through /users,
-- never by a migration.
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('superadmin', 'admin', 'inviter', 'usher', 'viewer'));

update profiles set role = 'superadmin' where role = 'admin';

-- An admin manages one side of the wedding, so a side is part of the role's
-- identity, exactly as inviter_key is for inviters.
alter table profiles add constraint admin_role_has_side
  check (role <> 'admin' or side is not null);

-- 2. Side lookup for policies, sibling of current_profile_role(). security
-- definer so policies on guests do not recurse into profiles RLS.
create function current_profile_side() returns text
  language sql stable security definer set search_path = public as $$
  select side from profiles where user_id = auth.uid()
$$;
revoke execute on function current_profile_side() from public, anon;
grant execute on function current_profile_side() to authenticated, service_role;

-- 3. Identity and cap tables: CRUD narrows to superadmin, reads widen to
-- admin. Caps and inviter names are configuration, not guest data, so an
-- admin may read both sides of them.
drop policy profiles_admin_all on profiles;
create policy profiles_superadmin_all on profiles for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');

drop policy inviters_admin_all on inviters;
create policy inviters_superadmin_all on inviters for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');
drop policy inviters_read_all on inviters;
create policy inviters_read_all on inviters for select
  using (current_profile_role() in ('admin', 'inviter', 'viewer'));

drop policy side_caps_admin_all on side_caps;
create policy side_caps_superadmin_all on side_caps for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');
drop policy side_caps_read_all on side_caps;
create policy side_caps_read_all on side_caps for select
  using (current_profile_role() in ('admin', 'inviter', 'viewer'));

-- 4. Guest data: superadmin unscoped, admin scoped to their own side at the
-- database, not hidden in the UI. Day-of cross-side access (Azka scanning a
-- Sita-side arrival) goes through the Phase 3 token/scan definer path like
-- ushers, never through these policies.
drop policy guests_admin_all on guests;
create policy guests_superadmin_all on guests for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');
create policy guests_admin_side on guests for all
  using (current_profile_role() = 'admin' and side = current_profile_side())
  with check (current_profile_role() = 'admin' and side = current_profile_side());

drop policy guest_events_admin_all on guest_events;
create policy guest_events_superadmin_all on guest_events for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');
create policy guest_events_admin_side on guest_events for all
  using (
    current_profile_role() = 'admin'
    and exists (
      select 1 from guests g
      where g.id = guest_events.guest_id and g.side = current_profile_side()
    )
  )
  with check (
    current_profile_role() = 'admin'
    and exists (
      select 1 from guests g
      where g.id = guest_events.guest_id and g.side = current_profile_side()
    )
  );

drop policy wa_sends_admin_all on wa_sends;
create policy wa_sends_superadmin_all on wa_sends for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');
create policy wa_sends_admin_side on wa_sends for all
  using (
    current_profile_role() = 'admin'
    and exists (
      select 1 from guests g
      where g.id = wa_sends.guest_id and g.side = current_profile_side()
    )
  )
  with check (
    current_profile_role() = 'admin'
    and exists (
      select 1 from guests g
      where g.id = wa_sends.guest_id and g.side = current_profile_side()
    )
  );

-- 5. Day-of tables stay unscoped for admin: the door serves every arriving
-- guest regardless of side.
drop policy checkin_events_admin_all on checkin_events;
create policy checkin_events_admin_all on checkin_events for all
  using (current_profile_role() in ('superadmin', 'admin'))
  with check (current_profile_role() in ('superadmin', 'admin'));

drop policy souvenir_claims_admin_all on souvenir_claims;
create policy souvenir_claims_admin_all on souvenir_claims for all
  using (current_profile_role() in ('superadmin', 'admin'))
  with check (current_profile_role() in ('superadmin', 'admin'));

-- 6. Audit: the trail is the couple's record of who did what, including what
-- their admins did. Admin actions must land in it (insert widens) while the
-- reading of it narrows to superadmin.
drop policy audit_log_insert on audit_log;
create policy audit_log_insert on audit_log for insert
  with check (
    current_profile_role() in ('superadmin', 'admin', 'inviter')
    and actor_id = auth.uid()
  );
drop policy audit_log_admin_read on audit_log;
create policy audit_log_superadmin_read on audit_log for select
  using (current_profile_role() = 'superadmin');

-- 7. Planner is the couple's own surface. Nobody else, including admin.
drop policy planner_tasks_admin_all on planner_tasks;
create policy planner_tasks_superadmin_all on planner_tasks for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');
drop policy planner_subtasks_admin_all on planner_subtasks;
create policy planner_subtasks_superadmin_all on planner_subtasks for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');
drop policy planner_events_admin_all on planner_events;
create policy planner_events_superadmin_all on planner_events for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');

-- 8. Proxy RSVP: both roles may set the RSVP columns. The admin path is
-- still side-limited because a cross-side guest_events row is unreachable
-- under guest_events_admin_side in the first place.
create or replace function guard_guest_events_rsvp_columns() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'service_role' or current_profile_role() in ('superadmin', 'admin') then
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
