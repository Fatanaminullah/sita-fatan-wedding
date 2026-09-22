-- An append-only record of every send attempt.
--
-- `wa_sends` carries `unique (guest_id, kind)`: one row per guest per step,
-- updated in place. That is the right shape for "where does this guest stand",
-- and it is why the wave is resumable and safe to run twice. But it means a
-- retry overwrites the failure it retried, so the question "what did we do to
-- this person, and when, and what came back" has no answer in the data.
--
-- This table answers it. `wa_sends` stays the current-state summary; every
-- attempt also writes one immutable row here. History cannot be reconstructed
-- after the fact, which is why this lands before the first real wave rather
-- than after somebody wishes they had it.

create table wa_send_attempts (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  kind text not null,
  -- What this individual attempt did, not where the guest now stands.
  outcome text not null check (outcome in ('accepted', 'rejected')),
  provider text not null default 'meta',
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  -- Who pressed the button. Null for anything the system did on its own.
  actor_id uuid references auth.users(id) on delete set null
);

comment on table wa_send_attempts is
  'Append-only. One row per attempt, never updated or deleted. wa_sends holds the current state; this holds how it got there.';

comment on column wa_send_attempts.outcome is
  'Whether Meta accepted the request. Delivery is decided later by webhook and belongs on wa_sends.status, not here: this row records one moment.';

-- The two reads this table exists for: one guest's whole story, and the last
-- run's attempts in order.
create index wa_send_attempts_guest_idx on wa_send_attempts (guest_id, attempted_at desc);
create index wa_send_attempts_attempted_idx on wa_send_attempts (attempted_at desc);

alter table wa_send_attempts enable row level security;

-- Read-only to everyone, including admins. An append-only log that an
-- application role can edit is not append-only. Rows are written by the server
-- action through the secret key, which bypasses RLS by design.
create policy wa_send_attempts_superadmin_read on wa_send_attempts for select
  using (current_profile_role() = 'superadmin');

create policy wa_send_attempts_admin_side_read on wa_send_attempts for select
  using (
    current_profile_role() = 'admin'
    and exists (
      select 1 from guests g
      where g.id = wa_send_attempts.guest_id and g.side = current_profile_side()
    )
  );

create policy wa_send_attempts_inviter_read on wa_send_attempts for select
  using (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = wa_send_attempts.guest_id and g.inviter_key = current_inviter_key()
    )
  );
