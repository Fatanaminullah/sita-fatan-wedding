-- profiles, inviters, side_caps: identity and cap tables, plus the RLS
-- helper functions every later policy depends on.

create extension if not exists pgcrypto;

create table inviters (
  key text primary key,
  side text not null check (side in ('fatan', 'sita')),
  akad_cap int not null,
  resepsi_cap int not null
);

create table side_caps (
  side text primary key check (side in ('fatan', 'sita')),
  vip_cap int not null
);

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'inviter', 'usher', 'viewer')),
  inviter_key text references inviters (key),
  side text check (side in ('fatan', 'sita')),
  constraint inviter_role_has_inviter_key
    check (role <> 'inviter' or inviter_key is not null)
);

-- Seed values as of 2026-08-01 (docs/DATA_MODEL.md). Caps are admin-editable
-- afterwards; this is the starting point, not a re-assertable snapshot.
insert into inviters (key, side, akad_cap, resepsi_cap) values
  ('Fatan', 'fatan', 20, 90),
  ('Mama Fatan', 'fatan', 40, 80),
  ('Papa Fatan', 'fatan', 40, 80),
  ('Sita', 'sita', 20, 90),
  ('Mama Sita', 'sita', 40, 80),
  ('Papa Sita', 'sita', 40, 80);

insert into side_caps (side, vip_cap) values
  ('fatan', 25),
  ('sita', 25);

-- RLS helpers. security definer so a policy on `profiles` itself doesn't
-- recurse into RLS when reading the caller's own role.
create function current_profile_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

create function current_inviter_key() returns text
  language sql stable security definer set search_path = public as $$
  select inviter_key from profiles where user_id = auth.uid()
$$;

alter table profiles enable row level security;
alter table inviters enable row level security;
alter table side_caps enable row level security;

create policy profiles_admin_all on profiles for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy profiles_self_read on profiles for select
  using (user_id = auth.uid());

create policy inviters_admin_all on inviters for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy inviters_read_all on inviters for select
  using (current_profile_role() in ('inviter', 'viewer'));

create policy side_caps_admin_all on side_caps for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy side_caps_read_all on side_caps for select
  using (current_profile_role() in ('inviter', 'viewer'));
