# Wedding Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only planner module to the existing wedding app: dated tasks with notes and subtasks, timed events, a month/week/day calendar, a status home, and an app-wide countdown to 10 October 2026.

**Architecture:** Follows the repo's existing three-layer split exactly. All calendar math lives in `src/domain/planner.ts` as pure functions with no IO and full unit tests. `src/server/repositories/` wraps supabase-js per table. `src/server/actions/` loads, decides, persists, and returns `{ ok: true } | { error: string }`. Routes live under `src/app/(dashboard)/planner/` and read view state from the URL so the server component fetches exactly the visible range.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), Tailwind v4, shadcn on Base UI, Vitest, npm.

## Global Constraints

- Package manager is **npm** (`package-lock.json`). Commands: `npm run test`, `npm run lint`, `npm run build`.
- `src/domain/**` must stay pure. ESLint blocks imports of `@supabase/supabase-js`, `@supabase/ssr`, `next`, `react`, `react-dom`, `src/server/**`, and `@/server/**` there. `date-fns` is allowed.
- Every planner table is admin-only. RLS policies use the existing `current_profile_role()` helper; `= 'admin'` for both `using` and `with check`.
- `updated_at` is maintained by the existing `set_updated_at()` trigger function, not by application code.
- Timezone is fixed `Asia/Jakarta`. Task dates are SQL `date` (no timezone). Event timestamps are `timestamptz`. An `all_day` event stores `starts_at` at 00:00:00 and `ends_at` at 23:59:59 Asia/Jakarta on its last day, inclusive; renderers ignore the time component when `all_day` is true.
- Wedding date constant is `2026-10-10`.
- UI labels are English. Indonesian domain terms stay verbatim: Akad, Resepsi, seserahan, mahar, undangan, souvenir.
- Touch density governs every planner surface: minimum 44px (`h-11`) interactive target, 16px padding. The `md` breakpoint (768px) is the density line. Guest screens keep their 32px controls, unchanged.
- Visual rules are binding and live in `DESIGN.md`: no box shadows except on dismissible layers, pill geometry only for status badges, chart series colors never outside charts, no state communicated by color alone, comparable numbers set in Fira Code with tabular figures (`font-mono tabular-nums`).
- Do not implement, and do not let scope creep introduce: Google Calendar sync, WhatsApp/email/push notifications, recurring tasks, priorities, categories, vendor entities, budget tracking, drag-and-drop rescheduling.
- Do not write audit-log rows for planner writes. That is a deliberate decision, recorded in the spec.
- Reuse existing UI primitives from `src/components/ui/`. Add no new primitive except the calendar grid itself.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_planner.sql` | Three tables, checks, indexes, triggers, RLS |
| `tests/rls/planner.test.ts` | Proves admin-only access and non-admin denial against the live project |
| `src/domain/planner.ts` | All calendar math and bucketing, pure |
| `src/domain/planner.test.ts` | Unit tests for the above |
| `src/server/repositories/planner-tasks-repository.ts` | `planner_tasks` + `planner_subtasks` IO |
| `src/server/repositories/planner-events-repository.ts` | `planner_events` IO |
| `src/server/actions/planner-actions.ts` | Server actions, `{ ok } | { error }` |
| `src/app/(dashboard)/planner/page.tsx` | Status home |
| `src/app/(dashboard)/planner/planner-home-cards.tsx` | The seven home cards |
| `src/app/(dashboard)/planner/calendar/page.tsx` | Calendar route, reads URL view state |
| `src/app/(dashboard)/planner/tasks/page.tsx` | Grouped list + backlog |
| `src/components/planner/calendar-nav.tsx` | Today / prev / next / view switcher |
| `src/components/planner/month-view.tsx` | 6×7 grid |
| `src/components/planner/day-view.tsx` | Hour grid + all-day strip |
| `src/components/planner/week-view.tsx` | Desktop hour grid, phone agenda list |
| `src/components/planner/item-chip.tsx` | Task and event chips |
| `src/components/planner/item-sheet.tsx` | Capture + edit sheet/dialog |
| `src/components/planner/capture-fab.tsx` | Floating action button |
| `src/components/planner/countdown-strip.tsx` | App-wide slim countdown |
| `scripts/import-planner.ts` | One-time seed from the vault to-do list |

**Modify:**

- `src/app/(dashboard)/app-sidebar.tsx` — add the admin-only Planner entry
- `src/app/(dashboard)/layout.tsx` — mount the countdown strip
- `package.json` — add `date-fns`

---

### Task 1: Planner schema and RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_planner.sql`
- Create: `tests/rls/planner.test.ts`

**Interfaces:**
- Consumes: existing `current_profile_role()` and `set_updated_at()` from earlier migrations.
- Produces: tables `planner_tasks`, `planner_subtasks`, `planner_events` with admin-only RLS.

- [ ] **Step 1: Write the failing RLS test**

Create `tests/rls/planner.test.ts`:

```ts
// tests/rls/planner.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getRemoteConfig,
  getAdminClient,
  createTestUser,
  cleanupTestUser,
  clientAs,
  type RemoteConfig,
  type CreateTestUserInput,
} from './setup'

let config: RemoteConfig
let createdUserIds: string[] = []
let createdTaskIds: string[] = []
let createdEventIds: string[] = []

beforeAll(() => {
  config = getRemoteConfig()
})

afterEach(async () => {
  const admin = getAdminClient(config)
  for (const id of createdTaskIds) {
    await admin.from('planner_tasks').delete().eq('id', id)
  }
  createdTaskIds = []
  for (const id of createdEventIds) {
    await admin.from('planner_events').delete().eq('id', id)
  }
  createdEventIds = []
  for (const userId of createdUserIds) {
    await cleanupTestUser(admin, userId)
  }
  createdUserIds = []
})

async function makeTestUser(admin: SupabaseClient, input: CreateTestUserInput) {
  const user = await createTestUser(admin, input)
  createdUserIds.push(user.userId)
  return user
}

async function seedTask(admin: SupabaseClient, title = 'Seed task') {
  const { data, error } = await admin
    .from('planner_tasks')
    .insert({ title, due_date: '2026-08-20', assignee: 'both' })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to seed planner_task: ${error?.message}`)
  createdTaskIds.push(data.id)
  return data.id as string
}

