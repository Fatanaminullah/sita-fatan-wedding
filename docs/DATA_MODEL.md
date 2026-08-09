# Data Model

Schema, constraints, and RLS matrix.
Companions: `PRD.md` (product), `TECH_SPEC.md` (architecture).

Date: 2026-08-01. Status: implemented and migrated (see `supabase/migrations/`).

---

## Tables

### `profiles`

Extends `auth.users`. One row per operator (6 people plus ushers plus any viewers).

Sign-in takes a username or an email. Supabase password auth is email-only, so the login action resolves a username to its address through `email_for_username(text)`, a security definer function granted to `anon` (there is no session yet, so nothing RLS-scoped is available). It returns one email for one username and nothing else. Addresses on `auth.users` were never real inboxes: an account created without one gets `<username>@sita-fatan.local`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK `auth.users.id` |
| `username` | text unique | What they type to sign in. Lowercase, `^[a-z0-9][a-z0-9._-]{0,30}[a-z0-9]$`, no `@` |
| `full_name` | text | |
| `role` | text | `superadmin` / `admin` / `inviter` / `usher` / `viewer` |
| `inviter_key` | text null | FK `inviters.key`. Set only when `role = 'inviter'` |
| `side` | text null | `fatan` / `sita`. Required when `role = 'admin'`: an admin manages one side of the wedding (`admin_role_has_side`) |

### `inviters`

Six seed rows. Caps are admin-editable, never hardcoded in application code.

| Column | Type | Notes |
|---|---|---|
| `key` | text PK | e.g. `Mama Fatan` |
| `side` | text | `fatan` / `sita` |
| `akad_cap` | int | |
| `resepsi_cap` | int | |

Seed values as of 2026-08-01:

| key | side | akad_cap | resepsi_cap |
|---|---|---|---|
| Fatan | fatan | 20 | 90 |
| Mama Fatan | fatan | 40 | 80 |
| Papa Fatan | fatan | 40 | 80 |
| Sita | sita | 20 | 90 |
| Mama Sita | sita | 40 | 80 |
| Papa Sita | sita | 40 | 80 |

**There is deliberately no `vip_cap` here.** VIP is capped per side, not per inviter (see `side_caps`), because VIP status is a tier the couple assigns, not something each parent allocates from their own budget.

### `side_caps`

Two rows. Holds caps that exist at side level rather than inviter level.

| Column | Type | Notes |
|---|---|---|
| `side` | text PK | `fatan` / `sita` |
| `vip_cap` | int | 25 each, 50 venue total |
| `physical_cap` | int | printed invitation cards, 25 each, 50-card print run. Counts entries (one card per invitation), not pax, and counts every guest with `is_physical_invitation` regardless of RSVP: a declined guest's card is already printed. |

VIP overrun follows the same warn, allow, flag pattern as everything else. A VIP swap on the morning of the wedding must never be blocked by a cap. Printed-card overrun works the same way.

Because the printed pool is shared by a whole side while an inviter's guests RLS view is partial, the counts come from `physical_invitation_counts()`, a `security definer` function returning `(side, used)` aggregates only, granted to `authenticated`. Both the dashboard meter and the save-time warning read it, so every role measures against the true side total.

### `guests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `pax` | int | headcount this entry represents |
| `side` | text | `fatan` / `sita` |
| `inviter_key` | text | FK `inviters.key` |
| `type` | text | `family` / `friend` |
| `note` | text null | raw text from the sheet's Note column, unnormalized |
| `phone` | text null | E.164. Null for ~293 rows at import; backfilled in-app |
| `rsvp_token` | uuid UNIQUE | generated at import, encoded in the QR |
| `is_vip` | bool | tier inside Resepsi, not a separate event |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `guest_events`

One row per guest per invited event. This is where waitlisting and RSVP live.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `guest_id` | uuid | FK `guests.id` ON DELETE CASCADE |
| `event` | text | `akad` / `resepsi` |
| `invite_status` | text | `confirmed` / `waitlisted` |
| `waitlist_rank` | int null | ordering within a waitlist pool |
| `rsvp_status` | text | `pending` / `attending` / `not_attending` |
| `pax_confirmed` | int null | ≤ `guests.pax`, never greater |
| `responded_at` | timestamptz null | |
| `responded_via` | text null | `guest_form` / `admin_manual` |
| `responded_by` | uuid null | FK `profiles.user_id`, set for proxy entries |

**`UNIQUE (guest_id, event)`**

### `checkin_events`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `guest_id` | uuid | FK `guests.id` |
| `event` | text | `akad` / `resepsi` |
| `checked_in_at` | timestamptz | |
| `checked_in_by` | uuid | FK `profiles.user_id` |

Repeat scans are allowed to insert (they are real events worth seeing) but the scan UI warns on the second one. If duplicate rows prove noisy in practice, add `UNIQUE (guest_id, event)` later; do not add it up front.

### `souvenir_claims`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `guest_id` | uuid **UNIQUE** | FK `guests.id` |
| `claimed_at` | timestamptz | |
| `claimed_by` | uuid | FK `profiles.user_id` |
| `claimed_via` | text | `akad_table` / `resepsi_scan` |

**The UNIQUE constraint on `guest_id` is load-bearing.** One souvenir per guest, per wedding, not per event and not per pax. This constraint, not application code, is what makes a double handout impossible when two helpers scan simultaneously. Do not remove it, and do not "fix" a unique-violation error by upserting: the violation is the correct answer and the UI should surface it as "already received."

