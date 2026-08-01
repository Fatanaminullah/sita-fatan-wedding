-- guests, guest_events: the core write path. RLS scoping predicate here
-- (inviter_key = current_inviter_key()) is the single most important
-- policy in the system per docs/DATA_MODEL.md.

create table guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pax int not null check (pax > 0),
  side text not null check (side in ('fatan', 'sita')),
  inviter_key text not null references inviters (key),
  type text not null check (type in ('family', 'friend')),
  note text,
  phone text,
  rsvp_token uuid not null unique default gen_random_uuid(),
  is_vip boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table guest_events (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id) on delete cascade,
  event text not null check (event in ('akad', 'resepsi')),
  invite_status text not null default 'confirmed' check (invite_status in ('confirmed', 'waitlisted')),
  waitlist_rank int,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'attending', 'not_attending')),
  pax_confirmed int,
  responded_at timestamptz,
  responded_via text check (responded_via in ('guest_form', 'admin_manual')),
  responded_by uuid references profiles (user_id),
  unique (guest_id, event)
);

-- pax_confirmed <= guests.pax can't be a CHECK constraint (no subqueries
-- allowed), so it's a trigger. docs/DATA_MODEL.md: "via trigger or app".
create function validate_pax_confirmed() returns trigger
  language plpgsql as $$
declare
  invited_pax int;
begin
  if new.pax_confirmed is null then
    return new;
  end if;
  select pax into invited_pax from guests where id = new.guest_id;
  if new.pax_confirmed > invited_pax then
    raise exception 'pax_confirmed (%) exceeds invited pax (%) for guest %',
      new.pax_confirmed, invited_pax, new.guest_id;
  end if;
  return new;
end;
$$;

create trigger guest_events_pax_confirmed_check
  before insert or update on guest_events
  for each row execute function validate_pax_confirmed();

create function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger guests_set_updated_at
  before update on guests
  for each row execute function set_updated_at();

alter table guests enable row level security;
alter table guest_events enable row level security;

create policy guests_admin_all on guests for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy guests_inviter_own on guests for all
  using (current_profile_role() = 'inviter' and inviter_key = current_inviter_key())
  with check (current_profile_role() = 'inviter' and inviter_key = current_inviter_key());
create policy guests_viewer_read on guests for select
  using (current_profile_role() = 'viewer');
-- Ushers get no policy here by design (docs/DATA_MODEL.md: "read via
-- token/scan path only"). That path is a Phase 3 SECURITY DEFINER RPC
-- resolving a single guest by rsvp_token, not a direct table grant.

create policy guest_events_admin_all on guest_events for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy guest_events_inviter_own on guest_events for all
  using (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = guest_events.guest_id and g.inviter_key = current_inviter_key()
    )
  )
  with check (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = guest_events.guest_id and g.inviter_key = current_inviter_key()
    )
  );
create policy guest_events_viewer_read on guest_events for select
  using (current_profile_role() = 'viewer');
