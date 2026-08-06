-- supabase/migrations/20260806090000_audit_log.sql
-- audit_log: who changed what across guest CRUD, caps, accounts and waitlist
-- promotions. Immutable by omission -- no update or delete policy exists for
-- any role, including admin. A correction is a new row, never an edit of
-- history (docs/superpowers/specs/2026-08-06-audit-trail-design.md, D5).

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (user_id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null check (action in (
    'guest.create', 'guest.update', 'guest.delete',
    'caps.update',
    'waitlist.promote',
    'user.create', 'user.update', 'user.password_reset', 'user.delete'
  )),
  entity_type text not null check (entity_type in ('guest', 'inviter_caps', 'side_caps', 'guest_event', 'user')),
  entity_id text not null,
  entity_label text not null,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy audit_log_insert on audit_log for insert
  with check (current_profile_role() in ('admin', 'inviter') and actor_id = auth.uid());

create policy audit_log_admin_read on audit_log for select
  using (current_profile_role() = 'admin');

-- no update, no delete policy for anyone: denied by default, not by an explicit deny rule
