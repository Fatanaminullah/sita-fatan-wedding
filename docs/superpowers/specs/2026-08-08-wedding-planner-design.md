# Wedding Planner — Design

Date: 2026-08-08. Status: approved, not yet implemented.

Companion docs: `PRODUCT.md` (product truth), `DESIGN.md` (visual system), `TECH_SPEC.md` (existing architecture), `DATA_MODEL.md` (existing schema).

---

## 1. Problem

The wedding's dated work lives in `Wedding To-Do List.md` inside an Obsidian vault only Fatan can open. The same commitment can also exist in a Google Calendar entry, a Google Sheet, and a WhatsApp thread with a vendor, and no copy is authoritative. Sita cannot see the list at all.

The planner wins by being the single obvious place to look, and by being faster to capture into than WhatsApp. Anything that adds a second place to check is a regression.

Wedding date is 10 October 2026 and does not move.

## 2. Scope

**In:** dated tasks, timed events, month/week/day calendar, per-task notes and subtasks, a status dashboard, an app-wide countdown, one-time import of the vault list.

**Out, deliberately, and not to be reintroduced by a builder:** Google Calendar sync, WhatsApp reminders, email digests, browser push, recurring tasks, priorities, categories, vendor entities, budget tracking, drag-and-drop rescheduling.

**Untouched:** every guest-system screen, the role model, and the existing tokens except for additive planner needs.

## 3. Users and access

Admin only: Fatan and Sita. Both see everything. `inviter`, `usher` and `viewer` roles get no planner navigation entry and no row-level read access.

`assignee` on every item is `fatan | sita | both`, used for filtering and for knowing who owns what. It is not an access boundary.

RLS on every planner table: read and write require `profiles.role = 'admin'`.

## 4. Data model

```sql
planner_tasks
  id            uuid primary key
  title         text not null
  notes         text null                     -- free text, markdown-ish, no renderer required in v1
  due_date      date null                     -- null = unscheduled backlog
  due_end_date  date null                     -- inclusive range end; null = single-day
  assignee      text not null default 'both'  -- check (fatan|sita|both)
  status        text not null default 'todo'  -- check (todo|done)
  is_flagged    boolean not null default false
  completed_at  timestamptz null
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

planner_subtasks
  id        uuid primary key
  task_id   uuid not null references planner_tasks(id) on delete cascade
  title     text not null
  is_done   boolean not null default false
  position  integer not null

planner_events
  id          uuid primary key
  title       text not null
  notes       text null
  starts_at   timestamptz not null
  ends_at     timestamptz not null
  all_day     boolean not null default false
  location    text null
  assignee    text not null default 'both'
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()
```

Decisions embedded above:

- **Two entities, not one.** A task is something that gets completed; an event occupies time. Both render on the same calendar, layered. Collapsing them would force a task to carry meaningless time fields, or an event to carry a meaningless done state.
- **Tasks use `date`, not `timestamptz`.** Day granularity is what the real content has, and it removes all timezone ambiguity from the dominant entity.
- **`due_end_date` is first-class.** Roughly half the real items are three-day blocks ("due end of July"), not points. A single-day task simply leaves it null.
- **Events use `timestamptz` with a fixed `Asia/Jakarta` assumption.** Single-timezone product, documented, no per-user timezone. An `all_day` event stores `starts_at` at 00:00:00 and `ends_at` at 23:59:59 Asia/Jakarta on its last day, inclusive; renderers ignore the time component when `all_day` is true rather than deriving it.
- **`is_flagged` exists** because the real list contains blockers waiting on someone else with no date and no owner, and those must not sink.
- **No audit rows on planner writes.** Two admins, two months. The guest system's audit trail exists for a multi-party accountability problem the planner does not have.

## 5. Architecture

Follows the existing three-layer split exactly.

```
src/domain/planner.ts               pure, no IO
src/domain/planner.test.ts          vitest
src/server/repositories/planner-tasks-repository.ts
src/server/repositories/planner-events-repository.ts
src/server/actions/planner-actions.ts       returns { ok, error }
src/app/(dashboard)/planner/page.tsx            status home
src/app/(dashboard)/planner/calendar/page.tsx   month | week | day
src/app/(dashboard)/planner/tasks/page.tsx      list + backlog
src/components/planner/                          view + chip + sheet components
```

Pure functions in `src/domain/planner.ts`, each unit-tested with no database:

- `buildMonthGrid(month)` — the 6×7 day matrix including leading and trailing days
- `expandMultiDaySpans(items, rangeStart, rangeEnd)` — a task with `due_end_date` or a multi-day event becomes per-day segments with `isStart` / `isEnd` flags
- `layoutTimedEvents(events)` — overlap detection and lane assignment for the hour grid
- `bucketByHorizon(items, today)` — overdue / today / next 7 days / this month / unscheduled
- `daysUntilWedding(today)` — the countdown

View state lives entirely in the URL (`?view=month|week|day&date=YYYY-MM-DD&assignee=&hideDone=`), so the server component fetches exactly the visible range and a laptop session is linkable and refresh-safe.

One new dependency: `date-fns`.

## 6. Design direction

Visual authority is the documented incumbent world, "The Operations Room" (`DESIGN.md`). No new visual world, no wedding motifs on this surface. Visitor mode is **Operate**.

