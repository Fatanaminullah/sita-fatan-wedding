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
    phone.ts          sheet phone cell -> E.164
    summary.ts        dashboard aggregation from guests + caps
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
  import-sheet.ts one-shot Excel file(s) -> database
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

The owner exports the guest list as `.xlsx` files (one per side) and passes their paths as CLI arguments: `npx tsx scripts/import-sheet.ts [--dry-run] [--force] <file1.xlsx> [file2.xlsx ...]`. `--dry-run` maps and reports every row without writing anything, which is how you check a fresh export before cut-over. `scripts/import-sheet.ts` never touches a live Google Sheets connection; it reads the files locally at runtime with the `xlsx` package. The files themselves are git-ignored (`.gitignore` blocks `*.xlsx` repo-wide), so guest data still never enters the repo.

**The sheet stays live throughout development.** Import runs once, at cut-over, against whatever the sheet contains that day. Therefore:

- Read columns **by header name, never by position**. Column order will change.
- Every figure in these docs is a 2026-08-01 snapshot. Do not hardcode or assert on entry counts, pax totals, over-cap numbers, or phone-fill rates.
- Duplicate names import as separate guests with separate UUIDs. They may be two real people. Deduplication is a human decision made in-app afterwards, not the importer's job.
- Validate shape (required headers present, pax numeric, event values parseable, inviter key resolvable), report anomalies as counts, and refuse only on structural damage.

The sheet's columns are `No, Nama, Pax, Undangan, Type, Akad, Resepsi, VIP, Note, Whatsapp, Waiting List`. `No` is ignored; `Note` is optional (its absence is warned about, not fatal); the rest are required and their absence is structural damage.

Mapping per sheet row:

1. One `guests` row. `rsvp_token` generated here (UUID, unguessable).
2. `name` from `Nama`, `pax` from `Pax`, `inviter_key` from `Undangan`.
3. **`side` is derived, not read.** The sheet has no side column. Side is a property of the inviter, so import resolves `Undangan` against the live `inviters` table and takes that inviter's side. An `Undangan` value that is not a seeded inviter key is an error and the row is skipped.
4. One `guest_events` row per event column whose value is `Yes` (Akad, Resepsi). `No` and blank both mean not invited: the column is tri-state in practice and treating any non-blank value as an invitation would invite every `No` row. A row invited to neither event is an error and is skipped.
5. `is_vip` from the VIP column. VIP is a tier on the Resepsi row, not its own event.
6. `invite_status`: `waitlisted` if the sheet's Waiting List column is `Yes`, otherwise `confirmed`.
7. `phone` from the Whatsapp column, normalized to E.164 by `src/domain/phone.ts`. The sheet's cells carry bidi control characters and non-breaking hyphens from Google Sheets autoformatting, plus a mix of `62 8xx-…`, `+62 8xx-…` and local `08xx` shapes. Normalization strips the invisible characters, adds the `+62` country code where it is implied, and flags implausible lengths and non-mobile numbers. Free text in the column (some rows say `Undangan Fisik`) imports as a null phone with a flag.

Yes/No columns (Akad, Resepsi, VIP, Waiting List) are read case-insensitively, accept `Ya`/`Tidak`, and treat blank as `No`. Any other value is an error.

**Blank required fields default rather than drop the guest.** A blank `Pax` imports as 1 and a blank `Type` imports as `friend`, both flagged in the report. A missing headcount is a two-second fix in the app; a guest who silently never imported is one nobody remembers until the door.

An exported sheet is padded with hundreds of empty rows. Those are skipped before mapping and never counted as anomalies.

The sheet's Waiting List column is guest-level (one flag per person). The app's model is per-event. Import expands the flag across all of that guest's events. **This is one-directional. Nothing ever writes back to the sheet.**

Over-cap rows import as `confirmed` and are surfaced in red, never auto-demoted. Sheet row order is not priority order, so only a human can choose who gets waitlisted.

The script is idempotent-safe in the weak sense: it refuses to run against a non-empty `guests` table without an explicit `--force` flag. It is not designed for repeated syncing.

### 4.1b Guest CRUD (Phase 1)

All of it happens in a dialog on `/guests`. There is no add route and no edit route: a list you have to leave in order to fix one cell is the reason the spreadsheet still felt faster.

- Add and edit share one form covering every field: name, pax, inviter, type, Whatsapp, note, VIP, and the per-event invite status (not invited / invited / waiting list).
- **Side is derived from the inviter**, server-side, and is not a form field. It is a property of the inviter, and letting the two disagree is a bug with no upside.
- Phone runs through the same `domain/phone.ts` normalizer the import uses, so a number typed as `0812 3456 7890` lands as E.164 like every imported one.
- Quota is checked before the write and never blocks it. On edit, the guest's own current pax is subtracted first, so re-saving an unchanged guest cannot flag their inviter as over cap twice.
- Over-cap and phone warnings hold the dialog open after a successful save rather than disappearing with it.
- Delete asks for confirmation inline. `guest_events` cascade with the guest.
- An inviter-role user sees only their own key in the inviter dropdown, matching what `guests_inviter_own` will actually let them write.

