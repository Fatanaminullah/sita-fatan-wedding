# Design: Audit Trail (Phase 1)

Date: 2026-08-06
Status: approved by owner
Next step: `superpowers:writing-plans` to produce the implementation plan

Full context: `docs/DATA_MODEL.md`, `docs/TECH_SPEC.md`.

---

## Problem

Four surfaces mutate shared state with no record of who changed what: guest CRUD (6 inviters editing overlapping guest data), cap edits (`inviters.akad_cap`/`resepsi_cap`, `side_caps.vip_cap`), account management (create/delete, role, password reset), and waitlist promotions. When two people disagree about a guest's pax or an inviter's cap, there is currently nothing to check against but memory.

## Decisions

### D1. One generic `audit_log` table, not one per domain

A single table covers all four surfaces: `actor_id`, `action`, `entity_type`, `entity_id`, `entity_label`, `diff`, `created_at`.

**Why:** four domains at this scale don't justify four migrations, four RLS policies, and four screens. A generic table with a typed `action` string (`guest.create`, `caps.update`, `user.password_reset`, `waitlist.promote`, ...) covers the same ground with one of everything.

*Rejected:* per-domain history tables (`guest_history`, `caps_history`, ...). More natural typed columns per table, but 4x the plumbing for four to twelve mutation points total.

### D2. Field-level diff, not full row snapshots

`diff` is `jsonb`, holding only the fields that actually changed: `{ "pax": { "old": 2, "new": 3 } }`. A create logs every field as `{ old: null, new: value }`; a delete logs every field as `{ old: value, new: null }`.

**Why:** the admin screen renders "pax changed from 2 to 3" directly with no diffing step at read time, and rows stay small. Full-row snapshots would double storage for no benefit at this scale (a single guest edit touching one field would otherwise write the entire row twice).

### D3. One log entry per action call, not per table touched

`updateGuest` writes rows to both `guests` and `guest_events` (invite status) in one save. This produces exactly one `audit_log` row, `entity_type = 'guest'`, with the diff covering both the guest fields and any `invite_status` changes together.

**Why:** the admin experiences one save as one moment in time. Splitting it across two log rows makes the admin recombine them mentally to answer "what happened when I clicked save."

### D4. Explicit call in each server action, not a DB trigger

Each of the four action files calls `insertAuditLog(...)` once, after the mutation succeeds and before `revalidatePath`.

**Why:** `user-actions.ts` performs its real mutation through `getAdminSupabase()` (`SUPABASE_SECRET_KEY`, see `CLAUDE.md`), which has no `auth.uid()` context for a trigger to read. An explicit call captures the actor from `getCurrentProfile()` (the RLS-bound client, read before the secret key is ever reached, matching the existing `requireAdmin()` pattern) regardless of which client performs the underlying write. It also gives full control over which fields end up in `diff` (critically: `resetPassword` must never log the password itself).

### D5. Admin-only read, immutable by omission

`audit_log` has an insert policy (`admin` or `inviter` role, `actor_id = auth.uid()`) and a select policy (`admin` only). No update or no delete policy exists for any role, including admin.

**Why:** this is the one table where "an admin can fix a mistake by editing the row" is the wrong answer. If an entry is wrong, the correction is a new entry, not an edit of history. Read access is admin-only to match the sensitivity of what's logged (account actions, password resets happened, cap changes) rather than extending the "all, read" viewer pattern used elsewhere in the RLS matrix.

*Rejected:* extending viewer's usual "all, read" access to this table. Everything else viewer reads is guest/capacity data; this table additionally records account lifecycle events.

---

## Schema

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(user_id) on delete set null,
  actor_name text not null,        -- snapshot: survives actor deletion
  actor_role text not null,        -- snapshot: role at time of action
  action text not null,            -- 'guest.create' | 'guest.update' | 'guest.delete'
                                    -- | 'caps.update' | 'waitlist.promote'
                                    -- | 'user.create' | 'user.update' | 'user.password_reset' | 'user.delete'
  entity_type text not null,       -- 'guest' | 'inviter_caps' | 'side_caps' | 'guest_event' | 'user'
  entity_id text not null,         -- uuid for guest/user, inviter key or side name for caps
  entity_label text not null,      -- snapshot label (e.g. guest name), reads fine after rename/delete
  diff jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy audit_log_insert on audit_log for insert
  with check (current_profile_role() in ('admin', 'inviter') and actor_id = auth.uid());

create policy audit_log_admin_read on audit_log for select
  using (current_profile_role() = 'admin');

-- no update, no delete policy for anyone: denied by default, not by an explicit deny rule
```

Reuses `current_profile_role()` from `20260801144411_harden_rls_helper_functions.sql`. `entity_id` is `text`, not a typed FK, because it points at different tables depending on `entity_type` (guest/user use a uuid, caps use an inviter key or side name).

## Domain function

`src/domain/audit.ts`:

```ts
export function buildDiff<T extends Record<string, unknown>>(
  before: Partial<T> | null,
  after: Partial<T> | null,
  fields: readonly (keyof T)[]
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const field of fields) {
    const oldValue = before ? before[field] ?? null : null
    const newValue = after ? after[field] ?? null : null
    if (oldValue !== newValue) diff[field as string] = { old: oldValue, new: newValue }
  }
  return diff
}
```

Pure, no IO. `before: null` (create) and `after: null` (delete) are both valid inputs.

## Integration points

`src/server/repositories/audit-log-repository.ts` exports one function, `insertAuditLog(supabase, entry)`. `getCurrentProfile()` (`src/server/actions/auth-actions.ts:49`) gains `full_name` in its select so callers get the actor's display name without an extra query.

Call sites, all after the mutation succeeds, before `revalidatePath`:

| File | Actions | Notes |
|---|---|---|
| `guest-actions.ts` | `createGuest`, `updateGuest`, `deleteGuest`, `updateGuestField` | `updateGuest`'s diff covers both guest fields and any `invite_status` change (D3) |
| `caps-actions.ts` | `saveCaps` | One entry per inviter/side whose cap actually changed, not one per form submit |
| `user-actions.ts` | `createUser`, `setUsername`, `resetPassword`, `deleteUser` | `resetPassword` logs the action with an empty diff; the password itself never appears |
| `waitlist-actions.ts` | `promoteGuest` | `action: 'waitlist.promote'`, `entity_type: 'guest_event'` |

## Admin UI

New `/audit` screen, admin-only (same sidebar gating as `/users`). Table columns: timestamp, actor name, action, entity label, expandable diff row. Filters: entity_type, actor. Read-only: no edit or delete controls, matching the immutability at the DB level.

## Testing

- `src/domain/audit.test.ts`: `buildDiff` for create (before null), delete (after null), update (only changed field survives), no-op field dropped.
- `tests/rls/audit-log.test.ts` (same pattern as the rest of `tests/rls/`): admin selects all rows; inviter inserts only with their own `actor_id`; inviter cannot select; nobody, including admin, can update or delete a row.
- No test for the four call sites themselves: they are wiring around already-tested domain logic and repositories, not domain logic in their own right (`CLAUDE.md` testing scope).

## Deferred

Filtering the admin UI by date range, and any retention/archival policy, are not needed at 330 guests over a few months and are left for later if the table ever grows large enough to matter.
