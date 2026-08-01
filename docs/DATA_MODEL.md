# Data Model

Schema, constraints, and RLS matrix.
Companions: `PRD.md` (product), `TECH_SPEC.md` (architecture).

Date: 2026-08-01. Status: approved, not yet migrated.

---

## Tables

### `profiles`

Extends `auth.users`. One row per operator (6 people plus ushers plus any viewers).

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK `auth.users.id` |
| `full_name` | text | |
| `role` | text | `admin` / `inviter` / `usher` / `viewer` |
| `inviter_key` | text null | FK `inviters.key`. Set only when `role = 'inviter'` |
| `side` | text null | `fatan` / `sita` |

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

VIP overrun follows the same warn, allow, flag pattern as everything else. A VIP swap on the morning of the wedding must never be blocked by a cap.

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

| Table | admin | inviter | usher | viewer |
|---|---|---|---|---|
| `profiles` | all, CRUD | own row, read | own row, read | own row, read |
| `inviters` | all, CRUD | all, read | none | all, read |
| `side_caps` | all, CRUD | all, read | none | all, read |
| `guests` | all, CRUD | **own `inviter_key` only**, CRUD | read via token/scan path only | all, read |
| `guest_events` | all, CRUD | own guests only, CRUD | own scan writes only | all, read |
| `checkin_events` | all, CRUD | none | insert + read | all, read |
| `souvenir_claims` | all, CRUD | none | insert + read | all, read |
| `wa_sends` | all, CRUD | own guests, read | none | all, read |

Notes:

- The **inviter scoping predicate** is the single most important policy in the system: `guests.inviter_key = (SELECT inviter_key FROM profiles WHERE user_id = auth.uid())`. Every inviter-facing policy derives from it.
- **Only admin may proxy-RSVP.** Inviters can edit their guests' details but not answer on their behalf.
- **Ushers have no guest-list read.** The scan path resolves a single guest by `rsvp_token` and returns only that guest. An usher must never be able to enumerate guests.
- The guest-facing `/rsvp/[token]` route is unauthenticated and therefore does **not** go through RLS as a logged-in role. It runs server-side with a service context and a hard filter on the token, returning exactly one guest and only their confirmed events. Treat this route as the highest-risk surface in the app: an enumeration bug here leaks the whole guest list.

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