describe('planner RLS', () => {
  it('lets an admin read and write planner_tasks', async () => {
    const admin = getAdminClient(config)
    const user = await makeTestUser(admin, { email: `planner-admin-${crypto.randomUUID()}@test.local`, role: 'admin' })
    const client = await clientAs(config, user.email, user.password)

    const { data: inserted, error: insertError } = await client
      .from('planner_tasks')
      .insert({ title: 'Book souvenir', due_date: '2026-08-15', assignee: 'fatan' })
      .select()
      .single()
    expect(insertError).toBeNull()
    expect(inserted?.title).toBe('Book souvenir')
    createdTaskIds.push(inserted!.id)

    const { data: rows, error: readError } = await client.from('planner_tasks').select('id')
    expect(readError).toBeNull()
    expect(rows!.length).toBeGreaterThan(0)
  })

  it('denies an inviter every planner_tasks operation', async () => {
    const admin = getAdminClient(config)
    const taskId = await seedTask(admin)
    const user = await makeTestUser(admin, {
      email: `planner-inviter-${crypto.randomUUID()}@test.local`,
      role: 'inviter',
      inviterKey: 'Mama Fatan',
      side: 'fatan',
    })
    const client = await clientAs(config, user.email, user.password)

    const { data: rows } = await client.from('planner_tasks').select('id')
    expect(rows).toEqual([])

    const { error: insertError } = await client.from('planner_tasks').insert({ title: 'Nope' })
    expect(insertError).not.toBeNull()

    const { data: updated } = await client
      .from('planner_tasks')
      .update({ title: 'Hijacked' })
      .eq('id', taskId)
      .select()
    expect(updated ?? []).toEqual([])
  })

  it('denies usher and viewer reads of planner_events', async () => {
    const admin = getAdminClient(config)
    const { data: seeded, error } = await admin
      .from('planner_events')
      .insert({
        title: 'First fitting',
        starts_at: '2026-09-02T03:00:00Z',
        ends_at: '2026-09-02T06:00:00Z',
        assignee: 'both',
      })
      .select()
      .single()
    if (error || !seeded) throw new Error(`Failed to seed planner_event: ${error?.message}`)
    createdEventIds.push(seeded.id)

    for (const role of ['usher', 'viewer'] as const) {
      const user = await makeTestUser(admin, { email: `planner-${role}-${crypto.randomUUID()}@test.local`, role })
      const client = await clientAs(config, user.email, user.password)
      const { data: rows } = await client.from('planner_events').select('id')
      expect(rows).toEqual([])
    }
  })

  it('cascades subtask deletion when its task is deleted', async () => {
    const admin = getAdminClient(config)
    const taskId = await seedTask(admin, 'Task with subtasks')
    const { error: subError } = await admin
      .from('planner_subtasks')
      .insert({ task_id: taskId, title: 'Confirm colour', position: 0 })
    expect(subError).toBeNull()

    await admin.from('planner_tasks').delete().eq('id', taskId)
    createdTaskIds = createdTaskIds.filter((id) => id !== taskId)

    const { data: orphans } = await admin.from('planner_subtasks').select('id').eq('task_id', taskId)
    expect(orphans).toEqual([])
  })

  it('rejects a due_end_date earlier than due_date', async () => {
    const admin = getAdminClient(config)
    const { error } = await admin
      .from('planner_tasks')
      .insert({ title: 'Backwards range', due_date: '2026-08-20', due_end_date: '2026-08-10' })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/rls/planner.test.ts`
Expected: FAIL. Errors mention `relation "planner_tasks" does not exist`.

- [ ] **Step 3: Create the migration file**

Run: `npx supabase migration new planner`

This creates `supabase/migrations/<timestamp>_planner.sql`. Note the generated filename; the steps below refer to it as the migration file.

- [ ] **Step 4: Write the migration**

Write this into the file created in Step 3:

```sql
-- planner: admin-only task and event tracking for the run-up to 10 Oct 2026.
-- Two entities on purpose: a task is completed, an event occupies time.
-- (docs/superpowers/specs/2026-08-08-wedding-planner-design.md, section 4)

create table planner_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  notes text,
  -- null due_date = unscheduled backlog. due_end_date is the inclusive end of
  -- a multi-day block ("due end of July"), which is half the real content.
  due_date date,
  due_end_date date,
  assignee text not null default 'both' check (assignee in ('fatan', 'sita', 'both')),
  status text not null default 'todo' check (status in ('todo', 'done')),
  is_flagged boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_tasks_range_ordered check (due_end_date is null or (due_date is not null and due_end_date >= due_date)),
  constraint planner_tasks_completed_at_matches_status check (
    (status = 'done' and completed_at is not null) or (status = 'todo' and completed_at is null)
  )
);

create table planner_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references planner_tasks (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  is_done boolean not null default false,
  position integer not null default 0
);

create table planner_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  notes text,
  -- Asia/Jakarta throughout. An all_day event stores 00:00:00 to 23:59:59
  -- local on its last day, inclusive; renderers ignore the time when all_day.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  assignee text not null default 'both' check (assignee in ('fatan', 'sita', 'both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_events_range_ordered check (ends_at >= starts_at)
);

create index planner_tasks_due_date_idx on planner_tasks (due_date);
create index planner_tasks_status_idx on planner_tasks (status);
create index planner_subtasks_task_id_idx on planner_subtasks (task_id, position);
create index planner_events_starts_at_idx on planner_events (starts_at);

create trigger planner_tasks_set_updated_at
  before update on planner_tasks
  for each row execute function set_updated_at();

create trigger planner_events_set_updated_at
  before update on planner_events
  for each row execute function set_updated_at();

alter table planner_tasks enable row level security;
alter table planner_subtasks enable row level security;
alter table planner_events enable row level security;

-- Admin only, all three tables. Inviters, ushers and viewers are denied by
-- default: no policy grants them anything, so nothing needs to deny them.
create policy planner_tasks_admin_all on planner_tasks for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');

create policy planner_subtasks_admin_all on planner_subtasks for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');

create policy planner_events_admin_all on planner_events for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
```

- [ ] **Step 5: Apply the migration**

Run: `npx supabase db push`
Expected: the new migration is listed and applied without error.

- [ ] **Step 6: Run the RLS tests to verify they pass**

Run: `npm run test -- tests/rls/planner.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations tests/rls/planner.test.ts
git commit -m "feat(planner): add planner tables with admin-only RLS"
```

---

### Task 2: Domain types and date primitives

**Files:**
- Create: `src/domain/planner.ts`
- Create: `src/domain/planner.test.ts`
- Modify: `package.json` (add `date-fns`)

**Interfaces:**
- Consumes: nothing.
- Produces: `Assignee`, `PlannerTask`, `PlannerSubtask`, `PlannerEvent`, `PlannerItem`, `DayKey`, `WEDDING_DATE`, `TIME_ZONE`, `toDayKey(date: Date): DayKey`, `addDayKeys(dayKey: DayKey, days: number): DayKey`, `daysUntilWedding(todayKey: DayKey): number`. Every later task imports these names.

- [ ] **Step 1: Install date-fns**

Run: `npm install date-fns`
Expected: `date-fns` appears in `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `src/domain/planner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toDayKey, addDayKeys, daysUntilWedding, WEDDING_DATE } from './planner'

describe('date primitives', () => {
  it('formats a Date as a YYYY-MM-DD day key', () => {
    expect(toDayKey(new Date(2026, 7, 8))).toBe('2026-08-08')
  })

  it('pads single-digit months and days', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('adds days across a month boundary', () => {
    expect(addDayKeys('2026-08-30', 3)).toBe('2026-09-02')
  })

  it('subtracts days with a negative offset', () => {
    expect(addDayKeys('2026-09-02', -3)).toBe('2026-08-30')
  })

  it('counts days until the wedding', () => {
    expect(daysUntilWedding('2026-08-08')).toBe(63)
    expect(daysUntilWedding(WEDDING_DATE)).toBe(0)
  })

  it('returns a negative count after the wedding', () => {
    expect(daysUntilWedding('2026-10-12')).toBe(-2)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: FAIL with "Failed to resolve import ./planner".

- [ ] **Step 4: Write the implementation**

Create `src/domain/planner.ts`:

```ts
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

/** The whole product is single-timezone. Documented, not configurable. */
export const TIME_ZONE = 'Asia/Jakarta'
export const WEDDING_DATE: DayKey = '2026-10-10'

/** A calendar day with no time and no timezone, always `YYYY-MM-DD`. */
export type DayKey = string

export type Assignee = 'fatan' | 'sita' | 'both'

export type PlannerTask = {
  id: string
  title: string
  notes: string | null
  /** null = unscheduled backlog */
  dueDate: DayKey | null
  /** inclusive end of a multi-day block; null = single day */
  dueEndDate: DayKey | null
  assignee: Assignee
  status: 'todo' | 'done'
  isFlagged: boolean
  completedAt: string | null
}

export type PlannerSubtask = {
  id: string
  taskId: string
  title: string
  isDone: boolean
  position: number
}

export type PlannerEvent = {
  id: string
  title: string
  notes: string | null
  /** ISO 8601 instant */
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string | null
  assignee: Assignee
}

export type PlannerItem =
  | ({ kind: 'task' } & PlannerTask)
  | ({ kind: 'event' } & PlannerEvent)

export function toDayKey(date: Date): DayKey {
  return format(date, 'yyyy-MM-dd')
}

export function addDayKeys(dayKey: DayKey, days: number): DayKey {
  return toDayKey(addDays(parseISO(dayKey), days))
}

/** Positive before the wedding, zero on the day, negative after it. */
export function daysUntilWedding(todayKey: DayKey): number {
  return differenceInCalendarDays(parseISO(WEDDING_DATE), parseISO(todayKey))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verify domain purity still holds**

Run: `npm run lint`
Expected: no `no-restricted-imports` errors. `date-fns` is not on the restricted list.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/domain/planner.ts src/domain/planner.test.ts
git commit -m "feat(planner): add domain types and date primitives"
```

---

### Task 3: Expand multi-day spans

**Files:**
- Modify: `src/domain/planner.ts`
- Modify: `src/domain/planner.test.ts`

**Interfaces:**
- Consumes: `PlannerItem`, `DayKey`, `addDayKeys`, `toDayKey` from Task 2.
- Produces: `type DaySegment = { dayKey: DayKey; item: PlannerItem; isStart: boolean; isEnd: boolean; isAllDay: boolean }` and `expandMultiDaySpans(items: PlannerItem[], rangeStart: DayKey, rangeEnd: DayKey): DaySegment[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/planner.test.ts`:

```ts
import { expandMultiDaySpans, type PlannerItem } from './planner'

function task(overrides: Partial<PlannerTask> = {}): PlannerItem {
  return {
    kind: 'task',
    id: 't1',
    title: 'Souvenir',
    notes: null,
    dueDate: '2026-08-14',
    dueEndDate: null,
    assignee: 'both',
    status: 'todo',
    isFlagged: false,
    completedAt: null,
    ...overrides,
  }
}

function event(overrides: Partial<PlannerEvent> = {}): PlannerItem {
  return {
    kind: 'event',
    id: 'e1',
    title: 'First fitting',
    notes: null,
    startsAt: '2026-07-22T03:00:00+07:00',
    endsAt: '2026-07-22T06:00:00+07:00',
    allDay: false,
    location: 'Bandung',
    assignee: 'both',
    ...overrides,
  }
}

describe('expandMultiDaySpans', () => {
  it('emits one segment for a single-day task', () => {
    const segments = expandMultiDaySpans([task()], '2026-08-01', '2026-08-31')
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ dayKey: '2026-08-14', isStart: true, isEnd: true, isAllDay: true })
  })

  it('emits one segment per day for a three-day block', () => {
    const segments = expandMultiDaySpans(
      [task({ dueDate: '2026-08-14', dueEndDate: '2026-08-16' })],
      '2026-08-01',
      '2026-08-31'
    )
    expect(segments.map((s) => s.dayKey)).toEqual(['2026-08-14', '2026-08-15', '2026-08-16'])
    expect(segments.map((s) => s.isStart)).toEqual([true, false, false])
    expect(segments.map((s) => s.isEnd)).toEqual([false, false, true])
  })

  it('clips a span to the requested range', () => {
    const segments = expandMultiDaySpans(
      [task({ dueDate: '2026-07-30', dueEndDate: '2026-08-03' })],
      '2026-08-01',
      '2026-08-31'
    )
    expect(segments.map((s) => s.dayKey)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    // The real start fell outside the range, so no segment claims to be the start.
    expect(segments[0].isStart).toBe(false)
    expect(segments[2].isEnd).toBe(true)
  })

  it('skips an unscheduled task entirely', () => {
    expect(expandMultiDaySpans([task({ dueDate: null })], '2026-08-01', '2026-08-31')).toEqual([])
  })

  it('marks a timed event as not all-day', () => {
    const segments = expandMultiDaySpans([event()], '2026-07-01', '2026-07-31')
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ dayKey: '2026-07-22', isAllDay: false })
  })

  it('spans an event that crosses midnight into two segments', () => {
    const segments = expandMultiDaySpans(
      [event({ startsAt: '2026-08-24T20:00:00+07:00', endsAt: '2026-08-25T01:00:00+07:00' })],
      '2026-08-01',
      '2026-08-31'
    )
    expect(segments.map((s) => s.dayKey)).toEqual(['2026-08-24', '2026-08-25'])
  })
})
```

Add `PlannerTask` and `PlannerEvent` to the existing import at the top of the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: FAIL with "expandMultiDaySpans is not a function".

- [ ] **Step 3: Write the implementation**

Append to `src/domain/planner.ts`:

```ts
export type DaySegment = {
  dayKey: DayKey
  item: PlannerItem
  /** True only when the item's real first day is inside the requested range. */
  isStart: boolean
  /** True only when the item's real last day is inside the requested range. */
  isEnd: boolean
  /** All-day items render in the strip above the hour grid. */
  isAllDay: boolean
}

function itemSpan(item: PlannerItem): { first: DayKey; last: DayKey; isAllDay: boolean } | null {
  if (item.kind === 'task') {
    if (!item.dueDate) return null
    return { first: item.dueDate, last: item.dueEndDate ?? item.dueDate, isAllDay: true }
  }
  return {
    first: toDayKey(new Date(item.startsAt)),
    last: toDayKey(new Date(item.endsAt)),
    isAllDay: item.allDay,
  }
}

export function expandMultiDaySpans(
  items: PlannerItem[],
  rangeStart: DayKey,
  rangeEnd: DayKey
): DaySegment[] {
  const segments: DaySegment[] = []

  for (const item of items) {
    const span = itemSpan(item)
    if (!span) continue
    if (span.last < rangeStart || span.first > rangeEnd) continue

    const from = span.first < rangeStart ? rangeStart : span.first
    const to = span.last > rangeEnd ? rangeEnd : span.last

    for (let dayKey = from; dayKey <= to; dayKey = addDayKeys(dayKey, 1)) {
      segments.push({
        dayKey,
        item,
        isStart: dayKey === span.first,
        isEnd: dayKey === span.last,
        isAllDay: span.isAllDay,
      })
    }
  }

  return segments
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: PASS, 12 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/domain/planner.ts src/domain/planner.test.ts
git commit -m "feat(planner): expand multi-day task blocks and events into day segments"
```

---

### Task 4: Build the month grid

**Files:**
- Modify: `src/domain/planner.ts`
- Modify: `src/domain/planner.test.ts`

**Interfaces:**
- Consumes: `DayKey`, `toDayKey`, `addDayKeys`.
- Produces: `buildMonthGrid(monthKey: string, weekStartsOn?: 0 | 1): DayKey[][]` returning exactly 6 rows of 7 day keys. `monthKey` is `YYYY-MM`. Default `weekStartsOn` is `0` (Sunday), matching the Google Calendar default in Indonesia.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/planner.test.ts`:

```ts
import { buildMonthGrid } from './planner'

describe('buildMonthGrid', () => {
  it('always returns 6 rows of 7 days', () => {
    const grid = buildMonthGrid('2026-08')
    expect(grid).toHaveLength(6)
    for (const row of grid) expect(row).toHaveLength(7)
  })

  it('starts the first row on the Sunday on or before the 1st', () => {
    // 1 August 2026 is a Saturday, so the grid opens on Sunday 26 July.
    expect(buildMonthGrid('2026-08')[0][0]).toBe('2026-07-26')
  })

  it('contains every day of the month exactly once', () => {
    const flat = buildMonthGrid('2026-08').flat()
    for (let day = 1; day <= 31; day++) {
      const key = `2026-08-${String(day).padStart(2, '0')}`
      expect(flat.filter((d) => d === key)).toHaveLength(1)
    }
  })

  it('runs consecutively with no gaps', () => {
    const flat = buildMonthGrid('2026-10').flat()
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i]).toBe(addDayKeys(flat[i - 1], 1))
    }
  })

  it('honours a Monday week start', () => {
    // 1 October 2026 is a Thursday, so a Monday grid opens on 28 September.
    expect(buildMonthGrid('2026-10', 1)[0][0]).toBe('2026-09-28')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: FAIL with "buildMonthGrid is not a function".

- [ ] **Step 3: Write the implementation**

Append to `src/domain/planner.ts`:

```ts
/**
 * Six rows always, so the grid never changes height between months and the
 * layout does not jump when you page through October.
 */
export function buildMonthGrid(monthKey: string, weekStartsOn: 0 | 1 = 0): DayKey[][] {
  const firstOfMonth = parseISO(`${monthKey}-01`)
  const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7
  let cursor = addDayKeys(toDayKey(firstOfMonth), -offset)

  const grid: DayKey[][] = []
  for (let row = 0; row < 6; row++) {
    const week: DayKey[] = []
    for (let col = 0; col < 7; col++) {
      week.push(cursor)
      cursor = addDayKeys(cursor, 1)
    }
    grid.push(week)
  }
  return grid
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: PASS, 17 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/domain/planner.ts src/domain/planner.test.ts
git commit -m "feat(planner): build a fixed six-row month grid"
```

---

### Task 5: Lay out overlapping timed events

**Files:**
- Modify: `src/domain/planner.ts`
- Modify: `src/domain/planner.test.ts`

**Interfaces:**
- Consumes: `PlannerEvent`, `DayKey`, `toDayKey`.
- Produces: `type TimedLayout = { event: PlannerEvent; laneIndex: number; laneCount: number; topMinutes: number; heightMinutes: number }` and `layoutTimedEvents(events: PlannerEvent[], dayKey: DayKey): TimedLayout[]`. Minutes are measured from local midnight of `dayKey`; `heightMinutes` is never below 30 so a short event stays tappable.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/planner.test.ts`:

```ts
import { layoutTimedEvents } from './planner'

function timed(id: string, start: string, end: string): PlannerEvent {
  return {
    id,
    title: `Event ${id}`,
    notes: null,
    startsAt: `2026-08-24T${start}:00+07:00`,
    endsAt: `2026-08-24T${end}:00+07:00`,
    allDay: false,
    location: null,
    assignee: 'both',
  }
}

describe('layoutTimedEvents', () => {
  it('places a single event in one full-width lane', () => {
    const [layout] = layoutTimedEvents([timed('a', '09:00', '10:30')], '2026-08-24')
    expect(layout).toMatchObject({ laneIndex: 0, laneCount: 1, topMinutes: 540, heightMinutes: 90 })
  })

  it('gives two overlapping events one lane each', () => {
    const layouts = layoutTimedEvents([timed('a', '09:00', '11:00'), timed('b', '10:00', '12:00')], '2026-08-24')
    expect(layouts.map((l) => l.laneIndex)).toEqual([0, 1])
    expect(layouts.every((l) => l.laneCount === 2)).toBe(true)
  })

  it('reuses lane 0 for events that do not overlap', () => {
    const layouts = layoutTimedEvents([timed('a', '09:00', '10:00'), timed('b', '10:00', '11:00')], '2026-08-24')
    expect(layouts.map((l) => l.laneIndex)).toEqual([0, 0])
    expect(layouts.every((l) => l.laneCount === 1)).toBe(true)
  })

  it('enforces a 30 minute minimum height so a short event stays tappable', () => {
    const [layout] = layoutTimedEvents([timed('a', '09:00', '09:10')], '2026-08-24')
    expect(layout.heightMinutes).toBe(30)
  })

  it('clips an event that starts the previous day to midnight', () => {
    const overnight: PlannerEvent = {
      ...timed('a', '00:00', '02:00'),
      startsAt: '2026-08-23T22:00:00+07:00',
      endsAt: '2026-08-24T02:00:00+07:00',
    }
    const [layout] = layoutTimedEvents([overnight], '2026-08-24')
    expect(layout.topMinutes).toBe(0)
    expect(layout.heightMinutes).toBe(120)
  })

  it('excludes all-day events and events on another day', () => {
    const allDay: PlannerEvent = { ...timed('a', '09:00', '10:00'), allDay: true }
    expect(layoutTimedEvents([allDay], '2026-08-24')).toEqual([])
    expect(layoutTimedEvents([timed('b', '09:00', '10:00')], '2026-08-25')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: FAIL with "layoutTimedEvents is not a function".

- [ ] **Step 3: Write the implementation**

Append to `src/domain/planner.ts`:

```ts
export type TimedLayout = {
  event: PlannerEvent
  laneIndex: number
  laneCount: number
  /** Minutes from local midnight of the rendered day. */
  topMinutes: number
  heightMinutes: number
}

const MINUTES_IN_DAY = 24 * 60
const MIN_HEIGHT_MINUTES = 30

function minutesFromMidnight(instant: Date, dayKey: DayKey): number {
  const midnight = parseISO(`${dayKey}T00:00:00`)
  midnight.setHours(0, 0, 0, 0)
  return Math.round((instant.getTime() - midnight.getTime()) / 60000)
}

/**
 * Greedy lane packing: walk events in start order and drop each into the first
 * lane whose last event has already ended. laneCount is the width of the
 * overlap cluster the event belongs to, so a lone event still renders full
 * width even when the day is busy elsewhere.
 */
export function layoutTimedEvents(events: PlannerEvent[], dayKey: DayKey): TimedLayout[] {
  const onThisDay = events
    .filter((event) => !event.allDay)
    .map((event) => {
      const start = new Date(event.startsAt)
      const end = new Date(event.endsAt)
      const rawTop = minutesFromMidnight(start, dayKey)
      const rawBottom = minutesFromMidnight(end, dayKey)
      return { event, rawTop, rawBottom }
    })
    .filter(({ rawTop, rawBottom }) => rawBottom > 0 && rawTop < MINUTES_IN_DAY)
    .map(({ event, rawTop, rawBottom }) => {
      const top = Math.max(0, rawTop)
      const bottom = Math.min(MINUTES_IN_DAY, rawBottom)
      return { event, top, height: Math.max(MIN_HEIGHT_MINUTES, bottom - top) }
    })
    .sort((a, b) => a.top - b.top || a.height - b.height)

  const laneEnds: number[] = []
  const placed = onThisDay.map((entry) => {
    const end = entry.top + entry.height
    let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= entry.top)
    if (laneIndex === -1) {
      laneIndex = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[laneIndex] = end
    }
    return { ...entry, laneIndex, end }
  })

  // A cluster is a run of events connected by overlap. Everything in one
  // cluster shares a laneCount so their widths line up.
  return placed.map((entry) => {
    const cluster = placed.filter((other) => other.top < entry.end && entry.top < other.end)
    const laneCount = Math.max(...cluster.map((c) => c.laneIndex)) + 1
    return {
      event: entry.event,
      laneIndex: entry.laneIndex,
      laneCount,
      topMinutes: entry.top,
      heightMinutes: entry.height,
    }
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: PASS, 23 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/domain/planner.ts src/domain/planner.test.ts
git commit -m "feat(planner): lay out overlapping timed events into lanes"
```

---

### Task 6: Bucket items by horizon

**Files:**
- Modify: `src/domain/planner.ts`
- Modify: `src/domain/planner.test.ts`

**Interfaces:**
- Consumes: `PlannerItem`, `DayKey`, `addDayKeys`, `toDayKey`.
- Produces: `type HorizonBuckets = { overdue: PlannerItem[]; today: PlannerItem[]; next7: PlannerItem[]; thisMonth: PlannerItem[]; flagged: PlannerItem[]; unscheduled: PlannerItem[]; doneCount: number; totalCount: number }` and `bucketByHorizon(items: PlannerItem[], todayKey: DayKey): HorizonBuckets`. This drives every card on planner home.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/planner.test.ts`:

```ts
import { bucketByHorizon } from './planner'

describe('bucketByHorizon', () => {
  const today = '2026-08-08'

  it('puts a past-due unfinished task in overdue', () => {
    const buckets = bucketByHorizon([task({ dueDate: '2026-08-01' })], today)
    expect(buckets.overdue.map((i) => i.id)).toEqual(['t1'])
  })

  it('never puts a completed task in overdue', () => {
    const done = task({ id: 't2', dueDate: '2026-08-01', status: 'done', completedAt: '2026-08-02T00:00:00Z' })
    expect(bucketByHorizon([done], today).overdue).toEqual([])
  })

  it('uses the block end date, so a block is not overdue until its last day passes', () => {
    const block = task({ dueDate: '2026-08-06', dueEndDate: '2026-08-10' })
    const buckets = bucketByHorizon([block], today)
    expect(buckets.overdue).toEqual([])
    expect(buckets.today.map((i) => i.id)).toEqual(['t1'])
  })

  it('separates today, the next seven days, and the rest of the month', () => {
    const items = [
      task({ id: 'a', dueDate: '2026-08-08' }),
      task({ id: 'b', dueDate: '2026-08-12' }),
      task({ id: 'c', dueDate: '2026-08-28' }),
      task({ id: 'd', dueDate: '2026-09-15' }),
    ]
    const buckets = bucketByHorizon(items, today)
    expect(buckets.today.map((i) => i.id)).toEqual(['a'])
    expect(buckets.next7.map((i) => i.id)).toEqual(['b'])
    expect(buckets.thisMonth.map((i) => i.id)).toEqual(['c'])
  })

  it('collects flagged unfinished tasks regardless of date', () => {
    const items = [
      task({ id: 'a', dueDate: null, isFlagged: true }),
      task({ id: 'b', dueDate: '2026-09-01', isFlagged: true }),
      task({ id: 'c', dueDate: '2026-09-01', isFlagged: true, status: 'done', completedAt: '2026-08-01T00:00:00Z' }),
    ]
    expect(bucketByHorizon(items, today).flagged.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('collects undated unfinished tasks as unscheduled', () => {
    const buckets = bucketByHorizon([task({ dueDate: null })], today)
    expect(buckets.unscheduled.map((i) => i.id)).toEqual(['t1'])
  })

  it('counts progress across every task, dated or not', () => {
    const items = [
      task({ id: 'a', status: 'done', completedAt: '2026-08-01T00:00:00Z' }),
      task({ id: 'b' }),
      task({ id: 'c', dueDate: null }),
    ]
    const buckets = bucketByHorizon(items, today)
    expect(buckets.doneCount).toBe(1)
    expect(buckets.totalCount).toBe(3)
  })

  it('sorts every bucket by date ascending', () => {
    const items = [task({ id: 'late', dueDate: '2026-08-12' }), task({ id: 'early', dueDate: '2026-08-10' })]
    expect(bucketByHorizon(items, today).next7.map((i) => i.id)).toEqual(['early', 'late'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: FAIL with "bucketByHorizon is not a function".

- [ ] **Step 3: Write the implementation**

Append to `src/domain/planner.ts`:

```ts
export type HorizonBuckets = {
  overdue: PlannerItem[]
  today: PlannerItem[]
  next7: PlannerItem[]
  thisMonth: PlannerItem[]
  flagged: PlannerItem[]
  unscheduled: PlannerItem[]
  doneCount: number
  totalCount: number
}

function isDone(item: PlannerItem): boolean {
  return item.kind === 'task' && item.status === 'done'
}

/** The day an item stops being someone's problem. */
function endDayKey(item: PlannerItem): DayKey | null {
  if (item.kind === 'task') return item.dueEndDate ?? item.dueDate
  return toDayKey(new Date(item.endsAt))
}

/** The day an item first appears. Used for ordering, not for overdue. */
function startDayKey(item: PlannerItem): DayKey | null {
  if (item.kind === 'task') return item.dueDate
  return toDayKey(new Date(item.startsAt))
}

export function bucketByHorizon(items: PlannerItem[], todayKey: DayKey): HorizonBuckets {
  const weekEnd = addDayKeys(todayKey, 7)
  const monthPrefix = todayKey.slice(0, 7)

  const buckets: HorizonBuckets = {
    overdue: [],
    today: [],
    next7: [],
    thisMonth: [],
    flagged: [],
    unscheduled: [],
    doneCount: 0,
    totalCount: 0,
  }

  for (const item of items) {
    if (item.kind === 'task') {
      buckets.totalCount += 1
      if (item.status === 'done') buckets.doneCount += 1
      if (item.isFlagged && item.status === 'todo') buckets.flagged.push(item)
    }

    if (isDone(item)) continue

    const start = startDayKey(item)
    const end = endDayKey(item)

    if (!start || !end) {
      buckets.unscheduled.push(item)
      continue
    }

    // A three-day block is overdue only once its last day has passed.
    if (end < todayKey) buckets.overdue.push(item)
    else if (start <= todayKey && todayKey <= end) buckets.today.push(item)
    else if (start <= weekEnd) buckets.next7.push(item)
    else if (start.slice(0, 7) === monthPrefix) buckets.thisMonth.push(item)
  }

  const byStart = (a: PlannerItem, b: PlannerItem) => (startDayKey(a) ?? '').localeCompare(startDayKey(b) ?? '')
  buckets.overdue.sort(byStart)
  buckets.today.sort(byStart)
  buckets.next7.sort(byStart)
  buckets.thisMonth.sort(byStart)
  buckets.flagged.sort(byStart)

  return buckets
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/domain/planner.test.ts`
Expected: PASS, 31 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/domain/planner.ts src/domain/planner.test.ts
git commit -m "feat(planner): bucket planner items by horizon for the status home"
```

---

### Task 7: Repositories

**Files:**
- Create: `src/server/repositories/planner-tasks-repository.ts`
- Create: `src/server/repositories/planner-events-repository.ts`
- Modify: `tests/rls/planner.test.ts` (add a round-trip test through the repositories)

**Interfaces:**
- Consumes: `PlannerTask`, `PlannerSubtask`, `PlannerEvent`, `DayKey`, `Assignee` from `@/domain/planner`.
- Produces:
  - `listTasksInRange(supabase, startKey: DayKey, endKey: DayKey): Promise<PlannerTask[]>`
  - `listAllTasks(supabase): Promise<PlannerTask[]>`
  - `getTask(supabase, id: string): Promise<PlannerTask | null>`
  - `createTask(supabase, input: NewTaskInput): Promise<string>`
  - `updateTask(supabase, id: string, input: Partial<NewTaskInput>): Promise<void>`
  - `setTaskStatus(supabase, id: string, done: boolean): Promise<void>`
  - `deleteTask(supabase, id: string): Promise<void>`
  - `listSubtasks(supabase, taskId: string): Promise<PlannerSubtask[]>`
  - `createSubtask(supabase, taskId: string, title: string): Promise<void>`
  - `setSubtaskDone(supabase, id: string, isDone: boolean): Promise<void>`
  - `deleteSubtask(supabase, id: string): Promise<void>`
  - `listEventsInRange(supabase, startKey: DayKey, endKey: DayKey): Promise<PlannerEvent[]>`
  - `getEvent(supabase, id: string): Promise<PlannerEvent | null>`
  - `createEvent(supabase, input: NewEventInput): Promise<string>`
  - `updateEvent(supabase, id: string, input: Partial<NewEventInput>): Promise<void>`
  - `deleteEvent(supabase, id: string): Promise<void>`
  - `type NewTaskInput = { title: string; notes?: string | null; dueDate?: DayKey | null; dueEndDate?: DayKey | null; assignee?: Assignee; isFlagged?: boolean }`
  - `type NewEventInput = { title: string; notes?: string | null; startsAt: string; endsAt: string; allDay?: boolean; location?: string | null; assignee?: Assignee }`

- [ ] **Step 1: Write the failing round-trip test**

Append to `tests/rls/planner.test.ts`:

```ts
import {
  createTask,
  listTasksInRange,
  setTaskStatus,
  deleteTask,
  createSubtask,
  listSubtasks,
} from '@/server/repositories/planner-tasks-repository'
import { createEvent, listEventsInRange, deleteEvent } from '@/server/repositories/planner-events-repository'

describe('planner repositories', () => {
  it('round-trips a task, its status and its subtasks', async () => {
    const admin = getAdminClient(config)

    const taskId = await createTask(admin, {
      title: 'Book Teazzi & Umaku',
      dueDate: '2026-08-14',
      dueEndDate: '2026-08-16',
      assignee: 'sita',
    })
    createdTaskIds.push(taskId)

    const inRange = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    const found = inRange.find((t) => t.id === taskId)
    expect(found).toMatchObject({
      title: 'Book Teazzi & Umaku',
      dueDate: '2026-08-14',
      dueEndDate: '2026-08-16',
      assignee: 'sita',
      status: 'todo',
      isFlagged: false,
    })

    await createSubtask(admin, taskId, 'Confirm pax')
    const subtasks = await listSubtasks(admin, taskId)
    expect(subtasks.map((s) => s.title)).toEqual(['Confirm pax'])

    await setTaskStatus(admin, taskId, true)
    const afterDone = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    expect(afterDone.find((t) => t.id === taskId)?.status).toBe('done')
    expect(afterDone.find((t) => t.id === taskId)?.completedAt).not.toBeNull()

    await setTaskStatus(admin, taskId, false)
    const afterUndo = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    expect(afterUndo.find((t) => t.id === taskId)?.completedAt).toBeNull()

    await deleteTask(admin, taskId)
    createdTaskIds = createdTaskIds.filter((id) => id !== taskId)
  })

  it('returns a task whose block only partially overlaps the range', async () => {
    const admin = getAdminClient(config)
    const taskId = await createTask(admin, { title: 'Straddles the edge', dueDate: '2026-07-30', dueEndDate: '2026-08-02' })
    createdTaskIds.push(taskId)

    const inRange = await listTasksInRange(admin, '2026-08-01', '2026-08-31')
    expect(inRange.map((t) => t.id)).toContain(taskId)
  })

  it('round-trips an event', async () => {
    const admin = getAdminClient(config)
    const eventId = await createEvent(admin, {
      title: 'Prewedding shoot',
      startsAt: '2026-08-24T01:00:00.000Z',
      endsAt: '2026-08-24T09:00:00.000Z',
      location: 'Bandung',
      assignee: 'both',
    })
    createdEventIds.push(eventId)

    const inRange = await listEventsInRange(admin, '2026-08-01', '2026-08-31')
    expect(inRange.find((e) => e.id === eventId)).toMatchObject({
      title: 'Prewedding shoot',
      location: 'Bandung',
      allDay: false,
    })

    await deleteEvent(admin, eventId)
    createdEventIds = createdEventIds.filter((id) => id !== eventId)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/rls/planner.test.ts`
Expected: FAIL with "Failed to resolve import @/server/repositories/planner-tasks-repository".

- [ ] **Step 3: Write the tasks repository**

Create `src/server/repositories/planner-tasks-repository.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, DayKey, PlannerSubtask, PlannerTask } from '@/domain/planner'

export type NewTaskInput = {
  title: string
  notes?: string | null
  dueDate?: DayKey | null
  dueEndDate?: DayKey | null
  assignee?: Assignee
  isFlagged?: boolean
}

type TaskRow = {
  id: string
  title: string
  notes: string | null
  due_date: string | null
  due_end_date: string | null
  assignee: Assignee
  status: 'todo' | 'done'
  is_flagged: boolean
  completed_at: string | null
}

const TASK_COLUMNS = 'id, title, notes, due_date, due_end_date, assignee, status, is_flagged, completed_at'

function toTask(row: TaskRow): PlannerTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueDate: row.due_date,
    dueEndDate: row.due_end_date,
    assignee: row.assignee,
    status: row.status,
    isFlagged: row.is_flagged,
    completedAt: row.completed_at,
  }
}

function toRow(input: Partial<NewTaskInput>) {
  const row: Record<string, unknown> = {}
  if (input.title !== undefined) row.title = input.title
  if (input.notes !== undefined) row.notes = input.notes
  if (input.dueDate !== undefined) row.due_date = input.dueDate
  if (input.dueEndDate !== undefined) row.due_end_date = input.dueEndDate
  if (input.assignee !== undefined) row.assignee = input.assignee
  if (input.isFlagged !== undefined) row.is_flagged = input.isFlagged
  return row
}

/**
 * Overlap, not containment: a task whose block starts before the range and
 * ends inside it still belongs to the view. `due_end_date` is null for a
 * single-day task, so the second clause covers those.
 */
export async function listTasksInRange(
  supabase: SupabaseClient,
  startKey: DayKey,
  endKey: DayKey
): Promise<PlannerTask[]> {
  const { data, error } = await supabase
    .from('planner_tasks')
    .select(TASK_COLUMNS)
    .lte('due_date', endKey)
    .or(`due_end_date.gte.${startKey},and(due_end_date.is.null,due_date.gte.${startKey})`)
    .order('due_date', { ascending: true })
  if (error) throw new Error(`Failed to list planner tasks for ${startKey}..${endKey}: ${error.message}`)
  return (data as TaskRow[]).map(toTask)
}

export async function listAllTasks(supabase: SupabaseClient): Promise<PlannerTask[]> {
  const { data, error } = await supabase
    .from('planner_tasks')
    .select(TASK_COLUMNS)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`Failed to list planner tasks: ${error.message}`)
  return (data as TaskRow[]).map(toTask)
}

export async function getTask(supabase: SupabaseClient, id: string): Promise<PlannerTask | null> {
  const { data, error } = await supabase.from('planner_tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load planner task ${id}: ${error.message}`)
  return data ? toTask(data as TaskRow) : null
}

export async function createTask(supabase: SupabaseClient, input: NewTaskInput): Promise<string> {
  const { data, error } = await supabase.from('planner_tasks').insert(toRow(input)).select('id').single()
  if (error || !data) throw new Error(`Failed to create planner task: ${error?.message}`)
  return data.id as string
}

export async function updateTask(
  supabase: SupabaseClient,
  id: string,
  input: Partial<NewTaskInput>
): Promise<void> {
  const { error } = await supabase.from('planner_tasks').update(toRow(input)).eq('id', id)
  if (error) throw new Error(`Failed to update planner task ${id}: ${error.message}`)
}

/** completed_at and status move together; a check constraint enforces it. */
export async function setTaskStatus(supabase: SupabaseClient, id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from('planner_tasks')
    .update({ status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`Failed to set status on planner task ${id}: ${error.message}`)
}

export async function deleteTask(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('planner_tasks').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete planner task ${id}: ${error.message}`)
}

export async function listSubtasks(supabase: SupabaseClient, taskId: string): Promise<PlannerSubtask[]> {
  const { data, error } = await supabase
    .from('planner_subtasks')
    .select('id, task_id, title, is_done, position')
    .eq('task_id', taskId)
    .order('position', { ascending: true })
  if (error) throw new Error(`Failed to list subtasks for ${taskId}: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    title: row.title as string,
    isDone: row.is_done as boolean,
    position: row.position as number,
  }))
}

export async function createSubtask(supabase: SupabaseClient, taskId: string, title: string): Promise<void> {
  const existing = await listSubtasks(supabase, taskId)
  const { error } = await supabase
    .from('planner_subtasks')
    .insert({ task_id: taskId, title, position: existing.length })
  if (error) throw new Error(`Failed to create subtask for ${taskId}: ${error.message}`)
}

export async function setSubtaskDone(supabase: SupabaseClient, id: string, isDone: boolean): Promise<void> {
  const { error } = await supabase.from('planner_subtasks').update({ is_done: isDone }).eq('id', id)
  if (error) throw new Error(`Failed to update subtask ${id}: ${error.message}`)
}

export async function deleteSubtask(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('planner_subtasks').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete subtask ${id}: ${error.message}`)
}
```

- [ ] **Step 4: Write the events repository**

Create `src/server/repositories/planner-events-repository.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, DayKey, PlannerEvent } from '@/domain/planner'

export type NewEventInput = {
  title: string
  notes?: string | null
  startsAt: string
  endsAt: string
  allDay?: boolean
  location?: string | null
  assignee?: Assignee
}

type EventRow = {
  id: string
  title: string
  notes: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  location: string | null
  assignee: Assignee
}

const EVENT_COLUMNS = 'id, title, notes, starts_at, ends_at, all_day, location, assignee'

function toEvent(row: EventRow): PlannerEvent {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    location: row.location,
    assignee: row.assignee,
  }
}

function toRow(input: Partial<NewEventInput>) {
  const row: Record<string, unknown> = {}
  if (input.title !== undefined) row.title = input.title
  if (input.notes !== undefined) row.notes = input.notes
  if (input.startsAt !== undefined) row.starts_at = input.startsAt
  if (input.endsAt !== undefined) row.ends_at = input.endsAt
  if (input.allDay !== undefined) row.all_day = input.allDay
  if (input.location !== undefined) row.location = input.location
  if (input.assignee !== undefined) row.assignee = input.assignee
  return row
}

/**
 * The range is inclusive of both ends in Asia/Jakarta (+07:00), which is the
 * only timezone this product has.
 */
export async function listEventsInRange(
  supabase: SupabaseClient,
  startKey: DayKey,
  endKey: DayKey
): Promise<PlannerEvent[]> {
  const { data, error } = await supabase
    .from('planner_events')
    .select(EVENT_COLUMNS)
    .lte('starts_at', `${endKey}T23:59:59+07:00`)
    .gte('ends_at', `${startKey}T00:00:00+07:00`)
    .order('starts_at', { ascending: true })
  if (error) throw new Error(`Failed to list planner events for ${startKey}..${endKey}: ${error.message}`)
  return (data as EventRow[]).map(toEvent)
}

export async function getEvent(supabase: SupabaseClient, id: string): Promise<PlannerEvent | null> {
  const { data, error } = await supabase.from('planner_events').select(EVENT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load planner event ${id}: ${error.message}`)
  return data ? toEvent(data as EventRow) : null
}

export async function createEvent(supabase: SupabaseClient, input: NewEventInput): Promise<string> {
  const { data, error } = await supabase.from('planner_events').insert(toRow(input)).select('id').single()
  if (error || !data) throw new Error(`Failed to create planner event: ${error?.message}`)
  return data.id as string
}

export async function updateEvent(
  supabase: SupabaseClient,
  id: string,
  input: Partial<NewEventInput>
): Promise<void> {
  const { error } = await supabase.from('planner_events').update(toRow(input)).eq('id', id)
  if (error) throw new Error(`Failed to update planner event ${id}: ${error.message}`)
}

export async function deleteEvent(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('planner_events').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete planner event ${id}: ${error.message}`)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- tests/rls/planner.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/planner-tasks-repository.ts src/server/repositories/planner-events-repository.ts tests/rls/planner.test.ts
git commit -m "feat(planner): add task and event repositories"
```

---

### Task 8: Server actions

**Files:**
- Create: `src/server/actions/planner-actions.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` from `./auth-actions`, `getServerSupabase` from `../supabase/server-client`, every repository function from Task 7.
- Produces, all returning `Promise<{ ok: true } | { error: string }>` except where noted:
  - `quickCaptureTask(formData: FormData)` — reads `title`, optional `dueDate`; defaults date to today and assignee to `both`
  - `saveTask(formData: FormData)` — reads `id?`, `title`, `notes`, `dueDate`, `dueEndDate`, `assignee`, `isFlagged`
  - `toggleTaskStatus(id: string, done: boolean)`
  - `toggleTaskFlag(id: string, flagged: boolean)`
  - `removeTask(id: string)`
  - `saveEvent(formData: FormData)` — reads `id?`, `title`, `notes`, `date`, `startTime`, `endTime`, `allDay`, `location`, `assignee`
  - `removeEvent(id: string)`
  - `addSubtask(taskId: string, title: string)`
  - `toggleSubtask(id: string, isDone: boolean)`
  - `removeSubtask(id: string)`

- [ ] **Step 1: Write the actions**

Create `src/server/actions/planner-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { getCurrentProfile } from './auth-actions'
import {
  createTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  createSubtask,
  setSubtaskDone,
  deleteSubtask,
} from '../repositories/planner-tasks-repository'
import { createEvent, updateEvent, deleteEvent } from '../repositories/planner-events-repository'
import { toDayKey, type Assignee } from '@/domain/planner'

type ActionResult = { ok: true } | { error: string }

/**
 * RLS already denies every non-admin. This check exists so a non-admin gets a
 * sentence instead of a silent failure, matching caps-actions.ts.
 */
async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') return null
  return profile
}

function revalidatePlanner() {
  revalidatePath('/planner')
  revalidatePath('/planner/calendar')
  revalidatePath('/planner/tasks')
}

function readAssignee(value: FormDataEntryValue | null): Assignee {
  return value === 'fatan' || value === 'sita' ? value : 'both'
}

function readOptional(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

/** The 1am path: one field, everything else defaulted. */
export async function quickCaptureTask(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give it a title first.' }

  const supabase = await getServerSupabase()
  await createTask(supabase, {
    title,
    dueDate: readOptional(formData.get('dueDate')) ?? toDayKey(new Date()),
    assignee: 'both',
  })

  revalidatePlanner()
  return { ok: true }
}

export async function saveTask(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give it a title first.' }

  const dueDate = readOptional(formData.get('dueDate'))
  const dueEndDate = readOptional(formData.get('dueEndDate'))
  if (dueEndDate && !dueDate) return { error: 'A date range needs a start date.' }
  if (dueDate && dueEndDate && dueEndDate < dueDate) return { error: 'The end date is before the start date.' }

  const input = {
    title,
    notes: readOptional(formData.get('notes')),
    dueDate,
    dueEndDate,
    assignee: readAssignee(formData.get('assignee')),
    isFlagged: formData.get('isFlagged') === 'on',
  }

  const supabase = await getServerSupabase()
  const id = readOptional(formData.get('id'))
  if (id) await updateTask(supabase, id, input)
  else await createTask(supabase, input)

  revalidatePlanner()
  return { ok: true }
}

export async function toggleTaskStatus(id: string, done: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await setTaskStatus(supabase, id, done)
  revalidatePlanner()
  return { ok: true }
}

export async function toggleTaskFlag(id: string, flagged: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await updateTask(supabase, id, { isFlagged: flagged })
  revalidatePlanner()
  return { ok: true }
}

export async function removeTask(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await deleteTask(supabase, id)
  revalidatePlanner()
  return { ok: true }
}

/**
 * The form speaks in a local date plus two clock times; the database speaks in
 * instants. An all-day event covers 00:00:00 to 23:59:59 Asia/Jakarta,
 * inclusive, which is what the renderers assume.
 */
export async function saveEvent(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give it a title first.' }

  const date = readOptional(formData.get('date'))
  if (!date) return { error: 'An event needs a date.' }

  const allDay = formData.get('allDay') === 'on'
  const startTime = readOptional(formData.get('startTime')) ?? '09:00'
  const endTime = readOptional(formData.get('endTime')) ?? '10:00'
  if (!allDay && endTime < startTime) return { error: 'The end time is before the start time.' }

  const startsAt = allDay ? `${date}T00:00:00+07:00` : `${date}T${startTime}:00+07:00`
  const endsAt = allDay ? `${date}T23:59:59+07:00` : `${date}T${endTime}:00+07:00`

  const input = {
    title,
    notes: readOptional(formData.get('notes')),
    startsAt,
    endsAt,
    allDay,
    location: readOptional(formData.get('location')),
    assignee: readAssignee(formData.get('assignee')),
  }

  const supabase = await getServerSupabase()
  const id = readOptional(formData.get('id'))
  if (id) await updateEvent(supabase, id, input)
  else await createEvent(supabase, input)

  revalidatePlanner()
  return { ok: true }
}

export async function removeEvent(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await deleteEvent(supabase, id)
  revalidatePlanner()
  return { ok: true }
}

export async function addSubtask(taskId: string, title: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const trimmed = title.trim()
  if (!trimmed) return { error: 'Give the subtask a title first.' }
  const supabase = await getServerSupabase()
  await createSubtask(supabase, taskId, trimmed)
  revalidatePlanner()
  return { ok: true }
}

export async function toggleSubtask(id: string, isDone: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await setSubtaskDone(supabase, id, isDone)
  revalidatePlanner()
  return { ok: true }
}

export async function removeSubtask(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: 'Only an admin can use the planner.' }
  const supabase = await getServerSupabase()
  await deleteSubtask(supabase, id)
  revalidatePlanner()
  return { ok: true }
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/planner-actions.ts
git commit -m "feat(planner): add planner server actions"
```

---

### Task 9: Route shell, sidebar entry and countdown strip

**Files:**
- Create: `src/components/planner/countdown-strip.tsx`
- Create: `src/app/(dashboard)/planner/page.tsx`
- Create: `src/app/(dashboard)/planner/calendar/page.tsx`
- Create: `src/app/(dashboard)/planner/tasks/page.tsx`
- Modify: `src/app/(dashboard)/app-sidebar.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `daysUntilWedding`, `toDayKey`, `WEDDING_DATE` from `@/domain/planner`; `getCurrentProfile` from `@/server/actions/auth-actions`.
- Produces: `<CountdownStrip todayKey={string} />`, and three routes that render placeholder headings later tasks fill in. Non-admins hitting `/planner*` are redirected to `/dashboard`.

- [ ] **Step 1: Write the countdown strip**

Create `src/components/planner/countdown-strip.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { daysUntilWedding, WEDDING_DATE } from '@/domain/planner'

/**
 * Slim, muted, numeral-sized. The display-size countdown lives on planner
 * home, so this hides there rather than duplicating it (DESIGN.md, the One
 * Display Rule).
 */
export function CountdownStrip({ todayKey }: { todayKey: string }) {
  const pathname = usePathname()
  if (pathname === '/planner') return null

  const days = daysUntilWedding(todayKey)
  const isFinalWeek = days >= 0 && days <= 7
  const label =
    days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} to go` : days === 0 ? 'Today is the day' : 'Married'

  return (
    <Link
      href="/planner"
      className={`flex h-8 items-center justify-center gap-2 border-b px-4 text-xs transition-colors ${
        isFinalWeek ? 'bg-warning/10 text-warning' : 'bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className="font-mono tabular-nums">{label}</span>
      <span aria-hidden>·</span>
      <span>10 October 2026</span>
      <span className="sr-only">Open the planner</span>
      <span className="sr-only">{WEDDING_DATE}</span>
    </Link>
  )
}
```

- [ ] **Step 2: Mount the strip in the dashboard layout**

In `src/app/(dashboard)/layout.tsx`, add these imports next to the existing ones:

```tsx
import { CountdownStrip } from '@/components/planner/countdown-strip'
import { toDayKey } from '@/domain/planner'
```

Then replace the returned `<SidebarInset>` block with:

```tsx
      <SidebarInset>
        {profile.role === 'admin' ? <CountdownStrip todayKey={toDayKey(new Date())} /> : null}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium text-muted-foreground">Guest Management</span>
        </header>
        <div className="flex-1 bg-background">{children}</div>
      </SidebarInset>
```

- [ ] **Step 3: Add the sidebar entry**

In `src/app/(dashboard)/app-sidebar.tsx`, add `CalendarDays` to the existing `lucide-react` import, and insert this entry into `items` immediately after the Dashboard entry:

```tsx
    { href: '/planner', label: 'Planner', icon: CalendarDays, show: profile.role === 'admin' },
```

Then change the `isActive` prop on `SidebarMenuButton` so a nested planner route still highlights the entry:

```tsx
                      isActive={item.href === '/planner' ? pathname.startsWith('/planner') : pathname === item.href}
```

- [ ] **Step 4: Create the three route stubs**

Create `src/app/(dashboard)/planner/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'

export default async function PlannerHomePage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-xl font-medium">Planner</h1>
    </div>
  )
}
```

Create `src/app/(dashboard)/planner/calendar/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'

export default async function PlannerCalendarPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <h1 className="text-xl font-medium">Calendar</h1>
    </div>
  )
}
```

Create `src/app/(dashboard)/planner/tasks/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'