Expected total claims: 320.

### `wa_sends`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `guest_id` | uuid | FK `guests.id` |
| `kind` | text | `invite` / `qr_checkin` |
| `status` | text | `queued` / `sent` / `delivered` / `failed` / `link_opened` |
| `provider` | text | `fake` / `fonnte` / `meta` / `waha` |
| `sent_at` | timestamptz null | |
| `updated_at` | timestamptz | |
| `error_message` | text null | |

---

## Derived capacity

Never stored as a running counter.

```sql
-- remaining capacity for one inviter and one event
SELECT i.akad_cap - COALESCE(SUM(g.pax), 0)
FROM inviters i
LEFT JOIN guests g ON g.inviter_key = i.key
LEFT JOIN guest_events ge ON ge.guest_id = g.id AND ge.event = 'akad'
WHERE i.key = $1
  AND ge.invite_status = 'confirmed'
  AND ge.rsvp_status  != 'not_attending'
GROUP BY i.akad_cap;
```

A decline or a pax reduction frees capacity with nothing to reconcile.

---

## RLS matrix

RLS on every table. `select` for a role means only the rows described.

| Table | superadmin | admin | inviter | usher | viewer |
|---|---|---|---|---|---|
| `profiles` | all, CRUD | own row, read | own row, read | own row, read | own row, read |
| `inviters` | all, CRUD | all, read | all, read | none | all, read |
| `side_caps` | all, CRUD | all, read | all, read | none | all, read |
| `guests` | all, CRUD | **own `side` only**, CRUD | **own `inviter_key` only**, CRUD | read via token/scan path only | all, read |
| `guest_events` | all, CRUD | own side's guests only, CRUD | own guests only, CRUD (RSVP columns excepted, see note) | none in Phase 1, see note | all, read |
| `checkin_events` | all, CRUD | all, CRUD (day-of is unscoped) | none | insert + read | all, read |
| `souvenir_claims` | all, CRUD | all, CRUD (day-of is unscoped) | none | insert + read | all, read |
| `wa_sends` | all, CRUD | own side's guests, CRUD | own guests, read | none | all, read |
| `audit_log` | read + insert | insert only | insert only | none | none |
| `planner_*` | all, CRUD | none | none | none | none |

The **admin scoping predicate** is `guests.side = current_profile_side()`, a
`security definer` sibling of `current_profile_role()`. Azka manages the fatan
side; the Sita side is invisible to her at the database, not hidden in the UI.
Day-of cross-side access (scanning whoever arrives at the door) goes through
the Phase 3 token/scan path exactly as ushers do.
Spec: `docs/superpowers/specs/2026-08-09-superadmin-role-design.md`.

Notes:

- The **inviter scoping predicate** is the single most important policy in the system: `guests.inviter_key = (SELECT inviter_key FROM profiles WHERE user_id = auth.uid())`. Every inviter-facing policy derives from it.
- **Only superadmin and admin may proxy-RSVP.** Inviters can edit their guests' details but not answer on their behalf. The `guest_events` RLS policy alone doesn't enforce this (its `for all` grant would otherwise let an inviter write `rsvp_status`, `pax_confirmed`, `responded_at`, `responded_via`, `responded_by` on their own guests' rows); a `before insert or update` trigger (`guard_guest_events_rsvp_columns`) locks those five columns to superadmin, admin, or a service-role connection (import script, `/rsvp/[token]`), leaving `invite_status` and `waitlist_rank` open to inviters as before. The admin path is still side-limited because a cross-side row is unreachable under `guest_events_admin_side`.
- **Ushers have no `guest_events` policy at all.** This matrix originally read "own scan writes only"; the implementation grants ushers nothing on `guest_events`, deliberately. Their day-of writes land in `checkin_events` and `souvenir_claims`, which they do have. Whether the scan path ever needs an usher-scoped `guest_events` write is a Phase 3 question, and the safe default until then is no grant rather than a broad one nobody uses yet (see the comment in `20260801144812_guests_guest_events.sql`).
- **Ushers have no guest-list read.** The scan path resolves a single guest by `rsvp_token` and returns only that guest. An usher must never be able to enumerate guests.
- The guest-facing `/rsvp/[token]` route is unauthenticated and therefore does **not** go through RLS as a logged-in role. It runs server-side using `SUPABASE_SECRET_KEY` with a hard filter on the token, returning exactly one guest and only their confirmed events. Treat this route as the highest-risk surface in the app: an enumeration bug here leaks the whole guest list.

Each cell in this matrix gets an integration test. See `TECH_SPEC.md` section 6.

---

## Constraint summary

| Constraint | Table | Protects |
|---|---|---|
| `UNIQUE (guest_id)` | `souvenir_claims` | double souvenir under concurrent scans |
| `UNIQUE (guest_id, event)` | `guest_events` | duplicate invite rows |
| `UNIQUE (rsvp_token)` | `guests` | token collision |
| `CHECK (pax_confirmed <= pax)` | via trigger or app | guest inflating their party |
| FK `ON DELETE CASCADE` | `guest_events` | orphan event rows |

---

## Deferred tables

`groups` (normalized from the sheet's Note column) and `slot_offers` (audit of who filled a freed slot). Both are additive migrations with no impact on existing rows. `guests.note` keeps the raw text so nothing is lost by waiting.
