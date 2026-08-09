# Superadmin role, side-scoped admin

Date: 2026-08-09
Status: approved

## What

The couple's role is renamed `superadmin` and keeps everything. A new `admin`
role sits under it: full guest management and day-of tools, but scoped to one
side of the wedding and excluded from the planner, the audit trail, caps
editing, and account management. First admin: Azka, Fatan's sister, `fatan`
side.

## Role matrix after this change

| Surface | superadmin (Fatan, Sita) | admin (Azka) | notes |
|---|---|---|---|
| Dashboard | full, both sides | own side only | side-scoped summary |
| Guests, Waitlist | full CRUD, proxy RSVP, both sides | full CRUD, proxy RSVP, own side only | RLS-enforced, not UI-hidden |
| Check-in, souvenir, wa_sends | full | full, insert/read unscoped | day-of serves every arriving guest |
| Caps `/caps` | edit | no page; read-only data access | side_caps and inviters stay readable |
| Accounts `/users` | full | none | |
| Audit `/audit` | read | none, but her writes still log | insert extends, read narrows |
| Planner + countdown strip | full | none | |

## Scoping mechanics

- `profiles.side` already exists. New check constraint: role `admin` requires
  `side`, mirroring `inviter_role_has_inviter_key`.
- New `security definer` helper `current_profile_side()` beside
  `current_profile_role()`, same grants (`authenticated`, revoked from
  `public`/`anon`).
- Admin's row access on `guests` is `side = current_profile_side()`. On
  `guest_events` and `wa_sends` it is the same predicate through the guest
  row. Superadmin policies have no side predicate.
- **Day-of wrinkle, resolved:** at the door Azka scans whoever arrives,
  including Sita-side guests. Her list access stays fatan-only; the Phase 3
  scan flow reads guests through the token/scan path exactly as ushers do,
  which is cross-side by design. `checkin_events` and `souvenir_claims`
  insert/read are unscoped for admin, like usher.
- `inviters` and `side_caps` stay readable across both sides for admin:
  configuration names and numbers, no guest data. The guest form only offers
  same-side inviters implicitly because a guest's side comes from the inviter.

## One migration

1. Swap the `profiles.role` check constraint to include `superadmin`, then
   `update profiles set role = 'superadmin' where role = 'admin'`. Azka's
   account is created afterwards through `/users`, not by the migration.
2. Add `admin_role_has_side` check constraint (`role <> 'admin' or side is
   not null`). Existing rows satisfy it vacuously after step 1.
3. `current_profile_side()` definer function.
4. Drop/recreate policies:
   - `guests`, `guest_events`, `wa_sends`: superadmin-all unchanged in shape
     (role renamed), plus a new admin policy with the side predicate.
   - `checkin_events`, `souvenir_claims`: admin-all becomes
     `in ('superadmin', 'admin')`, no side predicate.
   - `profiles`, `inviters`, `side_caps` CRUD: `superadmin` only. The read
     policies that today name `('inviter', 'viewer')` gain `'admin'`.
   - `audit_log`: insert `('superadmin', 'admin', 'inviter')`, read
     `superadmin` only.
   - `planner_tasks`, `planner_subtasks`, `planner_events`: `superadmin` only.
5. RSVP column guard trigger (`guard_guest_events_rsvp_columns`): allows
   `('superadmin', 'admin')` alongside service role. The admin path is still
   side-limited because the row itself is unreachable cross-side.

## Domain (TDD)

`scopeSummaryToSide(summary, side)` in `src/domain/summary.ts`, sibling of
`scopeSummaryToInviter`: keeps only that side's row and inviters, filters
`waitlist.byInviter` by side, rebuilds `events` from the side row (akad,
resepsi, vip, physical). Without it the dashboard would show the other side's
inviters as zero-count rows, the same lie fixed for inviters on 2026-08-09.

## App

- Role unions gain `'superadmin'` (auth-actions, user-actions, sidebar,
  users-manager).
- Guards split:
  - superadmin only: `/planner` pages + planner-actions, `/users` +
    user-actions, `/caps` + caps-actions, `/audit`, countdown strip in the
    dashboard layout.
  - superadmin + admin: `/waitlist`, guests `canWrite`, dashboard full (admin
    additionally side-scoped through `scopeSummaryToSide`).
- `/users` role picker gains `admin` and `superadmin`; picking `admin`
  requires a side, mirroring how `inviter` requires an inviter key.
- Dashboard page: superadmin unscoped; admin scoped by `profile.side`;
  inviter scoped by inviter key as today.

## Tests

- Domain: `scopeSummaryToSide` (side row kept, inviters filtered, events
  rebuilt, unknown side untouched).
- RLS: existing full-power expectations move from `admin` to `superadmin`.
  New for `admin`: can CRUD own-side guest, cannot read or write cross-side
  guest, cannot read audit_log or planner_tasks, cannot update side_caps,
  audit insert allowed, checkin_events insert allowed. Setup gains the
  `superadmin` role and a `side` input.

## Docs

`docs/DATA_MODEL.md` role list and RLS matrix; `PRODUCT.md` users section.

## Out of scope, deliberately

- A permission abstraction or role hierarchy table. Five literal roles.
- Changing an existing user's role or side from the UI.
- Any inviter, usher, or viewer behavior change.
- Side-scoping day-of insert paths.
