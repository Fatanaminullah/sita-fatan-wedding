# CLAUDE.md

Guidance for AI agents working in this repo. Read `docs/` before proposing anything.

---

## What this is

Wedding invitation and guest-management app for Fatan Aminullah and Sita Cahyani Arasy.
Wedding date: **10 October 2026**. Single day, two events: Akad then Resepsi.

Replaces a Google Sheet that currently tracks 330 guest entries / 556 pax across 6 inviters.
The sheet is a one-time import source. After import it retires; this app is the only source of truth.

Product truth: `docs/PRD.md`
Architecture: `docs/TECH_SPEC.md`
Schema and RLS: `docs/DATA_MODEL.md`
Approved design: `docs/superpowers/specs/2026-08-01-guest-management-design.md`

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Data / auth / realtime | Supabase (Postgres, RLS, email+password auth) |
| Hosting | Vercel |
| WhatsApp gateway | Adapter interface. `fake` provider first, real provider (Fonnte / Meta Cloud API / WAHA) slotted in later |
| Tests | Vitest for domain logic |

Not chosen yet, decide when you get there: UI component library, form library. Pick boring and popular.

---

## Folder contract

```
src/domain/       pure TypeScript business rules
src/server/       repositories (supabase queries) + server actions
src/app/          App Router screens, thin
src/components/   presentational
supabase/         migrations, RLS policies
scripts/          one-shot operational scripts (sheet import)
docs/             product + technical docs
```

### The one rule that must not break

**`src/domain/` may not import from `src/server/`, `supabase-js`, `next`, or any React package.**

Domain functions take plain data in and return plain data out. No IO, no framework. This is what makes the business rules testable in milliseconds without a database, and it is the reason the test strategy below is affordable.

Add an ESLint `no-restricted-imports` rule enforcing this in the first PR that creates `src/domain/`. Do not rely on discipline alone.

### Write path, every mutation

```
server action
  -> repository: load current state
  -> domain function: decide  ({ allowed, flags[], nextState })
  -> repository: persist
```

Domain decides what a write *means*, not whether it is permitted to happen. Over-quota writes still succeed and come back flagged. See "Warn, allow, flag" in `docs/PRD.md`.

---

## Testing

**Test-driven, but scoped.** Write the test first for anything in this list:

- `src/domain/quota.ts` capacity math and over-cap detection
- `src/domain/waitlist.ts` slot-fill cascade tiers and promotion eligibility
- `src/domain/souvenir.ts` claim eligibility, including the Akad-skipper case
- `src/domain/rsvp.ts` pax-down-only validation
- `src/domain/import-mapper.ts` sheet row to guest + guest_events
- RLS policies (integration test against a local Supabase, one test per role per table)

**Do not write** component tests or E2E tests. Screens get manual verification.

Rationale: the listed items are arithmetic and access control where a silent bug means a real guest is turned away at a real door, and they are pure functions so tests are cheap. Screens are not worth the plumbing on this timeline.

---

## Deadlines

| Phase | Ceiling | Scope |
|---|---|---|
| 1 Guest management | mid-Aug 2026 | auth + roles, import, guest CRUD, phone backfill, quota engine, waitlist + cascade, dashboard skeleton |
| 2 RSVP | end Aug 2026 | `/rsvp/[token]`, admin proxy RSVP, WA adapter (fake provider), delivery funnel |
| 3 Day-of | **3 Oct 2026, hard** | real WA gateway, D-7 QR trigger, check-in scan, souvenir stations, live arrival dashboard |
| 4 Visual design | none | the "stunning invitation" pass, separate brainstorm, never blocks 1 to 3 |

**These are ceilings, not targets.** Ship each phase as early as it is genuinely done. Only Phase 3's date is immovable: it is D-7 before the wedding, when QR tickets go out.

Ordering constraint, every phase: **domain layer before screens.** Rules are written and tested before anything renders them.

---

## Working conventions

- Owner is a senior frontend developer. Do not over-explain frontend basics.
- Owner's time is fragmented (employed 13:00 to 22:00 WIB weekdays, plus 3 active freelance clients). Prefer changes that land in reviewable slices over long-running branches.
- Ask before adding a dependency that overlaps something already present.
- No em dashes in any user-facing copy in the app. Use commas, colons, or parentheses.
- App UI copy is Indonesian for guest-facing pages, English for admin pages. Confirm with owner before writing large amounts of guest-facing copy.

## Data handling

This repo touches real personal data for ~330 wedding guests: names, phone numbers, family relationships.

- Never commit a database dump, a `.env`, or an exported guest CSV.
- The import script reads from Google Sheets at runtime. It does not vendor the data into the repo.
- Test fixtures use invented names, never real guest rows.
