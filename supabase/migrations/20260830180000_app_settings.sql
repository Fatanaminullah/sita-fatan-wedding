-- Settings the couple can change without a deploy.
--
-- The first one is the RSVP deadline. It is printed into every invitation and
-- every reminder as a template variable, and the waves go out over several
-- days, so it cannot live in the code: a value edited between two waves would
-- send two different dates to two halves of the guest list.
--
-- Deliberately a key/value table rather than a column per setting. There is
-- exactly one row per setting and no schema to migrate the next time the
-- couple want to change a date or a piece of copy, which is the point.

create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(user_id)
);

alter table app_settings enable row level security;

-- Readable by anyone signed in: the send screen shows the deadline, and an
-- inviter looking at the dashboard should see the same date the guests were
-- told. There is nothing sensitive in it.
create policy app_settings_read on app_settings
  for select using (current_profile_role() is not null);

-- Written by the couple and their admins only. An inviter changing the
-- deadline would change what every future message says.
create policy app_settings_write on app_settings
  for all
  using (current_profile_role() = any (array['superadmin', 'admin']))
  with check (current_profile_role() = any (array['superadmin', 'admin']));

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

-- The assumed date, recorded so the send screen has something to show rather
-- than an empty field. Confirmed by the owner on 2026-08-30 as correct "for
-- now", which is exactly why it is editable.
insert into app_settings (key, value) values ('rsvp_deadline', '2026-09-24');
