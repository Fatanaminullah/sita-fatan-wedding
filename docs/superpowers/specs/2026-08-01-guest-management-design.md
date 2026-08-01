# Design: Wedding Guest Management App (Phase 1)

Date: 2026-08-01
Status: approved by owner
Next step: `superpowers:writing-plans` to produce the Phase 1 implementation plan

Full context: `docs/PRD.md`, `docs/TECH_SPEC.md`, `docs/DATA_MODEL.md`.
This document records **what was decided and why**, including what was rejected. The three docs above describe the resulting system.

---

## Problem

A Google Sheet tracks 330 guest entries / 556 pax across 6 inviters for a wedding on 10 October 2026. It counts well and does nothing else: no invitations, no self-service RSVP, no check-in, no way to stop a guest collecting two souvenirs, no live view on the day.

Two facts discovered while analysing the sheet shaped the whole design:

1. **Only 37 of 330 entries have a phone number.** Invitations are sent by WhatsApp, so 89% of the guest list is unreachable today.
2. **Four inviters are over cap by 63 pax combined**, and none of their rows are flagged. Meanwhile the 16 pax that *are* flagged as waiting list belong to an inviter who is comfortably under cap on both events.

## Decisions

### D1. Waitlist is modelled per event; the sheet stays guest-level

The sheet has one Waiting List flag per person. The app models `invite_status` on `guest_events`, so a guest can be confirmed for Resepsi and waitlisted for Akad simultaneously.

**Why:** the real overrun is event-specific. Mama Fatan is 25 pax over on Akad and 2 under on Resepsi. A guest-level flag would push her extra guests out of a Resepsi that has room for them.

Import expands the guest-level flag across all of that guest's events. **Nothing writes back to the sheet.** The sheet retires at import and is never a parallel system.

*Rejected:* per-guest flag to match the sheet exactly. Simpler schema, wrong answers.

### D2. One waitlist state, not two

The owner's 16 discretionary holds and the 63 pax of cap overrun collapse into a single `waitlisted` state.

Import brings the 16 in as waitlisted. The 63 import as **confirmed** and light up red on the dashboard until the owner sits down with each of the four inviters and demotes specific people by hand.

**Why no auto-demotion:** spreadsheet row order is not priority order. Cutting the bottom N rows would waitlist people arbitrarily. Only a human can decide which cousin waits.

*Rejected:* a third `on_hold` state distinguishing "I'm unsure" from "cap says no." More honest, but the extra state propagates into every screen and query for a distinction that stops mattering the moment each case is resolved.

### D3. Phone numbers are collected in the app, not the sheet

Import runs once with whatever phones exist. The remaining ~293 are entered by each inviter, for their own guests, through the app, with a "missing phone" filter scoped to their own list.

**Why:** the alternative is running two live copies of the data for weeks and re-importing repeatedly, matching on name. Name matching is already known-fragile here: two duplicate names (`ihsan`, `dian`) exist on one side. It also converts one long chore for the owner into four short ones for the parents.

**Consequence:** the send gate splits in two. Quota is a blast-level gate; a missing phone is a per-guest skip that is counted and reported, never a blocker on everyone else.

*Rejected:* idempotent re-runnable import (fragile matching, two sources of truth); owner bulk-pastes later (most work for the busiest person).

### D4. Business rules live in a pure domain layer

`src/domain/` holds quota, waitlist, souvenir, RSVP validation, and import mapping as pure TypeScript. It may not import `supabase-js`, `next`, React, or `src/server/`, enforced by lint.

Server actions load state through repositories, call a domain function, receive `{ allowed, flags[], nextState }`, then persist. The domain decides what a write *means*, never whether it happens, which is exactly what "warn, allow, flag" requires.

**Why:** it makes the rules testable in milliseconds with no database, which is the only reason test-first is affordable on this calendar.

*Rejected:* logic as Postgres functions and triggers. Better atomicity, but SQL is hostile to test-first and a fresh agent debugging a trigger cascade the week of the wedding is a bad bet. One piece was kept from it: let the database referee concurrency through constraints (see D5).

*Rejected:* browser-direct supabase-js with RLS as the only wall. The WhatsApp gateway key cannot ship to a browser.

### D5. Concurrency is settled by database constraints, not code