export default async function PlannerTasksPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-xl font-medium">All tasks</h1>
    </div>
  )
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run lint && npm run build`
Expected: build succeeds, all three routes listed in the output.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`
Sign in as an admin. Confirm: the Planner entry appears in the sidebar, the countdown strip shows on `/dashboard` and is hidden on `/planner`, and `/planner` renders its heading. Sign in as an inviter and confirm the Planner entry is absent and visiting `/planner` redirects to `/dashboard`.

- [ ] **Step 7: Commit**

```bash
git add src/components/planner/countdown-strip.tsx "src/app/(dashboard)/planner" "src/app/(dashboard)/app-sidebar.tsx" "src/app/(dashboard)/layout.tsx"
git commit -m "feat(planner): add planner routes, sidebar entry and countdown strip"
```

---

### Task 10: Item chip

**Files:**
- Create: `src/components/planner/item-chip.tsx`

**Interfaces:**
- Consumes: `PlannerItem`, `DayKey` from `@/domain/planner`; `toggleTaskStatus` from `@/server/actions/planner-actions`.
- Produces: `<ItemChip item={PlannerItem} todayKey={DayKey} onOpen={(item: PlannerItem) => void} compact?: boolean />`. Used by every calendar view and every home card.

- [ ] **Step 1: Write the component**

