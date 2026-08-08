# Planner Handover

Everything an agent needs to start building the planner module, including from a phone.

Written 2026-08-08. Nothing is implemented yet: this hands over a finished design and a finished plan.

---

## 1. What already exists

| File | What it is |
|---|---|
| `docs/superpowers/plans/2026-08-08-wedding-planner.md` | **The plan. 19 TDD tasks. Start here.** |
| `docs/superpowers/specs/2026-08-08-wedding-planner-design.md` | The approved design the plan implements |
| `PRODUCT.md` | Product truth: users, purpose, the three real usage scenes, principles |
| `DESIGN.md` | The visual system, documented as "The Operations Room", with named rules |
| `.impeccable/design.json` | Token metadata, tonal ramps, component snippets |
| `CLAUDE.md` | Repo conventions. The domain-purity rule is not negotiable |

Nothing in `src/domain/planner.ts`, `src/server/repositories/planner-*`, `src/app/(dashboard)/planner/`, or `supabase/migrations/*planner*` exists yet. Task 1 creates the first of them.

## 2. What the planner is, in four sentences

An admin-only module inside the existing wedding app, for Fatan and Sita only. It tracks dated tasks (which get completed) and timed events (which occupy time) as two separate entities, both rendered on one month/week/day calendar. Planner home is a status screen, not the calendar: countdown, overdue, next 7 days, blocked, this month, progress, unscheduled. The phone at night is the primary device, so every planner control is 44px minimum and the week view drops its hour grid entirely below 768px rather than scrolling sideways.

## 3. Environment reality: what runs where

This is the part that decides what can be done from a phone.

| Command | Needs | Cloud / mobile | Local Mac |
|---|---|---|---|
| `npm install` | network | ✅ | ✅ |
| `npm run test -- src/domain/planner.test.ts` | nothing | ✅ | ✅ |
| `npm run test -- tests/lint/domain-purity.test.ts` | nothing | ✅ | ✅ |
| `npm run lint` | nothing | ✅ | ✅ |
| `npx tsc --noEmit` | nothing | ✅ | ✅ |
| `npm run test` (bare) | `.env.local` + live Supabase | ❌ fails | ✅ |
| `npm run test -- tests/rls/planner.test.ts` | `.env.local` + live Supabase | ❌ fails | ✅ |
| `npx supabase db push` | `SUPABASE_ACCESS_TOKEN`, linked project | ❌ | ✅ |
| `npm run build` | Supabase env at build time | ⚠️ likely fails | ✅ |
| `npm run dev` + browser checks | a browser | ❌ | ✅ |
| `npx tsx scripts/import-planner.ts` | `SUPABASE_SECRET_KEY` | ❌ | ✅ |

**Never run bare `npm run test` in a cloud session.** It sweeps `tests/rls/**`, which hit the real Supabase project holding ~330 real guests. Without credentials it fails noisily; with credentials it would be writing to production from a phone. Always scope the test command to a file.

`.env.local` is gitignored and must never be committed, pasted into a chat, or reconstructed from memory.

## 4. Recommended split

**Do on mobile (Tasks 2 through 6, plus optionally 1's file):**

Tasks 2–6 are the five pure domain functions with 31 unit tests between them. No database, no browser, no secrets, no env vars. They are the highest-value and most error-prone part of the whole module, they run in milliseconds, and they are exactly what a phone session is good at. This is roughly half the real thinking in the plan.

Task 1's migration *file* can also be written on mobile. Its `npx supabase db push` and RLS test steps cannot. If you write the file on mobile, stop before Step 5 and say so.

**Do on the Mac (Tasks 1, 7 onward):**

Applying the migration, running RLS tests, building, browser verification, and the seed import all need either credentials or a browser.

**A cloud agent may still write the code for Tasks 7–19** and verify it with `npm run lint && npx tsc --noEmit`. It just cannot prove it works. If you do that, mark the task as "written, unverified" in your final message rather than claiming it passes.

## 5. Guardrails

1. **Follow the plan's task order.** Each task ends with a passing test and a commit. Do not batch several tasks into one commit.
2. **Do not skip the failing-test step.** The plan's TDD steps exist so a green test proves something. Writing the implementation first and the test after produces tests that pass by construction.
3. **`src/domain/` stays pure.** No `@supabase/supabase-js`, no `next`, no `react`, no `@/server/*`. ESLint enforces it; `tests/lint/domain-purity.test.ts` proves ESLint still enforces it. `date-fns` is allowed.
4. **Do not add dependencies** beyond `date-fns`, which Task 2 installs.
5. **Do not implement anything in the plan's "Global Constraints" exclusion list**: Google Calendar sync, WhatsApp/email/push notifications, recurring tasks, priorities, categories, vendor entities, budget tracking, drag-and-drop rescheduling. Every one of those was considered and rejected. Reintroducing one is not initiative, it is scope the owner already declined.
6. **Do not touch the guest system.** No changes to `guests`, `guest_events`, `inviters`, `profiles`, `audit_log`, or any screen under `/guests`, `/waitlist`, `/caps`, `/users`, `/audit`. The planner is additive. The only two existing files the plan modifies are `app-sidebar.tsx` and `(dashboard)/layout.tsx`, both in Task 9, both by a few lines.
7. **Do not write audit-log rows for planner writes.** Deliberate, recorded in the spec.
8. **Read `DESIGN.md` before writing any UI.** The named rules are binding: no shadows except on dismissible layers, pill geometry only for status, chart colors only in charts, never color alone, tabular numerals for comparable numbers, 44px minimum on planner surfaces.
9. **If the plan is wrong, say so and stop.** Do not silently improvise around a step that does not work. A wrong plan step is worth five minutes of the owner's attention.

## 6. Branch and PR

Work on a branch, not `master`:

```bash
git checkout -b feat/planner
```

Commit per task using the messages in the plan. Push and open a PR when a coherent slice is done, at minimum after Task 6 (the whole tested domain layer), which is a genuinely reviewable unit on its own.

## 7. Process skills travel with this repo

Superpowers is vendored into `.claude/skills/`, committed, MIT licensed. A cloud or mobile session that clones this repo has it with no setup step. See `.claude/skills/README.md` for provenance.

**Invoke them by bare name, without the plugin prefix.** Project-scoped skills are `Skill(test-driven-development)`, not `Skill(superpowers:test-driven-development)`. The plan's header still uses the prefixed form because it was written in a session where the plugin was installed; drop the prefix and the name resolves.

The ones that matter here:

- `executing-plans` — work the plan task by task. **Use this one on mobile**, unless the session genuinely has subagents.
- `subagent-driven-development` — the plan's first recommendation, but only where the Agent tool exists.
- `test-driven-development` — the failing-test-first discipline every domain task depends on.
- `verification-before-completion` — do not claim a task passes without showing the command output.
- `systematic-debugging` — when a test fails for a reason the plan did not predict.

If for some reason the skills do not load, they are a convenience rather than a requirement: work the tasks in order, top to bottom, doing each step literally, and commit at each task's final step. The plan is written to be followed by an engineer with zero prior context, which is exactly that fallback.

`.claude/skills/impeccable/` is gitignored and will not be present. Nothing in the plan needs it.

## 8. Known open questions

None blocking. Two things deliberately deferred and recorded at the end of the plan: reordering subtasks by drag, and an offline cache for the poor-signal-at-a-venue scenario.

One thing to confirm with the owner before Task 1's `db push` runs on the Mac: that the linked Supabase project is `elzewxhtkqqfdjrvpahv`, the one holding real guest data. The migration only creates new `planner_*` tables and touches nothing existing, but the check costs nothing.
