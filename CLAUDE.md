# CLAUDE.md

Guidance for AI agents working in this repo. Read `docs/` before proposing anything.

---

## What this is

Wedding invitation and guest-management app for Fatan Aminullah and Sita Cahyani Arasy.
Wedding date: **10 October 2026**. Single day, two events: Akad then Resepsi.

Replaces a Google Sheet that tracks roughly 330 guest entries across 6 inviters.
The sheet is a one-time import source. After import it retires; this app is the only source of truth.

**The sheet is still being edited while you build.** Import runs once, at cut-over, not now. Every number in `docs/` is a 2026-08-01 snapshot for scale only: never hardcode one, never assert on one, never treat a mismatch as a bug. Read sheet columns by header name, never by position. Duplicate names are two real guests until a human says otherwise.

Product truth: `docs/PRD.md`
Architecture: `docs/TECH_SPEC.md`
Schema and RLS: `docs/DATA_MODEL.md`
Approved design: `docs/superpowers/specs/2026-08-01-guest-management-design.md`

### Design context, whole repo

`PRODUCT.md` (users, purpose, the real usage scenes) and `DESIGN.md` (the visual system, named rules, two densities) are the authority for anything you build or restyle. Read `DESIGN.md` before writing UI. Its rules are binding, not suggestions.

### The planner module

A second module lives in this repo alongside guest management: an admin-only planner for the couple's own dated work. **Built and merged on 2026-08-08**, seeded with the couple's real to-do list.

Design: `docs/superpowers/specs/2026-08-08-wedding-planner-design.md`
Plan, as executed: `docs/superpowers/plans/2026-08-08-wedding-planner.md`
Handover written before the build: `docs/PLANNER_HANDOVER.md`
**What still needs a human to look at it: `docs/PLANNER_MANUAL_CHECKS.md`**

That last one matters. The module shipped with its code verified (lint, types, build, domain units, RLS against the live project) and most of its **screens unverified**, because browser checks were declined during the build. The swipe gesture in particular has never run on a real device. Read it before assuming any screen behaviour works.

The plan's own code contained fourteen real defects, found by the per-task reviews and fixed on the branch. Several are documented in commit bodies. Treat the plan file as a record of what was attempted, not as a description of what shipped.

The planner is additive. It does not change the guest system, and it deliberately excludes Google Calendar sync, notifications of any kind, recurring tasks, categories, priorities, vendors, budget, and drag-and-drop. Those were considered and declined.

### The invitation surface

The guest-facing invitation at `sitafatan.wedding/to/[token]` is a third
surface, designed but not yet built. Its UI authority is
`docs/INVITATION_UI_BRIEF.md` — direction ("Paper Theatre"), exact palette,
type, per-section specs and build order. It deliberately does NOT follow
`DESIGN.md`, which governs the admin app only. Sections are built one at a
time: coded comp at 390px, owner approves on a real phone, then production. A per-event Google Maps **link** exists, which is a stored URL and not calendar sync.

---

## Environment

Supabase project already exists, created on the owner's personal account:

| | |
|---|---|
| URL | `https://elzewxhtkqqfdjrvpahv.supabase.co` |
| Ref | `elzewxhtkqqfdjrvpahv` |

Copy `.env.example` to `.env.local` and fill in the keys from the Supabase dashboard.

### API keys: use the current format

Supabase's legacy `anon` and `service_role` JWT keys are **deprecated**. This repo uses the current ones:

| Key | Env var | Exposure |
|---|---|---|
| Publishable, `sb_publishable_...` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser-safe, RLS protects the data |
| Secret, `sb_secret_...` | `SUPABASE_SECRET_KEY` | server only |

Never reintroduce `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, including in code comments, examples, or copied snippets from older Supabase tutorials. Much of the documentation online still shows the old names.

`SUPABASE_SECRET_KEY` bypasses RLS completely. Never import it into a client component, never prefix it with `NEXT_PUBLIC_`, never log it. Exactly four places may use it:

1. `scripts/import-sheet.ts`, the one-shot sheet import.
2. The unauthenticated `/rsvp/[token]` route, which has no logged-in role to be scoped by.
3. `src/server/actions/user-actions.ts`, account creation and password reset. Supabase's auth admin API has no RLS-scoped equivalent, so this is service-role by definition. **Every exported action there begins with `requireAdmin()`**, which reads the caller's own profile through the request-scoped, RLS-bound client. The key is only reached after that check passes.
4. `scripts/import-planner.ts`, the one-shot planner seed from the vault's to-do list.

Adding a fifth place is a decision to take with the owner, not a refactor.

### Timezone

The deployed environment must set `TZ=Asia/Jakarta`. `vitest.config.mjs` pins this for tests, but there is no `vercel.json` in this repo, so the Vercel dashboard is the only place production sets it, and nothing else records that requirement. The planner's date handling resolves dates in the host timezone throughout: on a UTC runtime, every date would shift by seven hours between midnight and 07:00 WIB.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Data / auth / realtime | Supabase (Postgres, RLS, email+password auth) |
| Hosting | Vercel |
| WhatsApp gateway | Adapter interface. `fake` provider first, real provider (Fonnte / Meta Cloud API / WAHA) slotted in later |
| Tests | Vitest for domain logic |

UI is shadcn on Base UI (`src/components/ui/`) with Tailwind v4, plus `lucide-react` and `recharts`. Forms are plain `FormData` posted to server actions; no form library was needed and none should be added without a reason.

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

### Read path, every scoped screen

**A row a role can read is not a row that role should see rendered.**

RLS scopes `guests` per side and per inviter, but `inviters` and `side_caps`
are readable in full by everyone who can read anything. Any screen that renders
one row per lookup record and fills in a count from the scoped table will show
out-of-scope records as legitimate-looking zeros: an empty inviter, unclaimed
capacity, the other family's caps. Nothing errors and RLS is working correctly.

This has shipped three times already (dashboard rollups, the guests capacity
strip, the Side filters). Before building such a screen, read **The Unscoped
Lookup Rule** in `docs/DATA_MODEL.md`. Derive the scope from the data rather
than branching on `profile.role`.

---

## Testing

**Test-driven, but scoped.** Write the test first for anything in this list:

- `src/domain/quota.ts` capacity math and over-cap detection
- `src/domain/waitlist.ts` slot-fill cascade tiers and promotion eligibility
- `src/domain/souvenir.ts` claim eligibility, including the Akad-skipper case
- `src/domain/rsvp.ts` pax-down-only validation
- `src/domain/import-mapper.ts` sheet row to guest + guest_events
- `src/domain/phone.ts` sheet phone cell to E.164
- `src/domain/summary.ts` dashboard aggregation: capacity, side and inviter rollups, entry counts
- RLS policies (integration test against the real Supabase project, one test per role per table; `tests/rls/setup.ts` creates and cleans up its own users and guests, there is no local stack)

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
- The import script reads a local `.xlsx` file passed as a CLI argument at runtime. It does not vendor the data into the repo, and the file itself is never committed.
- Test fixtures use invented names, never real guest rows.