Create `src/components/planner/item-chip.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { Check, Clock, Pin } from 'lucide-react'
import { toggleTaskStatus } from '@/server/actions/planner-actions'
import type { DayKey, PlannerItem } from '@/domain/planner'

function timeLabel(item: PlannerItem): string | null {
  if (item.kind !== 'event' || item.allDay) return null
  const start = new Date(item.startsAt)
  return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
}

function isOverdue(item: PlannerItem, todayKey: DayKey): boolean {
  if (item.kind !== 'task' || item.status === 'done') return false
  const end = item.dueEndDate ?? item.dueDate
  return !!end && end < todayKey
}

/**
 * State is never carried by colour alone (DESIGN.md): overdue is red plus the
 * word, done is muted plus a strikethrough, flagged is amber plus a pin.
 */
export function ItemChip({
  item,
  todayKey,
  onOpen,
  compact = false,
}: {
  item: PlannerItem
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
  compact?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const done = item.kind === 'task' && item.status === 'done'
  const overdue = isOverdue(item, todayKey)
  const flagged = item.kind === 'task' && item.isFlagged && !done
  const time = timeLabel(item)

  const tone = done
    ? 'text-muted-foreground'
    : overdue
      ? 'bg-destructive/10 text-destructive'
      : flagged
        ? 'bg-warning/10 text-warning'
        : 'bg-secondary text-secondary-foreground'

  return (
    <div
      className={`flex w-full items-center gap-1.5 rounded-lg px-2 ${compact ? 'h-6 text-xs' : 'h-11 text-sm'} ${tone}`}
    >
      {item.kind === 'task' ? (
        <button
          type="button"
          aria-label={done ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
          disabled={isPending}
          onClick={() => startTransition(() => void toggleTaskStatus(item.id, !done))}
          className={`flex ${compact ? 'size-4' : 'size-6'} shrink-0 items-center justify-center rounded-md border border-current/40 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px`}
        >
          {done ? <Check className="size-3" /> : null}
        </button>
      ) : (
        <Clock className="size-3 shrink-0" aria-hidden />
      )}

      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {time ? <span className="shrink-0 font-mono tabular-nums opacity-70">{time}</span> : null}
        <span className={`truncate ${done ? 'line-through' : ''}`}>{item.title}</span>
        {flagged ? <Pin className="size-3 shrink-0" aria-label="Blocked" /> : null}
        {overdue && !compact ? <span className="ml-auto shrink-0 text-xs">Overdue</span> : null}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/planner/item-chip.tsx
git commit -m "feat(planner): add the task and event chip"
```