Moving a guest to the waiting list, including the manual demote pass that follows an over-cap import, is done here by setting that event's status.

### 4.2 Phone backfill (Phase 1)

Roughly 293 of 330 entries lack a phone. Inviters fill their own through the app. Requirements, all shipped:

- `phone` is inviter-writable on their own guests (RLS-scoped)
- A "missing phone" filter, default-scoped to the current user's own guests
- Dashboard shows a per-inviter missing-phone count, each linking into the guest list already filtered to that inviter

**Inline edit mode** is the tool for the backfill itself. Opening a dialog per guest is three interactions for one field; 293 of those is why the spreadsheet still felt faster.

- A toggle on the guest table turns the chosen columns into inputs in place. Which columns is a per-user choice (phone, note, pax, name), phone by default, remembered across sessions.
- A cell saves on blur or Enter and reverts on Escape. One field, one write, one round trip: `updateGuestField` checks the field name against a whitelist and never interpolates it into the query.
- Pax edited inline gets the same warn-allow-flag quota treatment as the dialog, and phone runs through the same E.164 normalizer as the import.
- **Every keystroke is written to `localStorage` before it is written to the server, and the draft is only dropped once the server confirms.** A failed save keeps its draft, shows the error on the cell, and offers "Save all" to retry. Reloading the page brings the drafts back.
- The in-memory draft map is the source of truth and `localStorage` is its mirror, so a blocked or full storage (private windows, quota) costs the reload safety net and nothing else.
- While edit mode is on, or while any draft is unsaved, closing or reloading the tab prompts first.

### 4.2b Caps and accounts (Phase 1, admin only)

Both live behind an admin-only route and redirect everyone else to the dashboard.

**`/caps`** edits `inviters.akad_cap`, `inviters.resepsi_cap` and `side_caps.vip_cap` in one form, showing what is already used beside each field and the venue totals underneath. Lowering a cap below what is already invited is allowed: it turns that inviter red, it does not reject anybody. Caps are the ceiling every warning is measured against, so they are admin-editable rather than a migration constant.

**`/users`** creates the logins that get handed over: name, email, password, role, and an inviter key for inviter accounts. It also resets passwords and deletes accounts, and it will not let an admin delete their own. There is no self-signup, no magic link, no OTP, and nothing is emailed (`docs/PRD.md`, "Login").

This is the third and last place allowed to use `SUPABASE_SECRET_KEY` (see CLAUDE.md). Supabase's auth admin API has no RLS-scoped equivalent, so every action in `user-actions.ts` starts by reading the caller's own profile through the RLS-bound client and refusing anyone who is not an admin.

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

### What Phase 1 ships

Every block the sheet's Summary tab had, matched number for number:

- capacity meters for Akad, Resepsi and VIP (used / cap / remaining, over-cap in red)
- used-vs-cap bars per inviter, one chart per event
- pax by side across both events and the VIP tier
- family vs friend split
- entries rather than pax (Akad, Resepsi, both, unique) for souvenir and QR prep
- phone coverage, linking straight into the missing-phone filter
- waiting-list pax, per inviter, per event
- one capacity table: inviter rows, side subtotals, grand total

**The arithmetic is `src/domain/summary.ts`, not the page.** `buildSummary` takes guests plus caps and returns every figure above; the page only lays them out. It is test-driven for the same reason the quota engine is, and it is what keeps two cards on the same screen from disagreeing.

Counting rules, applied everywhere:

- a seat is used when the guest is `confirmed` for that event and has not declined
- waitlisted pax are never counted against a cap, and are reported on their own
- VIP is a tier on Resepsi, so a VIP invited only to Akad is not a VIP seat
- family/friend and entry counts cover the same population as the seats: people still waiting are not in them
- an inviter's row is scoped by RLS, so an inviter-role viewer sees only their own row rather than five rows of misleading zeroes

Chart colours come from the `--chart-*` tokens in `globals.css`, a fixed categorical order validated for colourblind separation against both the light and dark surfaces. Re-order or substitute a hue and the set has to be re-validated as a whole.

---

## 6. Testing strategy

**Test-first, scoped to logic.**

Must be test-driven:

- `domain/quota.ts`, `domain/waitlist.ts`, `domain/souvenir.ts`, `domain/rsvp.ts`, `domain/import-mapper.ts`, `domain/phone.ts`, `domain/summary.ts`
- RLS policies: one integration test per role per table, run against the real Supabase project (no local stack, owner declined Docker). Each test creates its own throwaway auth user, profile, and guest rows via the secret key, then deletes them in `afterEach` — see the helpers in `tests/rls/setup.ts`.

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
