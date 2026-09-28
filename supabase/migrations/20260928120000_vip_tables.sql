-- VIP tables at the Resepsi, and who sits at which.
--
-- A seat is one person, so `seats` is compared against pax, not entries.
-- The size is per table because one table can be bigger than the rest.
--
-- Seating lives in its own table rather than a column on guests: guests
-- carries guard triggers and per-side RLS written for a different job, and
-- a seat is a fact about the plan, not about the guest. One row per guest
-- (the primary key), so a party can only ever be at one table. Removing a
-- table cascades its rows away, which sends those guests back to unseated.
--
-- The couple's surface only, like the planner and caps: admins are scoped
-- to one side at the database, and a seating plan mixes both.
create table vip_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  seats int not null check (seats between 1 and 30),
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vip_table_guests (
  guest_id uuid primary key references guests (id) on delete cascade,
  table_id uuid not null references vip_tables (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index vip_table_guests_table_id on vip_table_guests (table_id);

create trigger vip_tables_set_updated_at
  before update on vip_tables
  for each row execute function set_updated_at();

alter table vip_tables enable row level security;
alter table vip_table_guests enable row level security;

create policy vip_tables_superadmin_all on vip_tables for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');

create policy vip_table_guests_superadmin_all on vip_table_guests for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');

-- The default the couple asked for: eight tables of six.
insert into vip_tables (name, seats, position)
select 'Table ' || n, 6, n from generate_series(1, 8) as n;