---

### Task 11: Calendar navigation and month view

**Files:**
- Create: `src/components/planner/calendar-nav.tsx`
- Create: `src/components/planner/month-view.tsx`
- Modify: `src/app/(dashboard)/planner/calendar/page.tsx`

**Interfaces:**
- Consumes: `buildMonthGrid`, `expandMultiDaySpans`, `addDayKeys`, `toDayKey`, `PlannerItem`, `DayKey`; `ItemChip` from Task 10; `listTasksInRange` and `listEventsInRange` from Task 7.
- Produces: `<CalendarNav view={'month'|'week'|'day'} dateKey={DayKey} />`, `<MonthView monthKey={string} segments={DaySegment[]} todayKey={DayKey} onOpen={(item) => void} />`, and a calendar page that reads `?view=` and `?date=` from `searchParams`.

- [ ] **Step 1: Write the navigation**

Create `src/components/planner/calendar-nav.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDayKeys, toDayKey, type DayKey } from '@/domain/planner'

export type CalendarView = 'month' | 'week' | 'day'

function shift(view: CalendarView, dateKey: DayKey, direction: 1 | -1): DayKey {
  if (view === 'day') return addDayKeys(dateKey, direction * 1)
  if (view === 'week') return addDayKeys(dateKey, direction * 7)
  const [year, month] = dateKey.split('-').map(Number)
  const shifted = new Date(year, month - 1 + direction, 1)
  return toDayKey(shifted)
}

function title(view: CalendarView, dateKey: DayKey): string {
  const date = new Date(`${dateKey}T00:00:00`)
  if (view === 'month') return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (view === 'day') return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return `Week of ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
}

function href(view: CalendarView, dateKey: DayKey) {
  return `/planner/calendar?view=${view}&date=${dateKey}`
}

