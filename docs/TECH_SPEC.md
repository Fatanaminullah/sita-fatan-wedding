# Technical Specification

Wedding invitation and guest-management app.
Companion docs: `PRD.md` (product), `DATA_MODEL.md` (schema and RLS).
Approved design record: `superpowers/specs/2026-08-01-guest-management-design.md`.

Date: 2026-08-01. Status: approved, not yet implemented.

---

## 1. Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js, App Router, TypeScript | Server actions give a trusted place for the WA gateway key and the import script. Matches owner's day-job muscle memory. |
| Database, auth, realtime | Supabase | Postgres with RLS covers role scoping; realtime subscription drives the live arrival counter without polling. |
| Hosting | Vercel | Zero infra to operate. Owner has no time to babysit a server before October. |
| WhatsApp | Adapter interface, `fake` provider first | Gateway choice is deferred; nothing in the funnel should block on it. |
| Tests | Vitest | Domain layer only. See section 6. |

Rejected: self-hosted VPS with a WAHA container (real infra work on a tight calendar); Vite SPA (no server means the gateway key would have to ship to the browser).

---

## 2. Architecture

Three layers, with business rules deliberately isolated from everything that does IO.

```
src/
  domain/         pure TypeScript. No IO, no framework, no database.
    quota.ts          capacity math, over-cap detection
    waitlist.ts       cascade tiers, promotion eligibility
    souvenir.ts       claim eligibility
    rsvp.ts           response validation
    import-mapper.ts  sheet row -> guest + guest_events
    types.ts          shared domain types

  server/
    repositories/   one module per table, wraps supabase-js
    actions/        server actions: load -> decide -> persist
    wa/             WhatsApp adapter interface + providers

  app/            App Router routes, thin
  components/     presentational
supabase/
  migrations/     SQL, checked in, forward-only
scripts/
  import-sheet.ts one-shot Google Sheets -> database
```

### 2.1 The domain purity rule

**`src/domain/` may not import from `src/server/`, `supabase-js`, `next`, or any React package.**

Enforced by an ESLint `no-restricted-imports` rule added in the first PR that creates the folder. Not left to discipline.

This rule is the load-bearing decision of the whole architecture. It is what makes the rules testable without a database, which is what makes test-first affordable on this timeline.

### 2.2 Write path

Every mutation follows the same shape:

```ts
// server action
const state = await repo.loadInviterCapacity(inviterKey, event)
const decision = domain.checkQuota(state, { pax })   // pure
await repo.insertGuest(guest)                        // writes regardless
return decision.flags                                // UI renders warnings
```

The domain function decides what a write *means*, never whether it is allowed. This is what makes "warn, allow, flag" fall out for free rather than being sprinkled through the UI.

### 2.3 Three overlapping walls

| Wall | Protects against | Example |
|---|---|---|
| Domain functions | wrong business answers | over-cap not detected |
| Postgres RLS | a forgotten `where` clause in application code | inviter reading another inviter's guests |
| DB constraints | concurrency | two ushers scanning the same guest at once |

They overlap on purpose. The domain and RLS must agree about role scoping, so RLS gets its own integration test pass (section 6).

---

## 3. Capacity model

Capacity is **always derived, never stored as a counter.**

```
remaining(inviter, event) =
    inviters.cap[event]
  - SUM(guests.pax)
    WHERE guest_events.invite_status = 'confirmed'
      AND guest_events.rsvp_status  != 'not_attending'
```

A decline or a pax reduction frees capacity with no ledger to keep in sync and no drift.

Enforcement happens at one level only: per inviter, per event. The six per-inviter caps sum exactly to the per-side caps, which sum exactly to the venue caps, so every higher rollup is correct automatically. One enforcement point, three correct views.

---

## 4. Key flows

### 4.1 Import (one shot, Phase 1)

`scripts/import-sheet.ts` reads the Google Sheet through the Sheets API at runtime. Guest data is never vendored into the repo.

Mapping per sheet row:

1. One `guests` row. `rsvp_token` generated here (UUID, unguessable).
2. One `guest_events` row per non-blank event column (Akad, Resepsi).
3. `is_vip` from the VIP column. VIP is a tier on the Resepsi row, not its own event.
4. `invite_status`: `waitlisted` if the sheet's Waiting List column is `Yes`, otherwise `confirmed`.
5. `phone` from the Whatsapp column when present, otherwise null.

The sheet's Waiting List column is guest-level (one flag per person). The app's model is per-event. Import expands the flag across all of that guest's events. **This is one-directional. Nothing ever writes back to the sheet.**

Over-cap rows import as `confirmed` and are surfaced in red, never auto-demoted. Sheet row order is not priority order, so only a human can choose who gets waitlisted.

The script is idempotent-safe in the weak sense: it refuses to run against a non-empty `guests` table without an explicit `--force` flag. It is not designed for repeated syncing.

### 4.2 Phone backfill (Phase 1)

Roughly 293 of 330 entries lack a phone. Inviters fill their own through the app. Requirements:

- `phone` is inviter-writable on their own guests (RLS-scoped)
- A "missing phone" filter, default-scoped to the current user's own guests
- Dashboard shows a per-inviter missing-phone count

### 4.3 Send gates

Two independent gates, do not conflate them:

| Gate | Level | Rule |
|---|---|---|
| Quota gate | blast-level | Invitation blast blocked while any inviter is over cap on either event |
| Phone gate | per-guest | A guest with no phone is skipped, counted, and reported. Never blocks the blast. |

Waitlisted guests are excluded from every send, both invite and QR.

### 4.4 RSVP (Phase 2)

`/rsvp/[token]`, no login. Shows only events where `invite_status = 'confirmed'`. Waitlisted events are hidden entirely, not shown greyed out, since the guest should not learn they were held back.