`souvenir_claims.guest_id` is UNIQUE. Two helpers scanning the same guest at the same moment cannot both succeed, regardless of application logic. The unique violation is the correct answer and the UI renders it as "already received."

### D6. Testing is test-first on logic, absent on screens

Test-driven: quota, waitlist, souvenir, RSVP validation, import mapper, and one integration test per role per table for RLS.
Not tested: components, E2E.

**Why RLS earns integration tests despite the plumbing:** it is the one layer where a bug is invisible in development, because the owner is always admin locally, and severe in production. The `/rsvp/[token]` route is the sharpest edge: it is unauthenticated by design, so an enumeration bug there leaks the entire guest list.

### D7. Capacity is derived, never counted

`remaining = cap - SUM(pax of confirmed, non-declined guests)`. No stored counter, so a decline or a pax reduction frees capacity with nothing to reconcile.

Enforcement happens only at the per-inviter, per-event level. The six caps sum exactly to the per-side caps, which sum exactly to the venue caps, so one enforcement point produces three correct views.

### D8. Scope cuts

- **`groups` table dropped.** The dashboard breakdown that would have used it was never a priority, and quota is per inviter. `guests.note` keeps the raw text, so normalizing later costs one additive migration. This also removed a blocking task from the owner (agreeing a merge list for near-duplicate labels with his fiancée).
- **`slot_offers` deferred.** The design it came from admits no logic reads it.

---

## Phase 1 scope

Ceiling mid-August 2026. Ship earlier if genuinely done.

1. Supabase project, schema migrations, RLS policies for all four roles
2. Email + password auth, admin-created accounts, no self-signup
3. `scripts/import-sheet.ts`: Sheets API to database, per D1 and the mapping in `TECH_SPEC.md` 4.1
4. Guest CRUD, scoped by role
5. Phone backfill: inviter-writable field, missing-phone filter, per-inviter gap count
6. Quota engine: derived capacity, warn/allow/flag, over-cap surfaced in red
7. Waitlist: per-event state, slot-fill cascade (inviter, then side, then global), promote screen
8. Dashboard skeleton: invited / confirmed / arrived, where confirmed defaults to invited until RSVP exists in Phase 2

Domain layer before screens, without exception.

### Out of scope for Phase 1

RSVP page, WhatsApp sending of any kind, QR generation, check-in, souvenir stations, visual design.

---

## The sheet stays live during development

The Google Sheet keeps being edited while this is built. Import runs **once, at cut-over**, against whatever the sheet contains that day. Not now.

Consequences the implementation must respect:

- **Every number in these docs is a snapshot dated 2026-08-01, not a specification.** Entry counts, pax totals, over-cap figures, phone-fill rates, and souvenir counts will all differ at cut-over. Never hardcode them, never assert on them, never treat a mismatch as a bug.
- **Duplicate names are not a blocker.** Two rows with the same name import as two guests with two UUIDs. That is correct behaviour: they may genuinely be two people. Deduplication is a human judgement call made in-app afterwards through normal guest delete/edit, not something the importer should guess at.
- The importer validates **shape**, not **content**: required columns present, event values parseable, pax numeric, inviter key resolvable. It reports counts and anomalies, and refuses only on structural damage.
- Structural changes to the sheet (renamed or reordered columns) are the one thing that legitimately breaks import. Read columns by header name, never by position.

## Open items carried into implementation

- [ ] Confirm the VIP cap is genuinely per side (25/25). The schema commits to this via `side_caps`; switching to per-inviter later would be an additive migration, not a rewrite.
- [ ] Choose UI component library and form library (pick boring and popular)
- [ ] Decide guest-facing copy language, Indonesian assumed, before Phase 2

## Success criteria for Phase 1

Stated as properties, deliberately not as numbers, because the source data moves.

- Every sheet entry is present in the database with correct inviter, events, VIP tier, and waitlist state. Import reports the count it processed; that count is whatever the sheet held that day.
- Each of the 4 parents can log in and see exactly their own guests and nobody else's, verified by an RLS test, not by clicking
- Every inviter currently over cap is visibly flagged with their live numbers, computed at read time, never stored
- Adding a guest over cap succeeds and returns a flag, never an error
- Declining or reducing pax frees capacity without any manual adjustment
- Each parent can find and close their own missing-phone gaps without going through anyone else
- Re-running import against an already-populated database refuses unless explicitly forced