**Structural thesis: status before structure.** Planner home is a single scrolling column of status cards. The calendar is a destination you go to when you want to arrange, not the thing you land on. The calendar is where a month gets shaped; the home is where a night gets survived.

**Focal moment:** the countdown hero on planner home, the only display-size element in the product, immediately followed by whatever is overdue.

Touch density governs every planner surface: 44px minimum interactive target, 16px padding. The guest screens keep ops density (32px). Both are legal; the surface chooses.

## 7. Surfaces

### 7.1 Countdown strip (app-wide)

A slim bar at the top of every authenticated screen: days remaining and the date, in numeral typography, muted. Tapping it navigates to planner home. Tone escalates inside the final week. Hidden on planner home itself, where the display-size hero already carries it, so the product still has exactly one display element.

After 10 October it stops counting down and reads as a date marker, because the product outlives the wedding for post-wedding admin.

### 7.2 Planner home (`/planner`)

One column, fixed order, each card rendering nothing at all when it has nothing to say:

1. **Countdown hero** — display-size numeral, date beneath, a thin elapsed bar.
2. **Overdue** — red, count plus the actual items. The highest-signal element on the screen.
3. **Next 7 days** — one merged chronological list of tasks and events. Date chip, title, assignee. This is "what is closest".
4. **Flagged** — items pinned as blocked on someone else. Amber. Stays until unflagged.
5. **This month** — remaining items in the current month, so three-day blocks stay visible before they go overdue.
6. **Progress** — `24 / 31 done` with a plain bar. Not a chart.
7. **Unscheduled** — count of dateless tasks, one tap to the backlog.

First run, before import, shows a single sentence plus one action. No illustration.

### 7.3 Calendar (`/planner/calendar`)

Month, week, day, hand-built. Phone defaults to day, desktop to month; an explicit URL view always wins.

- **Month:** 7-column grid at both sizes. Phone cells show up to 2 chips then `+N`; desktop up to 3 then `+N more`. Tapping a day navigates to that day. Never a popover.
- **Week, desktop:** all-day lane on top carrying multi-day bars, hour grid below, sticky hour gutter, scrolled to 07:00 by default.
- **Week, phone:** the hour grid is dropped. It becomes an agenda list grouped by day, with all 7 day headers always rendered so swiping keeps its bearings. No horizontal scrolling.
- **Day:** hour grid at both sizes, all-day strip pinned above, red line marking now when today is in view.
- **Navigation:** sticky bar with `‹ Today ›`, the period title, and a `Day | Week | Month` segmented control. Swipe changes period on touch.
- **Filters:** assignee and hide-done, persisted in the URL.

### 7.4 Capture and edit

A floating action button in the thumb zone opens a bottom sheet with the keyboard already up and the cursor in a single title field. Date defaults to today, assignee to both, type to task. Save closes it.

This is the interaction the product lives or dies on: it must beat opening WhatsApp. Everything beyond the title is an edit performed later, or never.

The same sheet, expanded, is the edit surface: a `Task | Event` segmented toggle at the top, then type-appropriate fields. Task carries title, due date, optional end date, assignee, flag, notes, subtasks. Event carries title, start, end, all-day toggle, location, assignee, notes. From 768px up it is a centered dialog instead of a sheet.

Tapping an empty calendar slot opens the same sheet prefilled with that date, and in week or day view that time.

### 7.5 Task list (`/planner/tasks`)

Grouped by month, with the undated backlog last. Same chips, same checkbox behavior, same filters. This is the weekend-laptop surface for bulk reshuffling.

### 7.6 Chips

A task chip carries its own checkbox: tapping the box completes optimistically with a quiet undo, tapping the body opens the item. Done reads as muted and struck through, never as color alone. Overdue is red plus the word. Flagged is amber plus a pin.

Chips never use the five chart series colors, and are never pills, because pill geometry means status in this system.

## 8. States and ranges

Realistic: 20–60 tasks total, 0–6 items on a given day, 0–3 timed events per week, up to 8 overdue at worst, notes 0–500 characters, 0–5 subtasks.

Material states to build: empty before import, first run, overdue-heavy, all-clear, a day with more chips than a month cell can hold, a task spanning three days, a slow connection at a venue, and post-10-October when there is nothing left to count down to.

## 9. Seed import

A one-time script in `scripts/` imports the ~20 items from the vault's `Wedding To-Do List.md`, preserving date blocks as `due_date` plus `due_end_date`, preserving completion state, and creating the known blocker (parents' attire) as a flagged, undated task. After import the vault note becomes history and the app is the source of truth.

## 10. Build order

1. Migration and RLS
2. `src/domain/planner.ts` plus tests
3. Repositories and server actions
4. Month view
5. Day view
6. Week view (desktop grid, phone agenda)
7. Capture sheet and edit dialog
8. Planner home cards and the app-wide countdown strip
9. Seed import script

## 11. Open decisions a builder must not invent

- WhatsApp gateway provider (guest system, unrelated to planner)
- Recurring tasks — nothing in confirmed scope requires them
- Notification channels of any kind — in-app only is a decision, not a gap
- Categories, priorities, vendor linkage, budget — all deliberately excluded from v1