Per event: attending or not attending. If attending, a pax stepper capped at invited pax, **downward only**.

A guest's own submission always overwrites a prior admin proxy entry. `responded_via` and `responded_by` keep the audit trail. No locking.

Admin proxy entry is admin-only (not inviter), requires a short free-text note, and has no cutoff.

`not_attending` frees pax immediately and can trigger the slot-fill prompt.

### 4.5 Slot-fill cascade

When capacity frees up for an inviter and event, offer waitlisted guests in tier order:

1. Same inviter's waitlist
2. Same side's waitlist
3. Global waitlist

Each tier is labelled in the UI so the person choosing knows they are reaching outside their own list. Promoting a guest whose pax exceed current remaining is allowed and re-flags the inviter as over: same warn, allow, flag pattern.

### 4.6 D-7 QR and check-in (Phase 3)

One event day means one cutoff. A single manual trigger fires for both events, gated on the quota gate already being clear.

The QR encodes **only `rsvp_token`**. Not VIP status, not event, not name. Everything else is looked up live at scan time, which is why a VIP swap on the morning of the wedding needs no message resent and no QR regenerated.

Scan resolves token, then shows: name, invited pax, confirmed pax, status for *that specific event*, VIP badge (live from `guests.is_vip`), and a duplicate-scan warning. Name search is the fallback for a guest without their phone.

Check-in roles: Akad by admin, Resepsi by usher. Ushers get per-device accounts, not one shared login, so `checked_in_by` means something.

### 4.7 Souvenirs (Phase 3)

One per guest, 320 total. `souvenir_claims.guest_id` is UNIQUE at the database level, so a double claim is physically impossible regardless of what the application does.

Two stations:

- **Akad**, admin role: an editable tick-list of Akad-confirmed guests. No scanning. Writes `claimed_via = 'akad_table'`.
- **Resepsi**, usher role: a separate physical table from the entrance, its own scan screen, run after check-in. Checks for an existing claim first. If claimed, refuses and says where. If not, allows it and writes `claimed_via = 'resepsi_scan'`.

The real rule is **claimed once, at whichever event the guest presents at first**, not pre-assignment by event. The Resepsi station exists specifically to serve the guest who was invited to both and skipped Akad.

Waitlisted guests are ineligible at both stations.

### 4.8 WhatsApp adapter

```ts
interface WaProvider {
  name: 'fake' | 'fonnte' | 'meta' | 'waha'
  send(to: string, body: string, meta: SendMeta): Promise<SendResult>
}
```

Built now with `fake` (logs only, no network). The whole invite and QR funnel is developed and tested against it. `wa_sends.provider` records which provider handled each message so a mid-flight switch stays auditable. `wa_sends.kind` distinguishes `invite` from `qr_checkin`.

---

## 5. Dashboard

Replaces the sheet's Summary tab. Three-layer capacity view, per event, per side, per inviter:

**Invited** (confirmed `guest_events` rows) / **Confirmed** (`rsvp_status = 'attending'`) / **Arrived** (`checkin_events` exists).

Plus: RSVP response rate, missing-phone counts, over-cap flags in red, delivery funnel (queued, sent, delivered, failed, link opened, responded), waitlist prompts per pool, souvenir claimed versus expected, and a live arrival counter driven by a Supabase realtime subscription on `checkin_events`.

Group breakdown is deferred. Nothing depends on it.

---

## 6. Testing strategy

**Test-first, scoped to logic.**

Must be test-driven:

- `domain/quota.ts`, `domain/waitlist.ts`, `domain/souvenir.ts`, `domain/rsvp.ts`, `domain/import-mapper.ts`
- RLS policies: one integration test per role per table against a local Supabase instance

Explicitly out of scope: component tests, E2E tests, snapshot tests.

The domain modules are pure functions, so their tests need no database, no fixtures beyond plain objects, and run in milliseconds. RLS is the one place where a bug is invisible in development (owner is always admin locally) and catastrophic in production, which is why it earns integration tests despite the plumbing.

Screens are verified by hand. On a personal app with six real operators, the cost of E2E plumbing is not repaid.

---

## 7. Phasing

| Phase | Ceiling | Scope |
|---|---|---|
| 1 Guest management | mid-Aug 2026 | auth + 4 roles, sheet import, guest CRUD, phone backfill + missing-phone filter, quota engine, waitlist + cascade + promote screen, dashboard skeleton |
| 2 RSVP | end Aug 2026 | `/rsvp/[token]`, admin proxy RSVP, WA adapter with fake provider, delivery funnel UI |
| 3 Day-of | **3 Oct 2026, immovable** | real WA gateway, D-7 QR trigger, check-in scan, souvenir stations, live arrival dashboard |
| 4 Visual design | none | guest-facing visual pass, separate brainstorm |

Dates are ceilings, not targets. Ship each phase as soon as it is genuinely done.

Only Phase 3 cannot slip: it is D-7 before a wedding that will not move.

**Ordering constraint, every phase: domain layer before screens.**

If schedule pressure forces cuts, cut in this order: Phase 2 delivery-funnel UI, then Phase 1 cascade UI (promotion can be done by hand through guest edit), then dashboard polish. Never cut the quota engine, the souvenir uniqueness constraint, or RLS.

---

## 8. Deferred, with reasons

| Deferred | Why | Cost to add later |
|---|---|---|
| `groups` table (sheet's Note column) | dashboard group breakdown was never a priority; quota is per inviter | low, additive migration; `guests.note` retains the raw text |
| `slot_offers` audit table | no logic reads it | low, additive |
| Real WA gateway | adapter interface makes it a drop-in | low by construction |
| Component and E2E tests | see section 6 | moderate |
| Guest-facing visual design | separate track, blocks nothing | none |