export function CalendarNav({ view, dateKey }: { view: CalendarView; dateKey: DayKey }) {
  const todayKey = toDayKey(new Date())

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 py-2 backdrop-blur">
      <Link
        href={href(view, shift(view, dateKey, -1))}
        aria-label="Previous"
        className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <Link
        href={href(view, todayKey)}
        className="flex h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        Today
      </Link>
      <Link
        href={href(view, shift(view, dateKey, 1))}
        aria-label="Next"
        className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        <ChevronRight className="size-4" />
      </Link>

      <span className="ml-1 min-w-0 flex-1 truncate text-sm font-medium">{title(view, dateKey)}</span>

      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {(['day', 'week', 'month'] as const).map((option) => (
          <Link
            key={option}
            href={href(option, dateKey)}
            aria-current={option === view ? 'page' : undefined}
            className={`flex h-9 items-center rounded-md px-3 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
              option === view ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option}
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the month view**

Create `src/components/planner/month-view.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { buildMonthGrid, type DayKey, type DaySegment, type PlannerItem } from '@/domain/planner'
import { ItemChip } from './item-chip'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Phone shows 2 chips then a count; desktop shows 3. Tapping a day navigates
 * to the day view rather than opening a popover, which is unusable on a phone.
 */
export function MonthView({
  monthKey,
  segments,
  todayKey,
  onOpen,
}: {
  monthKey: string
  segments: DaySegment[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
}) {
  const grid = buildMonthGrid(monthKey)

  const byDay = new Map<DayKey, PlannerItem[]>()
  for (const segment of segments) {
    const existing = byDay.get(segment.dayKey) ?? []
    existing.push(segment.item)
    byDay.set(segment.dayKey, existing)
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="grid grid-cols-7 border-b bg-card">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
            <span className="md:hidden">{day.slice(0, 1)}</span>
            <span className="hidden md:inline">{day}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.flat().map((dayKey) => {
          const items = byDay.get(dayKey) ?? []
          const inMonth = dayKey.startsWith(monthKey)
          const isToday = dayKey === todayKey
          const limit = 3

          return (
            <div
              key={dayKey}
              className={`min-h-24 border-r border-b p-1 last:border-r-0 md:min-h-32 ${
                inMonth ? 'bg-card' : 'bg-muted/40'
              }`}
            >
              <Link
                href={`/planner/calendar?view=day&date=${dayKey}`}
                className={`mb-1 flex size-7 items-center justify-center rounded-md font-mono text-xs tabular-nums focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {Number(dayKey.slice(-2))}
              </Link>

              <div className="flex flex-col gap-0.5">
                {items.slice(0, 2).map((item) => (
                  <ItemChip key={`${dayKey}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} compact />
                ))}
                <div className="hidden md:contents">
                  {items.slice(2, limit).map((item) => (
                    <ItemChip key={`${dayKey}-${item.id}-md`} item={item} todayKey={todayKey} onOpen={onOpen} compact />
                  ))}
                </div>
                {items.length > 2 ? (
                  <Link
                    href={`/planner/calendar?view=day&date=${dayKey}`}
                    className="px-2 text-xs text-muted-foreground hover:text-foreground md:hidden"
                  >
                    +{items.length - 2} more
                  </Link>
                ) : null}
                {items.length > limit ? (
                  <Link
                    href={`/planner/calendar?view=day&date=${dayKey}`}
                    className="hidden px-2 text-xs text-muted-foreground hover:text-foreground md:block"
                  >
                    +{items.length - limit} more
                  </Link>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the calendar page to real data**

Replace `src/app/(dashboard)/planner/calendar/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listTasksInRange } from '@/server/repositories/planner-tasks-repository'
import { listEventsInRange } from '@/server/repositories/planner-events-repository'
import { addDayKeys, buildMonthGrid, expandMultiDaySpans, toDayKey, type PlannerItem } from '@/domain/planner'
import { CalendarNav, type CalendarView } from '@/components/planner/calendar-nav'
import { CalendarSurface } from './calendar-surface'

function readView(value: string | undefined): CalendarView {
  return value === 'week' || value === 'day' || value === 'month' ? value : 'month'
}

export default async function PlannerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const todayKey = toDayKey(new Date())
  const view = readView(params.view)
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayKey
  const monthKey = dateKey.slice(0, 7)

  // The month grid always shows six rows, so fetch its real first and last day
  // rather than the calendar month, or trailing days render empty.
  const grid = buildMonthGrid(monthKey)
  const rangeStart = view === 'month' ? grid[0][0] : addDayKeys(dateKey, -7)
  const rangeEnd = view === 'month' ? grid[5][6] : addDayKeys(dateKey, 7)

  const supabase = await getServerSupabase()
  const [tasks, events] = await Promise.all([
    listTasksInRange(supabase, rangeStart, rangeEnd),
    listEventsInRange(supabase, rangeStart, rangeEnd),
  ])

  const items: PlannerItem[] = [
    ...tasks.map((task) => ({ kind: 'task' as const, ...task })),
    ...events.map((event) => ({ kind: 'event' as const, ...event })),
  ]
  const segments = expandMultiDaySpans(items, rangeStart, rangeEnd)

  return (
    <div className="flex w-full flex-col gap-2 p-4">
      <CalendarNav view={view} dateKey={dateKey} />
      <CalendarSurface view={view} dateKey={dateKey} monthKey={monthKey} segments={segments} todayKey={todayKey} />
    </div>
  )
}
```

- [ ] **Step 4: Write the client surface that owns the open-item state**

Create `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { MonthView } from '@/components/planner/month-view'
import type { CalendarView } from '@/components/planner/calendar-nav'
import type { DayKey, DaySegment, PlannerItem } from '@/domain/planner'

export function CalendarSurface({
  view,
  dateKey,
  monthKey,
  segments,
  todayKey,
}: {
  view: CalendarView
  dateKey: DayKey
  monthKey: string
  segments: DaySegment[]
  todayKey: DayKey
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)

  return (
    <>
      {view === 'month' ? (
        <MonthView monthKey={monthKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : (
        <p className="text-sm text-muted-foreground">
          The {view} view arrives in the next task. Showing {segments.length} items around {dateKey}.
        </p>
      )}
      {openItem ? (
        <p className="text-sm text-muted-foreground">Selected: {openItem.title}</p>
      ) : null}
    </>
  )
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`. Visit `/planner/calendar`. Confirm six rows always render, today's number sits in a blue square, Today and the arrows change the URL, and the view switcher marks the current view. Insert a task with `due_date` `2026-08-14` and `due_end_date` `2026-08-16` through Supabase Studio and confirm it appears on all three days.

- [ ] **Step 7: Commit**

```bash
git add src/components/planner/calendar-nav.tsx src/components/planner/month-view.tsx "src/app/(dashboard)/planner/calendar"
git commit -m "feat(planner): add calendar navigation and month view"
```

---

### Task 12: Day view

**Files:**
- Create: `src/components/planner/day-view.tsx`
- Modify: `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`

**Interfaces:**
- Consumes: `layoutTimedEvents`, `DaySegment`, `DayKey`, `PlannerItem`; `ItemChip`.
- Produces: `<DayView dayKey={DayKey} segments={DaySegment[]} todayKey={DayKey} onOpen={(item) => void} />`.

- [ ] **Step 1: Write the day view**

Create `src/components/planner/day-view.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { layoutTimedEvents, type DayKey, type DaySegment, type PlannerEvent, type PlannerItem } from '@/domain/planner'
import { ItemChip } from './item-chip'

const HOUR_HEIGHT = 56
const SCROLL_TO_HOUR = 7

export function DayView({
  dayKey,
  segments,
  todayKey,
  onOpen,
}: {
  dayKey: DayKey
  segments: DaySegment[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT
  }, [dayKey])

  const onThisDay = segments.filter((segment) => segment.dayKey === dayKey)
  const allDayItems = onThisDay.filter((segment) => segment.isAllDay).map((segment) => segment.item)
  const timedEvents = onThisDay
    .filter((segment) => !segment.isAllDay && segment.item.kind === 'event')
    .map((segment) => segment.item as PlannerItem & PlannerEvent)
  const layouts = layoutTimedEvents(timedEvents, dayKey)

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
  const showNowLine = dayKey === todayKey

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1 border-b bg-card p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">All day</span>
        {allDayItems.length === 0 ? (
          <span className="px-1 pb-1 text-xs text-muted-foreground">Nothing due.</span>
        ) : (
          allDayItems.map((item) => (
            <ItemChip key={`allday-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} />
          ))
        )}
      </div>

      <div ref={scrollRef} className="relative max-h-[70vh] overflow-y-auto bg-card">
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute right-0 left-0 border-t border-border/60"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              <span className="absolute -top-2 left-2 bg-card pr-1 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
          ))}

          {showNowLine ? (
            <div
              className="absolute right-0 left-14 z-10 border-t-2 border-destructive"
              style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
              aria-label="Current time"
            />
          ) : null}

          {layouts.map((layout) => (
            <div
              key={layout.event.id}
              className="absolute px-1"
              style={{
                top: (layout.topMinutes / 60) * HOUR_HEIGHT,
                height: (layout.heightMinutes / 60) * HOUR_HEIGHT,
                left: `calc(3.5rem + ${(layout.laneIndex / layout.laneCount) * 100}%)`,
                width: `calc(${(1 / layout.laneCount) * 100}% - 3.5rem / ${layout.laneCount})`,
              }}
            >
              <ItemChip
                item={{ kind: 'event', ...layout.event }}
                todayKey={todayKey}
                onOpen={onOpen}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Render it from the surface**

In `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`, add the import:

```tsx
import { DayView } from '@/components/planner/day-view'
```

and replace the `view === 'month' ? ... : ...` block with:

```tsx
      {view === 'month' ? (
        <MonthView monthKey={monthKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : view === 'day' ? (
        <DayView dayKey={dateKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : (
        <p className="text-sm text-muted-foreground">
          The week view arrives in the next task. Showing {segments.length} items around {dateKey}.
        </p>
      )}
```

- [ ] **Step 3: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Visit `/planner/calendar?view=day&date=2026-08-24`. Confirm the grid opens scrolled to 07:00, an all-day task appears in the top strip, a timed event lands at the right hour, two overlapping events sit side by side, and the red now-line appears only when viewing today.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/day-view.tsx "src/app/(dashboard)/planner/calendar/calendar-surface.tsx"
git commit -m "feat(planner): add day view with all-day strip and hour grid"
```

---

### Task 13: Week view

**Files:**
- Create: `src/components/planner/week-view.tsx`
- Modify: `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`

**Interfaces:**
- Consumes: `addDayKeys`, `layoutTimedEvents`, `DaySegment`, `DayKey`, `PlannerItem`; `ItemChip`; `useIsMobile` from `@/hooks/use-mobile`.
- Produces: `<WeekView anchorKey={DayKey} segments={DaySegment[]} todayKey={DayKey} onOpen={(item) => void} />`. Below `md` it renders an agenda list; from `md` up it renders the hour grid. All seven day headers always render, including empty ones.

- [ ] **Step 1: Write the week view**

Create `src/components/planner/week-view.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { addDayKeys, layoutTimedEvents, type DayKey, type DaySegment, type PlannerEvent, type PlannerItem } from '@/domain/planner'
import { ItemChip } from './item-chip'

const HOUR_HEIGHT = 48

function weekDays(anchorKey: DayKey): DayKey[] {
  const anchor = new Date(`${anchorKey}T00:00:00`)
  const start = addDayKeys(anchorKey, -anchor.getDay())
  return Array.from({ length: 7 }, (_, offset) => addDayKeys(start, offset))
}

function dayLabel(dayKey: DayKey): string {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Two renderings, one component. Below md the hour grid is dropped entirely
 * rather than scrolled sideways (DESIGN.md, the No-Sideways Rule); every day
 * header still renders so swiping keeps its bearings.
 */
export function WeekView({
  anchorKey,
  segments,
  todayKey,
  onOpen,
}: {
  anchorKey: DayKey
  segments: DaySegment[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
}) {
  const days = weekDays(anchorKey)

  const itemsFor = (dayKey: DayKey) => segments.filter((s) => s.dayKey === dayKey).map((s) => s.item)
  const allDayFor = (dayKey: DayKey) =>
    segments.filter((s) => s.dayKey === dayKey && s.isAllDay).map((s) => s.item)
  const timedFor = (dayKey: DayKey) =>
    segments
      .filter((s) => s.dayKey === dayKey && !s.isAllDay && s.item.kind === 'event')
      .map((s) => s.item as PlannerItem & PlannerEvent)

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {days.map((dayKey) => {
          const items = itemsFor(dayKey)
          return (
            <section key={dayKey} className="flex flex-col gap-1">
              <Link
                href={`/planner/calendar?view=day&date=${dayKey}`}
                className={`flex h-8 items-center rounded-lg px-2 text-xs font-medium ${
                  dayKey === todayKey ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {dayLabel(dayKey)}
              </Link>
              {items.length === 0 ? (
                <p className="px-2 text-xs text-muted-foreground">Nothing.</p>
              ) : (
                items.map((item) => (
                  <ItemChip key={`${dayKey}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} />
                ))
              )}
            </section>
          )
        })}
      </div>

      <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 md:block">
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b bg-card">
          <div />
          {days.map((dayKey) => (
            <Link
              key={dayKey}
              href={`/planner/calendar?view=day&date=${dayKey}`}
              className={`px-2 py-1.5 text-center text-xs font-medium ${
                dayKey === todayKey ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {dayLabel(dayKey)}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b bg-card">
          <span className="px-2 py-1 text-[0.65rem] text-muted-foreground">All day</span>
          {days.map((dayKey) => (
            <div key={dayKey} className="flex flex-col gap-0.5 border-l p-1">
              {allDayFor(dayKey).map((item) => (
                <ItemChip key={`ad-${dayKey}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} compact />
              ))}
            </div>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto bg-card">
          <div className="relative grid grid-cols-[3.5rem_repeat(7,1fr)]" style={{ height: 24 * HOUR_HEIGHT }}>
            <div className="relative border-r">
              {Array.from({ length: 24 }, (_, hour) => (
                <span
                  key={hour}
                  className="absolute right-1 font-mono text-[0.65rem] tabular-nums text-muted-foreground"
                  style={{ top: hour * HOUR_HEIGHT - 6 }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {days.map((dayKey) => (
              <div key={dayKey} className="relative border-l">
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="absolute right-0 left-0 border-t border-border/60"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}
                {layoutTimedEvents(timedFor(dayKey), dayKey).map((layout) => (
                  <div
                    key={layout.event.id}
                    className="absolute px-0.5"
                    style={{
                      top: (layout.topMinutes / 60) * HOUR_HEIGHT,
                      height: (layout.heightMinutes / 60) * HOUR_HEIGHT,
                      left: `${(layout.laneIndex / layout.laneCount) * 100}%`,
                      width: `${(1 / layout.laneCount) * 100}%`,
                    }}
                  >
                    <ItemChip
                      item={{ kind: 'event', ...layout.event }}
                      todayKey={todayKey}
                      onOpen={onOpen}
                      compact
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Render it from the surface**

In `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`, add the import:

```tsx
import { WeekView } from '@/components/planner/week-view'
```

and replace the placeholder branch so the chain reads:

```tsx
      {view === 'month' ? (
        <MonthView monthKey={monthKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : view === 'day' ? (
        <DayView dayKey={dateKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      ) : (
        <WeekView anchorKey={dateKey} segments={segments} todayKey={todayKey} onOpen={setOpenItem} />
      )}
```

- [ ] **Step 3: Default the view by device**

In `src/app/(dashboard)/planner/page.tsx` no change is needed, but the calendar's default must follow the device. In `src/components/planner/calendar-nav.tsx`, no change either. Instead, in `src/app/(dashboard)/planner/calendar/page.tsx`, change `readView` so an absent `view` param stays `month` on the server, and add this to `calendar-surface.tsx` so a phone lands on day when the URL did not ask for a view:

```tsx
import { useIsMobile } from '@/hooks/use-mobile'
```

and inside `CalendarSurface`, above the return:

```tsx
  const isMobile = useIsMobile()
  // The server cannot know the viewport, so an unspecified view resolves here.
  const resolvedView: CalendarView = viewWasExplicit ? view : isMobile ? 'day' : 'month'
```

Pass `viewWasExplicit` from the page by adding it to the props: in `page.tsx` compute `const viewWasExplicit = params.view === 'month' || params.view === 'week' || params.view === 'day'` and pass `viewWasExplicit={viewWasExplicit}`. Add `viewWasExplicit: boolean` to the component's prop type and use `resolvedView` in place of `view` in the render chain and when passing to `CalendarNav`.

- [ ] **Step 4: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Visit `/planner/calendar?view=week&date=2026-08-24`. At desktop width confirm the seven-column hour grid with an all-day lane. Narrow the window below 768px and confirm it becomes a grouped agenda list with all seven day headers, empty ones reading "Nothing", and no horizontal scrollbar anywhere.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/week-view.tsx "src/app/(dashboard)/planner/calendar"
git commit -m "feat(planner): add week view with a phone agenda fallback"
```

---

### Task 14: Capture sheet and edit dialog

**Files:**
- Create: `src/components/planner/item-sheet.tsx`
- Create: `src/components/planner/capture-fab.tsx`
- Modify: `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`

**Interfaces:**
- Consumes: `quickCaptureTask`, `saveTask`, `saveEvent`, `removeTask`, `removeEvent` from Task 8; `Sheet` and `Dialog` primitives from `src/components/ui/`; `useIsMobile`.
- Produces: `<CaptureFab defaultDateKey={DayKey} />` and `<ItemSheet item={PlannerItem | null} open={boolean} onOpenChange={(open: boolean) => void} defaultDateKey={DayKey} />`.

- [ ] **Step 1: Write the capture FAB**

Create `src/components/planner/capture-fab.tsx`:

```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { quickCaptureTask } from '@/server/actions/planner-actions'
import type { DayKey } from '@/domain/planner'

/**
 * The interaction the planner lives or dies on: one field, keyboard already
 * up, save and it exists. Date defaults to today, assignee to both. Everything
 * else is an edit performed later, or never.
 */
export function CaptureFab({ defaultDateKey }: { defaultDateKey: DayKey }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await quickCaptureTask(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setError(null)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Add a task"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-transform focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
      >
        <Plus className="size-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}>
          <SheetHeader>
            <SheetTitle>Quick add</SheetTitle>
          </SheetHeader>
          <form action={onSubmit} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="dueDate" value={defaultDateKey} />
            <Input
              ref={inputRef}
              name="title"
              placeholder="What needs doing?"
              autoComplete="off"
              className="h-11 text-base md:text-sm"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={isPending} className="h-11">
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 2: Write the full item sheet**

Create `src/components/planner/item-sheet.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { saveTask, saveEvent, removeTask, removeEvent } from '@/server/actions/planner-actions'
import type { DayKey, PlannerItem } from '@/domain/planner'

type Kind = 'task' | 'event'

function timeOf(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function dayOf(iso: string): DayKey {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function ItemSheet({
  item,
  open,
  onOpenChange,
  defaultDateKey,
}: {
  item: PlannerItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDateKey: DayKey
}) {
  const [kind, setKind] = useState<Kind>(item?.kind ?? 'task')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeKind: Kind = item ? item.kind : kind

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = activeKind === 'task' ? await saveTask(formData) : await saveEvent(formData)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setError(null)
      onOpenChange(false)
    })
  }

  function onDelete() {
    if (!item) return
    startTransition(async () => {
      const result = item.kind === 'task' ? await removeTask(item.id) : await removeEvent(item.id)
      if ('error' in result) {
        setError(result.error)
        return
      }
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="md:max-w-lg">
        <SheetHeader>
          <SheetTitle>{item ? 'Edit' : 'New'}</SheetTitle>
        </SheetHeader>

        {!item ? (
          <div className="flex gap-1 rounded-lg bg-muted p-1 mx-4">
            {(['task', 'event'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`h-9 flex-1 rounded-md text-sm capitalize transition-colors ${
                  option === activeKind ? 'bg-card text-foreground' : 'text-muted-foreground'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}

        <form action={onSubmit} className="flex flex-col gap-3 p-4">
          {item ? <input type="hidden" name="id" value={item.id} /> : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="planner-title">Title</Label>
            <Input
              id="planner-title"
              name="title"
              defaultValue={item?.title ?? ''}
              className="h-11 text-base md:text-sm"
            />
          </div>

          {activeKind === 'task' ? (
            <>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="planner-due">Due</Label>
                  <Input
                    id="planner-due"
                    name="dueDate"
                    type="date"
                    defaultValue={item?.kind === 'task' ? (item.dueDate ?? '') : defaultDateKey}
                    className="h-11 text-base md:text-sm"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="planner-due-end">Until (optional)</Label>
                  <Input
                    id="planner-due-end"
                    name="dueEndDate"
                    type="date"
                    defaultValue={item?.kind === 'task' ? (item.dueEndDate ?? '') : ''}
                    className="h-11 text-base md:text-sm"
                  />
                </div>
              </div>

              <label className="flex h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isFlagged"
                  defaultChecked={item?.kind === 'task' ? item.isFlagged : false}
                  className="size-5"
                />
                Blocked on someone else
              </label>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="planner-date">Date</Label>
                <Input
                  id="planner-date"
                  name="date"
                  type="date"
                  defaultValue={item?.kind === 'event' ? dayOf(item.startsAt) : defaultDateKey}
                  className="h-11 text-base md:text-sm"
                />
              </div>

              <label className="flex h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="allDay"
                  defaultChecked={item?.kind === 'event' ? item.allDay : false}
                  className="size-5"
                />
                All day
              </label>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="planner-start">Start</Label>
                  <Input
                    id="planner-start"
                    name="startTime"
                    type="time"
                    defaultValue={item?.kind === 'event' ? timeOf(item.startsAt) : '09:00'}
                    className="h-11 text-base md:text-sm"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="planner-end">End</Label>
                  <Input
                    id="planner-end"
                    name="endTime"
                    type="time"
                    defaultValue={item?.kind === 'event' ? timeOf(item.endsAt) : '10:00'}
                    className="h-11 text-base md:text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="planner-location">Location</Label>
                <Input
                  id="planner-location"
                  name="location"
                  defaultValue={item?.kind === 'event' ? (item.location ?? '') : ''}
                  className="h-11 text-base md:text-sm"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="planner-assignee">Who</Label>
            <select
              id="planner-assignee"
              name="assignee"
              defaultValue={item?.assignee ?? 'both'}
              className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm"
            >
              <option value="both">Both</option>
              <option value="fatan">Fatan</option>
              <option value="sita">Sita</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="planner-notes">Notes</Label>
            <textarea
              id="planner-notes"
              name="notes"
              rows={3}
              defaultValue={item?.notes ?? ''}
              className="rounded-lg border border-input bg-transparent p-2.5 text-base md:text-sm"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} className="h-11 flex-1">
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            {item ? (
              <Button type="button" variant="destructive" disabled={isPending} onClick={onDelete} className="h-11">
                Delete
              </Button>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 3: Wire both into the calendar surface**

In `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`, add:

```tsx
import { CaptureFab } from '@/components/planner/capture-fab'
import { ItemSheet } from '@/components/planner/item-sheet'
```

Replace the `{openItem ? <p>…</p> : null}` line with:

```tsx
      <ItemSheet
        item={openItem}
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null)
        }}
        defaultDateKey={dateKey}
      />
      <CaptureFab defaultDateKey={dateKey} />
```

- [ ] **Step 4: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

On a phone-sized viewport: tap the FAB, confirm the sheet opens with the cursor already in the title field, type a title, save, and confirm the task appears on today. Tap an existing chip's body and confirm the edit sheet opens prefilled. Switch the new-item toggle to Event, save one with a start and end time, and confirm it lands in the day grid at the right hour. Delete it and confirm it disappears.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/item-sheet.tsx src/components/planner/capture-fab.tsx "src/app/(dashboard)/planner/calendar/calendar-surface.tsx"
git commit -m "feat(planner): add one-field capture and the full item sheet"
```

---

### Task 15: Planner home cards

**Files:**
- Create: `src/app/(dashboard)/planner/planner-home-cards.tsx`
- Modify: `src/app/(dashboard)/planner/page.tsx`

**Interfaces:**
- Consumes: `bucketByHorizon`, `daysUntilWedding`, `toDayKey`, `HorizonBuckets`, `PlannerItem`; `listAllTasks` and `listEventsInRange`; `ItemChip`, `ItemSheet`, `CaptureFab`.
- Produces: `<PlannerHomeCards buckets={HorizonBuckets} todayKey={DayKey} daysLeft={number} />`.

- [ ] **Step 1: Write the cards**

Create `src/app/(dashboard)/planner/planner-home-cards.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ItemChip } from '@/components/planner/item-chip'
import { ItemSheet } from '@/components/planner/item-sheet'
import { CaptureFab } from '@/components/planner/capture-fab'
import type { DayKey, HorizonBuckets, PlannerItem } from '@/domain/planner'

function Section({
  title,
  items,
  todayKey,
  onOpen,
  tone,
}: {
  title: string
  items: PlannerItem[]
  todayKey: DayKey
  onOpen: (item: PlannerItem) => void
  tone?: 'alarm' | 'caution'
}) {
  // Cards with nothing to say render nothing at all, so a calm week is a
  // short screen rather than a wall of empty states.
  if (items.length === 0) return null

  return (
    <Card className={tone === 'alarm' ? 'ring-destructive/30' : tone === 'caution' ? 'ring-warning/30' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={tone === 'alarm' ? 'text-destructive' : tone === 'caution' ? 'text-warning' : undefined}>
            {title}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {items.map((item) => (
          <ItemChip key={`${title}-${item.id}`} item={item} todayKey={todayKey} onOpen={onOpen} />
        ))}
      </CardContent>
    </Card>
  )
}

export function PlannerHomeCards({
  buckets,
  todayKey,
  daysLeft,
}: {
  buckets: HorizonBuckets
  todayKey: DayKey
  daysLeft: number
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)
  const donePct = buckets.totalCount > 0 ? Math.round((buckets.doneCount / buckets.totalCount) * 100) : 0
  const nothingAtAll = buckets.totalCount === 0

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="font-mono text-[clamp(3rem,14vw,5rem)] leading-none font-medium tracking-tight tabular-nums">
            {daysLeft > 0 ? daysLeft : 0}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {daysLeft > 0 ? 'days until 10 October 2026' : daysLeft === 0 ? 'Today is the day' : 'Married since 10 October 2026'}
          </span>
        </CardContent>
      </Card>

      {nothingAtAll ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Nothing here yet. Add the first thing you need to remember.</p>
          </CardContent>
        </Card>
      ) : null}

      <Section title="Overdue" items={buckets.overdue} todayKey={todayKey} onOpen={setOpenItem} tone="alarm" />
      <Section title="Today" items={buckets.today} todayKey={todayKey} onOpen={setOpenItem} />
      <Section title="Next 7 days" items={buckets.next7} todayKey={todayKey} onOpen={setOpenItem} />
      <Section title="Blocked" items={buckets.flagged} todayKey={todayKey} onOpen={setOpenItem} tone="caution" />
      <Section title="Later this month" items={buckets.thisMonth} todayKey={todayKey} onOpen={setOpenItem} />

      {buckets.totalCount > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <span className="font-mono text-sm tabular-nums">
              {buckets.doneCount} / {buckets.totalCount} done
            </span>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${donePct}%` }} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {buckets.unscheduled.length > 0 ? (
        <Link
          href="/planner/tasks"
          className="flex h-11 items-center justify-between rounded-xl bg-card px-4 text-sm ring-1 ring-foreground/10 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span>Unscheduled</span>
          <span className="font-mono tabular-nums text-muted-foreground">{buckets.unscheduled.length}</span>
        </Link>
      ) : null}

      <ItemSheet
        item={openItem}
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null)
        }}
        defaultDateKey={todayKey}
      />
      <CaptureFab defaultDateKey={todayKey} />
    </>
  )
}
```

- [ ] **Step 2: Wire the page**

Replace `src/app/(dashboard)/planner/page.tsx` with:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listAllTasks } from '@/server/repositories/planner-tasks-repository'
import { listEventsInRange } from '@/server/repositories/planner-events-repository'
import { addDayKeys, bucketByHorizon, daysUntilWedding, toDayKey, type PlannerItem } from '@/domain/planner'
import { PlannerHomeCards } from './planner-home-cards'

export default async function PlannerHomePage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const todayKey = toDayKey(new Date())
  const supabase = await getServerSupabase()

  // Tasks come in whole because progress counts every task, dated or not.
  // Events only need the horizon the cards actually show.
  const [tasks, events] = await Promise.all([
    listAllTasks(supabase),
    listEventsInRange(supabase, addDayKeys(todayKey, -30), addDayKeys(todayKey, 60)),
  ])

  const items: PlannerItem[] = [
    ...tasks.map((task) => ({ kind: 'task' as const, ...task })),
    ...events.map((event) => ({ kind: 'event' as const, ...event })),
  ]

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Planner</h1>
        <Link
          href="/planner/calendar"
          className="flex h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
        >
          <CalendarDays className="size-4" />
          Calendar
        </Link>
      </div>

      <PlannerHomeCards
        buckets={bucketByHorizon(items, todayKey)}
        todayKey={todayKey}
        daysLeft={daysUntilWedding(todayKey)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Visit `/planner`. Confirm: the countdown strip is hidden here, the display-size countdown reads the right number of days, an overdue task shows in a red-ringed card, a card with nothing in it renders nothing at all, the progress bar matches the counts, and the FAB sits above the bottom edge without covering the last card.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/planner/planner-home-cards.tsx" "src/app/(dashboard)/planner/page.tsx"
git commit -m "feat(planner): add the planner status home"
```

---

### Task 16: Task list and backlog

**Files:**
- Modify: `src/app/(dashboard)/planner/tasks/page.tsx`
- Create: `src/app/(dashboard)/planner/tasks/tasks-list.tsx`

**Interfaces:**
- Consumes: `listAllTasks`; `ItemChip`, `ItemSheet`, `CaptureFab`; `PlannerTask`, `DayKey`.
- Produces: `<TasksList tasks={PlannerTask[]} todayKey={DayKey} hideDone={boolean} assignee={'all'|'fatan'|'sita'} />`, grouped by month with the undated backlog last.

- [ ] **Step 1: Write the list**

Create `src/app/(dashboard)/planner/tasks/tasks-list.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ItemChip } from '@/components/planner/item-chip'
import { ItemSheet } from '@/components/planner/item-sheet'
import { CaptureFab } from '@/components/planner/capture-fab'
import type { DayKey, PlannerItem, PlannerTask } from '@/domain/planner'

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function TasksList({
  tasks,
  todayKey,
  hideDone,
  assignee,
}: {
  tasks: PlannerTask[]
  todayKey: DayKey
  hideDone: boolean
  assignee: 'all' | 'fatan' | 'sita'
}) {
  const [openItem, setOpenItem] = useState<PlannerItem | null>(null)

  const visible = tasks.filter((task) => {
    if (hideDone && task.status === 'done') return false
    if (assignee !== 'all' && task.assignee !== assignee && task.assignee !== 'both') return false
    return true
  })

  const dated = visible.filter((task) => task.dueDate !== null)
  const undated = visible.filter((task) => task.dueDate === null)

  const byMonth = new Map<string, PlannerTask[]>()
  for (const task of dated) {
    const monthKey = task.dueDate!.slice(0, 7)
    byMonth.set(monthKey, [...(byMonth.get(monthKey) ?? []), task])
  }
  const months = [...byMonth.keys()].sort()

  function filterHref(next: Partial<{ hideDone: boolean; assignee: string }>) {
    const params = new URLSearchParams()
    const nextAssignee = next.assignee ?? assignee
    const nextHideDone = next.hideDone ?? hideDone
    if (nextAssignee !== 'all') params.set('assignee', nextAssignee)
    if (nextHideDone) params.set('hideDone', '1')
    const query = params.toString()
    return query ? `/planner/tasks?${query}` : '/planner/tasks'
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'fatan', 'sita'] as const).map((option) => (
          <Link
            key={option}
            href={filterHref({ assignee: option })}
            aria-current={option === assignee ? 'true' : undefined}
            className={`flex h-9 items-center rounded-full px-3 text-xs font-medium capitalize ${
              option === assignee ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
            }`}
          >
            {option}
          </Link>
        ))}
        <Link
          href={filterHref({ hideDone: !hideDone })}
          className={`flex h-9 items-center rounded-full px-3 text-xs font-medium ${
            hideDone ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
          }`}
        >
          Hide done
        </Link>
      </div>

      {months.map((monthKey) => (
        <section key={monthKey} className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-medium text-muted-foreground">{monthLabel(monthKey)}</h2>
          {byMonth.get(monthKey)!.map((task) => (
            <ItemChip
              key={task.id}
              item={{ kind: 'task', ...task }}
              todayKey={todayKey}
              onOpen={setOpenItem}
            />
          ))}
        </section>
      ))}

      {undated.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-medium text-muted-foreground">Unscheduled</h2>
          {undated.map((task) => (
            <ItemChip key={task.id} item={{ kind: 'task', ...task }} todayKey={todayKey} onOpen={setOpenItem} />
          ))}
        </section>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing matches this filter. Add a task with the button below.</p>
      ) : null}

      <ItemSheet
        item={openItem}
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null)
        }}
        defaultDateKey={todayKey}
      />
      <CaptureFab defaultDateKey={todayKey} />
    </>
  )
}
```

- [ ] **Step 2: Wire the page**

Replace `src/app/(dashboard)/planner/tasks/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listAllTasks } from '@/server/repositories/planner-tasks-repository'
import { toDayKey } from '@/domain/planner'
import { TasksList } from './tasks-list'

export default async function PlannerTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ assignee?: string; hideDone?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const assignee = params.assignee === 'fatan' || params.assignee === 'sita' ? params.assignee : 'all'
  const hideDone = params.hideDone === '1'

  const supabase = await getServerSupabase()
  const tasks = await listAllTasks(supabase)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 pb-24">
      <h1 className="text-xl font-medium">All tasks</h1>
      <TasksList tasks={tasks} todayKey={toDayKey(new Date())} hideDone={hideDone} assignee={assignee} />
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Visit `/planner/tasks`. Confirm tasks group by month in date order with the undated backlog last, the filter chips change the URL, a refresh keeps the filter, and hide-done removes completed tasks.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/planner/tasks"
git commit -m "feat(planner): add the grouped task list with URL filters"
```

---

### Task 17: Seed import from the vault to-do list

**Files:**
- Create: `scripts/import-planner.ts`

**Interfaces:**
- Consumes: `createTask`, `createSubtask` from Task 7; `createEvent` from Task 7; the admin Supabase client pattern used by `scripts/import-sheet.ts`.
- Produces: a one-shot script run with `npx tsx scripts/import-planner.ts`, idempotent by title so a re-run does not duplicate.

- [ ] **Step 1: Read the existing import script for its client and env pattern**

Run: `head -40 scripts/import-sheet.ts`
Note how it builds the admin client and loads `.env.local`. Reuse that exact approach below rather than inventing a second one.

- [ ] **Step 2: Write the script**

Create `scripts/import-planner.ts`:

```ts
/**
 * One-time seed of the planner from the vault's Wedding To-Do List.md.
 * Idempotent by title: a re-run skips anything already present, so a partial
 * failure is safe to retry. After this runs, the vault note is history and the
 * app is the source of truth.
 *
 * Run: npx tsx scripts/import-planner.ts
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '../src/server/supabase/env'
import { createTask } from '../src/server/repositories/planner-tasks-repository'
import { createEvent } from '../src/server/repositories/planner-events-repository'
import type { NewTaskInput } from '../src/server/repositories/planner-tasks-repository'
import type { NewEventInput } from '../src/server/repositories/planner-events-repository'

const TASKS: Array<NewTaskInput & { done?: boolean }> = [
  { title: 'Submit SIMKAH', dueDate: '2026-07-10', assignee: 'both', done: true },
  { title: 'KUA', dueDate: '2026-07-10', assignee: 'both', done: true },
  { title: 'Istiqlal', dueDate: '2026-07-13', assignee: 'both', done: true },
  { title: 'Feedback for Michelle Dekorasi', dueDate: '2026-07-18', assignee: 'sita', done: true },
  { title: 'Moodboard prewedding', dueDate: '2026-07-19', assignee: 'both', done: true },
  { title: 'Book Dekorasi Akad', dueDate: '2026-07-29', dueEndDate: '2026-07-31', assignee: 'both', done: true },
  { title: 'Book Teazzi & Umaku', dueDate: '2026-07-29', dueEndDate: '2026-07-31', assignee: 'both' },
  { title: 'Attire prewedding', dueDate: '2026-07-29', dueEndDate: '2026-07-31', assignee: 'both' },
  {
    title: "Parents' attire — vendor stock taken",
    notes:
      'Vendor said stock was plentiful back in January and they could pick later. By the 22 Jul fitting the stock was gone: 10 Oct is a popular date and other couples booked ahead. Need a new plan for both mothers and both fathers.',
    dueDate: null,
    isFlagged: true,
    assignee: 'both',
  },
  { title: 'Souvenir', dueDate: '2026-08-14', dueEndDate: '2026-08-16', assignee: 'both' },
  { title: 'Pesan cincin kawin', dueDate: '2026-08-14', dueEndDate: '2026-08-16', assignee: 'both', done: true },
  { title: 'Undangan', dueDate: '2026-08-14', dueEndDate: '2026-08-16', assignee: 'both' },
  { title: 'Mahar', dueDate: '2026-08-29', dueEndDate: '2026-08-31', assignee: 'fatan' },
  { title: 'Last fitting with family', dueDate: '2026-09-01', dueEndDate: '2026-09-03', assignee: 'both' },
  { title: 'Book Sesoul Massage & Spa', dueDate: '2026-09-14', dueEndDate: '2026-09-16', assignee: 'sita' },
  { title: 'Seserahan', dueDate: '2026-09-28', dueEndDate: '2026-09-30', assignee: 'both' },
]

const EVENTS: NewEventInput[] = [
  {
    title: 'First meeting with WO (Ohana Enterprise)',
    startsAt: '2026-07-13T18:00:00+07:00',
    endsAt: '2026-07-13T20:00:00+07:00',
    assignee: 'both',
  },
  {
    title: 'First fitting + Casa de Eunoia survey',
    startsAt: '2026-07-22T09:00:00+07:00',
    endsAt: '2026-07-22T17:00:00+07:00',
    location: 'Bandung',
    assignee: 'both',
  },
  {
    title: 'Prewedding shoot',
    startsAt: '2026-08-24T00:00:00+07:00',
    endsAt: '2026-08-24T23:59:59+07:00',
    allDay: true,
    assignee: 'both',
  },
  {
    title: 'Wedding day',
    startsAt: '2026-10-10T00:00:00+07:00',
    endsAt: '2026-10-10T23:59:59+07:00',
    allDay: true,
    assignee: 'both',
  },
]

async function main() {
  const supabase = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existingTasks } = await supabase.from('planner_tasks').select('title')
  const seenTasks = new Set((existingTasks ?? []).map((row) => row.title as string))

  for (const { done, ...task } of TASKS) {
    if (seenTasks.has(task.title)) {
      console.log(`skip task: ${task.title}`)
      continue
    }
    const id = await createTask(supabase, task)
    if (done) {
      await supabase
        .from('planner_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', id)
    }
    console.log(`task: ${task.title}${done ? ' (done)' : ''}`)
  }

  const { data: existingEvents } = await supabase.from('planner_events').select('title')
  const seenEvents = new Set((existingEvents ?? []).map((row) => row.title as string))

  for (const event of EVENTS) {
    if (seenEvents.has(event.title)) {
      console.log(`skip event: ${event.title}`)
      continue
    }
    await createEvent(supabase, event)
    console.log(`event: ${event.title}`)
  }

  console.log('done')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 3: Run the import**

Run: `npx tsx scripts/import-planner.ts`
Expected: 16 task lines and 4 event lines, ending in `done`.

- [ ] **Step 4: Run it again to prove it is idempotent**

Run: `npx tsx scripts/import-planner.ts`
Expected: every line reads `skip task:` or `skip event:`, ending in `done`.

- [ ] **Step 5: Verify in the browser**

Visit `/planner`. Confirm the blocked parents' attire item appears in the Blocked card, the August blocks appear under the right horizon, completed July items count toward progress without appearing in overdue, and `/planner/calendar?view=month&date=2026-08-01` shows the three-day blocks spanning three cells.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-planner.ts
git commit -m "feat(planner): seed the planner from the vault to-do list"
```

---

### Task 18: Subtasks inside the item sheet

**Files:**
- Create: `src/components/planner/subtask-list.tsx`
- Modify: `src/components/planner/item-sheet.tsx`
- Modify: `src/app/(dashboard)/planner/calendar/page.tsx`, `src/app/(dashboard)/planner/page.tsx`, `src/app/(dashboard)/planner/tasks/page.tsx`

**Interfaces:**
- Consumes: `addSubtask`, `toggleSubtask`, `removeSubtask` from Task 8; `listSubtasks` from Task 7; `PlannerSubtask`.
- Produces: `<SubtaskList taskId={string} subtasks={PlannerSubtask[]} />`, and a `subtasksByTaskId: Record<string, PlannerSubtask[]>` prop threaded from each page into `ItemSheet`.

- [ ] **Step 1: Write the subtask list**

Create `src/components/planner/subtask-list.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { addSubtask, toggleSubtask, removeSubtask } from '@/server/actions/planner-actions'
import type { PlannerSubtask } from '@/domain/planner'

export function SubtaskList({ taskId, subtasks }: { taskId: string; subtasks: PlannerSubtask[] }) {
  const [draft, setDraft] = useState('')
  const [isPending, startTransition] = useTransition()

  function onAdd() {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    startTransition(() => void addSubtask(taskId, title))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Subtasks</span>

      {subtasks.map((subtask) => (
        <div key={subtask.id} className="flex h-11 items-center gap-2">
          <button
            type="button"
            aria-label={subtask.isDone ? `Mark ${subtask.title} as not done` : `Mark ${subtask.title} as done`}
            disabled={isPending}
            onClick={() => startTransition(() => void toggleSubtask(subtask.id, !subtask.isDone))}
            className="flex size-6 shrink-0 items-center justify-center rounded-md border border-input focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
          >
            {subtask.isDone ? <Check className="size-3" /> : null}
          </button>
          <span className={`min-w-0 flex-1 truncate text-sm ${subtask.isDone ? 'text-muted-foreground line-through' : ''}`}>
            {subtask.title}
          </span>
          <button
            type="button"
            aria-label={`Remove ${subtask.title}`}
            disabled={isPending}
            onClick={() => startTransition(() => void removeSubtask(subtask.id))}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the surrounding task form.
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd()
            }
          }}
          placeholder="Add a subtask"
          className="h-11 text-base md:text-sm"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Render it in the item sheet**

In `src/components/planner/item-sheet.tsx`, add the import:

```tsx
import { SubtaskList } from './subtask-list'
import type { PlannerSubtask } from '@/domain/planner'
```

Add `subtasks` to the prop type: `subtasks?: PlannerSubtask[]`, defaulting to `[]` in the destructure. Then insert this immediately after the Notes field block, before the `{error ? ... : null}` line:

```tsx
          {item?.kind === 'task' ? <SubtaskList taskId={item.id} subtasks={subtasks} /> : null}
```

- [ ] **Step 3: Thread subtasks from each page**

In `src/app/(dashboard)/planner/page.tsx`, after loading tasks, add:

```tsx
  const subtaskRows = await listSubtasksForTasks(supabase, tasks.map((task) => task.id))
```

Add `listSubtasksForTasks` to `src/server/repositories/planner-tasks-repository.ts`:

```ts
export async function listSubtasksForTasks(
  supabase: SupabaseClient,
  taskIds: string[]
): Promise<Record<string, PlannerSubtask[]>> {
  if (taskIds.length === 0) return {}
  const { data, error } = await supabase
    .from('planner_subtasks')
    .select('id, task_id, title, is_done, position')
    .in('task_id', taskIds)
    .order('position', { ascending: true })
  if (error) throw new Error(`Failed to list subtasks: ${error.message}`)

  const grouped: Record<string, PlannerSubtask[]> = {}
  for (const row of data ?? []) {
    const subtask: PlannerSubtask = {
      id: row.id as string,
      taskId: row.task_id as string,
      title: row.title as string,
      isDone: row.is_done as boolean,
      position: row.position as number,
    }
    grouped[subtask.taskId] = [...(grouped[subtask.taskId] ?? []), subtask]
  }
  return grouped
}
```

Pass `subtasksByTaskId={subtaskRows}` into `PlannerHomeCards`, `TasksList` and `CalendarSurface`, add `subtasksByTaskId: Record<string, PlannerSubtask[]>` to each of their prop types, and in each one pass `subtasks={openItem ? (subtasksByTaskId[openItem.id] ?? []) : []}` into `ItemSheet`. In `src/app/(dashboard)/planner/calendar/page.tsx` and `src/app/(dashboard)/planner/tasks/page.tsx` load it the same way from the tasks already fetched there.

- [ ] **Step 4: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Open an existing task. Add two subtasks, tick one, confirm it strikes through, remove it, and confirm pressing Enter in the subtask field adds a subtask rather than saving and closing the whole task.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/subtask-list.tsx src/components/planner/item-sheet.tsx src/server/repositories/planner-tasks-repository.ts "src/app/(dashboard)/planner"
git commit -m "feat(planner): edit subtasks inside the item sheet"
```

---

### Task 19: Swipe to change period on touch

**Files:**
- Create: `src/components/planner/use-swipe-period.ts`
- Modify: `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`

**Interfaces:**
- Consumes: `addDayKeys`, `toDayKey`, `DayKey`; `useRouter` from `next/navigation`; `CalendarView`.
- Produces: `useSwipePeriod({ view, dateKey }): { onTouchStart, onTouchEnd }` — spread onto the calendar container.

- [ ] **Step 1: Write the hook**

Create `src/components/planner/use-swipe-period.ts`:

```ts
'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addDayKeys, toDayKey, type DayKey } from '@/domain/planner'
import type { CalendarView } from './calendar-nav'

const MIN_DISTANCE_PX = 60
const MAX_VERTICAL_DRIFT_PX = 40

function shift(view: CalendarView, dateKey: DayKey, direction: 1 | -1): DayKey {
  if (view === 'day') return addDayKeys(dateKey, direction)
  if (view === 'week') return addDayKeys(dateKey, direction * 7)
  const [year, month] = dateKey.split('-').map(Number)
  return toDayKey(new Date(year, month - 1 + direction, 1))
}

/**
 * Horizontal only, and only past a real threshold, so scrolling the hour grid
 * vertically never pages the calendar out from under a thumb.
 */
export function useSwipePeriod({ view, dateKey }: { view: CalendarView; dateKey: DayKey }) {
  const router = useRouter()
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart: (event: React.TouchEvent) => {
      const touch = event.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY }
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if (!start.current) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.current.x
      const dy = touch.clientY - start.current.y
      start.current = null

      if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX) return
      if (Math.abs(dx) < MIN_DISTANCE_PX) return

      const direction = dx < 0 ? 1 : -1
      router.push(`/planner/calendar?view=${view}&date=${shift(view, dateKey, direction)}`)
    },
  }
}
```

- [ ] **Step 2: Attach it**

In `src/app/(dashboard)/planner/calendar/calendar-surface.tsx`, add:

```tsx
import { useSwipePeriod } from '@/components/planner/use-swipe-period'
```

Inside the component, above the return:

```tsx
  const swipe = useSwipePeriod({ view: resolvedView, dateKey })
```

Wrap the view render chain in a container carrying the handlers:

```tsx
      <div {...swipe} className="touch-pan-y">
        {/* existing view chain goes here unchanged */}
      </div>
```

- [ ] **Step 3: Verify the build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

In a touch-emulating viewport: swipe left on the month view and confirm it advances one month, swipe right and confirm it goes back. In the day view, scroll the hour grid vertically and confirm the day does not change.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/use-swipe-period.ts "src/app/(dashboard)/planner/calendar/calendar-surface.tsx"
git commit -m "feat(planner): swipe to change period on touch"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 4. Data model, all three tables, checks, cascade | 1 |
| 5. Architecture, domain purity, URL view state | 2–6, 11 |
| 6. Design direction, touch density, Operations Room | 10–16 (chips, sheets, cards all at `h-11`) |
| 7.1 App-wide countdown strip, hidden on planner home | 9 |
| 7.2 Planner home, seven cards in fixed order | 15 |
| 7.3 Calendar, month/week/day, phone agenda fallback | 11, 12, 13 |
| 7.4 Capture and edit | 14 |
| 2. Notes and subtasks in scope | 18 |
| 7.3 Swipe changes period on touch | 19 |
| 7.5 Task list and backlog | 16 |
| 7.6 Chips, checkbox, never colour alone | 10 |
| 8. States and ranges | 15 (empty), 13 (empty days), 12 (all-day strip empty) |
| 9. Seed import | 17 |
| 11. Excluded decisions | Global Constraints |

**Type consistency:** `DayKey`, `Assignee`, `PlannerTask`, `PlannerEvent`, `PlannerItem`, `DaySegment`, `TimedLayout`, `HorizonBuckets`, `NewTaskInput`, `NewEventInput` are each defined once and imported by name everywhere after. Repository functions are referenced by the exact names declared in Task 7's Interfaces block. Action names in Task 8 match their call sites in Tasks 10, 14, 15 and 16.

**Gaps found and closed during review:** the spec puts notes *and subtasks* in v1 (section 2) and swipe-paging in the calendar (section 7.3). Both were initially parked as follow-ups with no task. Tasks 18 and 19 now cover them.

**Deliberately deferred, and safe to defer:** reordering subtasks by drag (the `position` column exists and is written on create; nothing in the spec asks to reorder them), and an offline cache for the venue scenario in section 8 (the spec lists it as a state to survive, which server-rendered pages already do by failing visibly rather than silently).
