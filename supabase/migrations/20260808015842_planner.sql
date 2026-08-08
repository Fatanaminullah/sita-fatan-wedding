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
