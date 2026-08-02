-- checkin_events, souvenir_claims, wa_sends: schema-complete now so Phase 3
-- adds screens against a stable model, not new tables. souvenir_claims's
-- UNIQUE(guest_id) is what makes a double handout impossible under
-- concurrent scans -- do not remove it, do not upsert around a violation.

create table checkin_events (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id),
  event text not null check (event in ('akad', 'resepsi')),
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid not null references profiles (user_id)
);

create table souvenir_claims (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references guests (id),
  claimed_at timestamptz not null default now(),
  claimed_by uuid not null references profiles (user_id),
  claimed_via text not null check (claimed_via in ('akad_table', 'resepsi_scan'))
);

create table wa_sends (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id),
  kind text not null check (kind in ('invite', 'qr_checkin')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'link_opened')),
  provider text not null check (provider in ('fake', 'fonnte', 'meta', 'waha')),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  error_message text
);

create trigger wa_sends_set_updated_at
  before update on wa_sends
  for each row execute function set_updated_at();

alter table checkin_events enable row level security;
alter table souvenir_claims enable row level security;
alter table wa_sends enable row level security;

create policy checkin_events_admin_all on checkin_events for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy checkin_events_usher_insert on checkin_events for insert
  with check (current_profile_role() = 'usher');
create policy checkin_events_usher_read on checkin_events for select
  using (current_profile_role() = 'usher');
create policy checkin_events_viewer_read on checkin_events for select
  using (current_profile_role() = 'viewer');

create policy souvenir_claims_admin_all on souvenir_claims for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy souvenir_claims_usher_insert on souvenir_claims for insert
  with check (current_profile_role() = 'usher');
create policy souvenir_claims_usher_read on souvenir_claims for select
  using (current_profile_role() = 'usher');
create policy souvenir_claims_viewer_read on souvenir_claims for select
  using (current_profile_role() = 'viewer');

create policy wa_sends_admin_all on wa_sends for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy wa_sends_inviter_read on wa_sends for select
  using (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = wa_sends.guest_id and g.inviter_key = current_inviter_key()
    )
  );
create policy wa_sends_viewer_read on wa_sends for select
  using (current_profile_role() = 'viewer');
