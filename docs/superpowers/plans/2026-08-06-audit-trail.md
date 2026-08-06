# Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who changed what across guest CRUD, cap edits, account management and waitlist promotions, in one admin-only, immutable `audit_log` table.

**Architecture:** One generic table (`audit_log`) with a field-level `diff` jsonb column. A pure domain function (`buildDiff`) computes the diff; one repository function (`insertAuditLog`) writes it; each of the four mutation surfaces calls it once, after its own write succeeds. A new `/audit` admin screen reads it back.

**Tech Stack:** Supabase Postgres + RLS (existing project), Next.js server actions (existing pattern), Vitest (domain + RLS integration tests).

Full context: `docs/superpowers/specs/2026-08-06-audit-trail-design.md` (the approved design, D1-D5), `docs/DATA_MODEL.md`, `CLAUDE.md`.

## Global Constraints

- Never reintroduce `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. This repo uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` only (`CLAUDE.md`).
- `SUPABASE_SECRET_KEY` (via `getAdminSupabase()`) never runs in a client component and is never logged. `audit_log` inserts always go through `getServerSupabase()` (the RLS-bound client), even inside `user-actions.ts`, so the insert is itself subject to the `actor_id = auth.uid()` check (`docs/superpowers/specs/2026-08-06-audit-trail-design.md`, D4).
- `src/domain/` may not import `src/server/`, `supabase-js`, `next`, or any React package. Enforced by `eslint.config.mjs` and asserted in `tests/lint/domain-purity.test.ts`. `src/domain/audit.ts` must stay pure.
- No em dashes in user-facing copy or comments (`CLAUDE.md`).
- Admin pages are English; the app has no guest-facing surface touched by this plan.
- `resetPassword`'s audit entry never contains the password, in the diff or anywhere else.
- Every migration file name is `<yyyymmddhhmmss>_<name>.sql`, later than the last existing one (`20260803131500_profile_usernames.sql`).
- Screens get manual verification, not automated tests (`CLAUDE.md` testing section). Only `src/domain/` logic and RLS policies get automated tests in this plan.

---

### Task 1: `audit_log` table and RLS

**Files:**
- Create: `supabase/migrations/20260806090000_audit_log.sql`
- Create: `tests/rls/audit-log.test.ts`

**Interfaces:**
- Produces: table `audit_log` with columns `id uuid`, `actor_id uuid null`, `actor_name text`, `actor_role text`, `action text`, `entity_type text`, `entity_id text`, `entity_label text`, `diff jsonb`, `created_at timestamptz`. Policies `audit_log_insert` (insert, `admin`/`inviter` role, own `actor_id`) and `audit_log_admin_read` (select, `admin` only). No update or delete policy for any role.
- Consumes: existing helper function `current_profile_role()` (`supabase/migrations/20260801144411_harden_rls_helper_functions.sql`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260806090000_audit_log.sql
-- audit_log: who changed what across guest CRUD, caps, accounts and waitlist
-- promotions. Immutable by omission -- no update or delete policy exists for
-- any role, including admin. A correction is a new row, never an edit of
-- history (docs/superpowers/specs/2026-08-06-audit-trail-design.md, D5).

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (user_id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null check (action in (
    'guest.create', 'guest.update', 'guest.delete',
    'caps.update',
    'waitlist.promote',
    'user.create', 'user.update', 'user.password_reset', 'user.delete'
  )),
  entity_type text not null check (entity_type in ('guest', 'inviter_caps', 'side_caps', 'guest_event', 'user')),
  entity_id text not null,
  entity_label text not null,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy audit_log_insert on audit_log for insert
  with check (current_profile_role() in ('admin', 'inviter') and actor_id = auth.uid());

create policy audit_log_admin_read on audit_log for select
  using (current_profile_role() = 'admin');

-- no update, no delete policy for anyone: denied by default, not by an explicit deny rule
```

- [ ] **Step 2: Apply the migration to the remote project**

Use the Supabase MCP tool `apply_migration` with project ref `elzewxhtkqqfdjrvpahv`, name `audit_log`, passing the SQL above. Confirm with `list_tables` that `audit_log` now exists with RLS enabled.

- [ ] **Step 3: Write the RLS test**

```ts
// tests/rls/audit-log.test.ts
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
let createdAuditLogIds: string[] = []

beforeAll(() => {
  config = getRemoteConfig()
})

afterEach(async () => {
  const admin = getAdminClient(config)
  for (const id of createdAuditLogIds) {
    await admin.from('audit_log').delete().eq('id', id)
  }
  createdAuditLogIds = []
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

async function seedAuditLogRow(admin: SupabaseClient, actorId: string) {
  const { data, error } = await admin
    .from('audit_log')
    .insert({
      actor_id: actorId,
      actor_name: 'Seed Actor',
      actor_role: 'admin',
      action: 'guest.create',
      entity_type: 'guest',
      entity_id: crypto.randomUUID(),
      entity_label: 'Seed Guest',
      diff: { name: { old: null, new: 'Seed Guest' } },
    })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to seed audit_log row: ${error?.message}`)
  createdAuditLogIds.push(data.id)
  return data.id as string
}

describe('audit_log RLS', () => {
  it('admin can read every row, including one logged by someone else', async () => {
    const admin = getAdminClient(config)
    const other = await makeTestUser(admin, {
      email: `audit-other-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const adminUser = await makeTestUser(admin, { email: `audit-admin-${Date.now()}@example.com`, role: 'admin' })
    await seedAuditLogRow(admin, other.userId)
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    const { data, error } = await asAdmin.from('audit_log').select('*')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('inviter cannot read any audit_log row', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `audit-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    await seedAuditLogRow(admin, inviter.userId)
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('audit_log').select('*')
    expect(data).toHaveLength(0)
  })

  it('inviter can insert a row with their own actor_id', async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `audit-insert-own-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data, error } = await asInviter
      .from('audit_log')
      .insert({
        actor_id: inviter.userId,
        actor_name: 'Test Inviter',
        actor_role: 'inviter',
        action: 'guest.create',
        entity_type: 'guest',
        entity_id: crypto.randomUUID(),
        entity_label: 'Test Guest',
        diff: {},
      })
      .select()
      .single()
    expect(error).toBeNull()
    if (data) createdAuditLogIds.push(data.id)
  })

  it("inviter cannot insert a row with someone else's actor_id", async () => {
    const admin = getAdminClient(config)
    const inviter = await makeTestUser(admin, {
      email: `audit-insert-other-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    const other = await makeTestUser(admin, {
      email: `audit-insert-victim-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter.from('audit_log').insert({
      actor_id: other.userId,
      actor_name: 'Test Inviter',
      actor_role: 'inviter',
      action: 'guest.create',
      entity_type: 'guest',
      entity_id: crypto.randomUUID(),
      entity_label: 'Test Guest',
      diff: {},
    })
    expect(error).not.toBeNull()
  })

  it('usher cannot insert or read audit_log rows', async () => {
    const admin = getAdminClient(config)
    const usher = await makeTestUser(admin, { email: `audit-usher-${Date.now()}@example.com`, role: 'usher' })
    await seedAuditLogRow(admin, usher.userId)
    const asUsher = await clientAs(config, usher.email, usher.password)

    const read = await asUsher.from('audit_log').select('*')
    expect(read.data).toHaveLength(0)

    const insert = await asUsher.from('audit_log').insert({
      actor_id: usher.userId,
      actor_name: 'Test Usher',
      actor_role: 'usher',
      action: 'guest.create',
      entity_type: 'guest',
      entity_id: crypto.randomUUID(),
      entity_label: 'Test Guest',
      diff: {},
    })
    expect(insert.error).not.toBeNull()
  })

  it('nobody, including admin, can update or delete a row', async () => {
    const admin = getAdminClient(config)
    const adminUser = await makeTestUser(admin, { email: `audit-noedit-${Date.now()}@example.com`, role: 'admin' })
    const rowId = await seedAuditLogRow(admin, adminUser.userId)
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    const update = await asAdmin.from('audit_log').update({ entity_label: 'Changed' }).eq('id', rowId)
    const afterUpdate = await admin.from('audit_log').select('entity_label').eq('id', rowId).single()
    // RLS denies the row silently (0 rows affected) rather than erroring,
    // same pattern as the inviters cap test in profiles-inviters-side-caps.test.ts.
    expect(afterUpdate.data?.entity_label).toBe('Seed Guest')
    expect(update.error).toBeNull()

    const del = await asAdmin.from('audit_log').delete().eq('id', rowId)
    const afterDelete = await admin.from('audit_log').select('id').eq('id', rowId).maybeSingle()
    expect(afterDelete.data).not.toBeNull()
    expect(del.error).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/rls/audit-log.test.ts`
Expected: PASS, all 6 cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260806090000_audit_log.sql tests/rls/audit-log.test.ts
git commit -m "feat(audit): add audit_log table with insert-only, admin-read RLS"
```

---

### Task 2: `buildDiff` domain function

**Files:**
- Create: `src/domain/audit.ts`
- Test: `src/domain/audit.test.ts`

**Interfaces:**
- Produces: `buildDiff<T extends Record<string, unknown>>(before: Partial<T> | null, after: Partial<T> | null, fields: readonly (keyof T)[]): Record<string, { old: unknown; new: unknown }>`. Consumed by every action task below (Tasks 5-8).

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/audit.test.ts
import { describe, it, expect } from 'vitest'
import { buildDiff } from './audit'

describe('buildDiff', () => {
  it('logs every field as null -> value on create (before is null)', () => {
    const diff = buildDiff<{ name: string; pax: number }>(null, { name: 'Budi', pax: 2 }, ['name', 'pax'])
    expect(diff).toEqual({
      name: { old: null, new: 'Budi' },
      pax: { old: null, new: 2 },
    })
  })

  it('logs every field as value -> null on delete (after is null)', () => {
    const diff = buildDiff<{ name: string; pax: number }>({ name: 'Budi', pax: 2 }, null, ['name', 'pax'])
    expect(diff).toEqual({
      name: { old: 'Budi', new: null },
      pax: { old: 2, new: null },
    })
  })

  it('keeps only fields that actually changed on update', () => {
    const diff = buildDiff<{ name: string; pax: number }>(
      { name: 'Budi', pax: 2 },
      { name: 'Budi', pax: 3 },
      ['name', 'pax']
    )
    expect(diff).toEqual({ pax: { old: 2, new: 3 } })
  })

  it('returns an empty object when nothing changed', () => {
    const diff = buildDiff<{ name: string }>({ name: 'Budi' }, { name: 'Budi' }, ['name'])
    expect(diff).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/audit.test.ts`
Expected: FAIL with "Cannot find module './audit'" or "buildDiff is not a function".

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/audit.ts
export function buildDiff<T extends Record<string, unknown>>(
  before: Partial<T> | null,
  after: Partial<T> | null,
  fields: readonly (keyof T)[]
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const field of fields) {
    const oldValue = before ? before[field] ?? null : null
    const newValue = after ? after[field] ?? null : null
    if (oldValue !== newValue) {
      diff[field as string] = { old: oldValue, new: newValue }
    }
  }
  return diff
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/domain/audit.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/domain/audit.ts src/domain/audit.test.ts
git commit -m "feat(audit): add pure buildDiff domain function"
```

---

### Task 3: Audit log repository

**Files:**
- Create: `src/server/repositories/audit-log-repository.ts`

**Interfaces:**
- Consumes: `buildDiff` output shape (Task 2).
- Produces: `AuditEntry` type, `insertAuditLog(supabase, entry: AuditEntry): Promise<void>`, `AuditLogRow` type, `listAuditLog(supabase, filters?: { entityType?: string; actorName?: string }): Promise<AuditLogRow[]>`. Consumed by Tasks 5-8 (`insertAuditLog`) and Task 9 (`listAuditLog`).

- [ ] **Step 1: Write the repository**

```ts
// src/server/repositories/audit-log-repository.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditEntry = {
  actorId: string
  actorName: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  entityLabel: string
  diff: Record<string, { old: unknown; new: unknown }>
}

// A failed audit write never blocks or reverts the mutation it records: the
// real write has already committed by the time this runs. Log and move on
// rather than surfacing an unrelated audit-log error as a failed guest save.
export async function insertAuditLog(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    actor_name: entry.actorName,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_label: entry.entityLabel,
    diff: entry.diff,
  })
  if (error) {
    console.error(
      `Failed to write audit log for ${entry.action} on ${entry.entityType} ${entry.entityId}: ${error.message}`
    )
  }
}

export type AuditLogRow = {
  id: string
  actorId: string | null
  actorName: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  entityLabel: string
  diff: Record<string, { old: unknown; new: unknown }>
  createdAt: string
}

export async function listAuditLog(
  supabase: SupabaseClient,
  filters: { entityType?: string; actorName?: string } = {}
): Promise<AuditLogRow[]> {
  let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.actorName) query = query.eq('actor_name', filters.actorName)

  const { data, error } = await query
  if (error) throw new Error(`Failed to list audit log: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    diff: row.diff,
    createdAt: row.created_at,
  }))
}
```

This file has no dedicated unit test, matching every other file in `src/server/repositories/` (`guests-repository.ts`, `inviters-repository.ts`): it is thin wiring around Supabase, verified through the RLS test (Task 1) and manual QA in Tasks 5-9.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/repositories/audit-log-repository.ts
git commit -m "feat(audit): add insertAuditLog and listAuditLog repository functions"
```

---

### Task 4: `getCurrentProfile` carries the actor's full name

**Files:**
- Modify: `src/server/actions/auth-actions.ts:42-67`

**Interfaces:**
- Produces: `CurrentProfile` gains `fullName: string`. Consumed by every audit call site (Tasks 5-8): the actor's display name for `actor_name`.

- [ ] **Step 1: Modify the type and the query**

In `src/server/actions/auth-actions.ts`, replace:

```ts
export type CurrentProfile = {
  userId: string
  role: 'admin' | 'inviter' | 'usher' | 'viewer'
  inviterKey: string | null
  side: 'fatan' | 'sita' | null
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await getServerSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, role, inviter_key, side')
    .eq('user_id', auth.user.id)
    .single()
  if (!profile) return null

  return {
    userId: profile.user_id,
    role: profile.role,
    inviterKey: profile.inviter_key,
    side: profile.side,
  }
}
```

with:

```ts
export type CurrentProfile = {
  userId: string
  fullName: string
  role: 'admin' | 'inviter' | 'usher' | 'viewer'
  inviterKey: string | null
  side: 'fatan' | 'sita' | null
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await getServerSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, full_name, role, inviter_key, side')
    .eq('user_id', auth.user.id)
    .single()
  if (!profile) return null

  return {
    userId: profile.user_id,
    fullName: profile.full_name,
    role: profile.role,
    inviterKey: profile.inviter_key,
    side: profile.side,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Existing callers of `getCurrentProfile()` only read `.userId`, `.role`, `.inviterKey` today, so adding a field is additive.)

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/auth-actions.ts
git commit -m "feat(audit): carry full_name on CurrentProfile for actor display names"
```

---

### Task 5: Guest CRUD audit logging

**Files:**
- Modify: `src/server/actions/guest-actions.ts`

**Interfaces:**
- Consumes: `buildDiff` (Task 2), `insertAuditLog` (Task 3), `CurrentProfile.fullName` (Task 4).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add imports**

At the top of `src/server/actions/guest-actions.ts`, after the existing imports, add:

```ts
import { getCurrentProfile } from './auth-actions'
import { buildDiff } from '@/domain/audit'
import { insertAuditLog } from '../repositories/audit-log-repository'
```

- [ ] **Step 2: Add guest snapshot helpers**

After the `parseGuestForm` function and before `sideOfInviter`, add:

```ts
type GuestSnapshot = {
  name: string
  pax: number
  side: string
  inviter_key: string
  type: string
  phone: string | null
  is_vip: boolean
  note: string | null
  akad_invite_status: string | null
  resepsi_invite_status: string | null
}

const GUEST_SNAPSHOT_FIELDS: readonly (keyof GuestSnapshot)[] = [
  'name',
  'pax',
  'side',
  'inviter_key',
  'type',
  'phone',
  'is_vip',
  'note',
  'akad_invite_status',
  'resepsi_invite_status',
]

function snapshotFromExisting(row: {
  name: string
  pax: number
  side: string
  inviter_key: string
  type: string
  phone: string | null
  is_vip: boolean
  note: string | null
  guest_events?: Array<{ event: 'akad' | 'resepsi'; invite_status: string }> | null
}): GuestSnapshot {
  const events = row.guest_events ?? []
  const statusFor = (event: 'akad' | 'resepsi') => events.find((e) => e.event === event)?.invite_status ?? null
  return {
    name: row.name,
    pax: row.pax,
    side: row.side,
    inviter_key: row.inviter_key,
    type: row.type,
    phone: row.phone,
    is_vip: row.is_vip,
    note: row.note,
    akad_invite_status: statusFor('akad'),
    resepsi_invite_status: statusFor('resepsi'),
  }
}

function snapshotFromParsed(parsed: ParsedGuest, side: 'fatan' | 'sita'): GuestSnapshot {
  const statusFor = (event: 'akad' | 'resepsi') => {
    const invite = parsed.invites.find((i) => i.event === event)
    return invite && invite.inviteStatus !== 'none' ? invite.inviteStatus : null
  }
  return {
    name: parsed.name,
    pax: parsed.pax,
    side,
    inviter_key: parsed.inviterKey,
    type: parsed.type,
    phone: parsed.phone,
    is_vip: parsed.isVip,
    note: parsed.note,
    akad_invite_status: statusFor('akad'),
    resepsi_invite_status: statusFor('resepsi'),
  }
}
```

- [ ] **Step 3: Log `createGuest`**

Replace:

```ts
  await setGuestEvents(supabase, guest.id, parsed.invites)

  revalidateGuestScreens()
  return { guestId: guest.id, flags: parsed.phoneWarning ? [...flags, parsed.phoneWarning] : flags }
}

export async function updateGuest(formData: FormData): Promise<GuestFormResult> {
```

with:

```ts
  await setGuestEvents(supabase, guest.id, parsed.invites)

  const profile = await getCurrentProfile()
  if (profile) {
    await insertAuditLog(supabase, {
      actorId: profile.userId,
      actorName: profile.fullName,
      actorRole: profile.role,
      action: 'guest.create',
      entityType: 'guest',
      entityId: guest.id,
      entityLabel: parsed.name,
      diff: buildDiff(null, snapshotFromParsed(parsed, side), GUEST_SNAPSHOT_FIELDS),
    })
  }

  revalidateGuestScreens()
  return { guestId: guest.id, flags: parsed.phoneWarning ? [...flags, parsed.phoneWarning] : flags }
}

export async function updateGuest(formData: FormData): Promise<GuestFormResult> {
```

- [ ] **Step 4: Log `updateGuest`**

Replace:

```ts
  await setGuestEvents(supabase, guestId, parsed.invites)

  revalidateGuestScreens()
  return { guestId, flags: parsed.phoneWarning ? [...flags, parsed.phoneWarning] : flags }
}

export async function deleteGuest(formData: FormData): Promise<{ error: string } | { ok: true }> {
```

with:

```ts
  await setGuestEvents(supabase, guestId, parsed.invites)

  const profile = await getCurrentProfile()
  if (profile) {
    await insertAuditLog(supabase, {
      actorId: profile.userId,
      actorName: profile.fullName,
      actorRole: profile.role,
      action: 'guest.update',
      entityType: 'guest',
      entityId: guestId,
      entityLabel: parsed.name,
      diff: buildDiff(snapshotFromExisting(existing), snapshotFromParsed(parsed, side), GUEST_SNAPSHOT_FIELDS),
    })
  }

  revalidateGuestScreens()
  return { guestId, flags: parsed.phoneWarning ? [...flags, parsed.phoneWarning] : flags }
}

export async function deleteGuest(formData: FormData): Promise<{ error: string } | { ok: true }> {
```

- [ ] **Step 5: Log `deleteGuest`**

Replace the whole function:

```ts
export async function deleteGuest(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  if (!guestId) return { error: 'Guest is required.' }

  await deleteGuestRepo(supabase, guestId)

  revalidateGuestScreens()
  return { ok: true }
}
```

with:

```ts
export async function deleteGuest(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  if (!guestId) return { error: 'Guest is required.' }

  const profile = await getCurrentProfile()
  const existing = await getGuest(supabase, guestId)

  await deleteGuestRepo(supabase, guestId)

  if (profile) {
    await insertAuditLog(supabase, {
      actorId: profile.userId,
      actorName: profile.fullName,
      actorRole: profile.role,
      action: 'guest.delete',
      entityType: 'guest',
      entityId: guestId,
      entityLabel: existing.name as string,
      diff: buildDiff(snapshotFromExisting(existing), null, GUEST_SNAPSHOT_FIELDS),
    })
  }

  revalidateGuestScreens()
  return { ok: true }
}
```

- [ ] **Step 6: Log `updateGuestField`**

Replace the whole function (including its preceding doc comment) and add a small helper immediately above it:

```ts
async function logFieldChange(
  supabase: SupabaseClient,
  profile: Awaited<ReturnType<typeof getCurrentProfile>>,
  guest: { id: string; name: string },
  field: EditableField,
  oldValue: unknown,
  newValue: unknown
) {
  if (!profile) return
  await insertAuditLog(supabase, {
    actorId: profile.userId,
    actorName: profile.fullName,
    actorRole: profile.role,
    action: 'guest.update',
    entityType: 'guest',
    entityId: guest.id,
    entityLabel: guest.name,
    diff: buildDiff({ [field]: oldValue }, { [field]: newValue }, [field]),
  })
}

/**
 * One field on one guest, for the inline edit mode on the guest table. Kept
 * separate from `updateGuest` on purpose: that action rewrites the whole row
 * from a form, which is the wrong shape for someone typing down a column of
 * phone numbers. The field name is checked against a whitelist here, never
 * passed through to the query as-is.
 */
export async function updateGuestField(formData: FormData): Promise<FieldUpdateResult> {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  const field = String(formData.get('field') ?? '') as EditableField
  const raw = String(formData.get('value') ?? '')

  if (!guestId) return { error: 'Guest is required.' }

  const profile = await getCurrentProfile()
  const existing = await getGuest(supabase, guestId)

  switch (field) {
    case 'phone': {
      const { phone, warning } = normalizePhone(raw)
      const { error } = await supabase.from('guests').update({ phone }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'phone', existing.phone, phone)
      revalidateGuestScreens()
      return { ok: true, field, value: phone, flags: warning ? [warning] : [] }
    }
    case 'note': {
      const note = raw.trim() || null
      const { error } = await supabase.from('guests').update({ note }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'note', existing.note, note)
      revalidateGuestScreens()
      return { ok: true, field, value: note, flags: [] }
    }
    case 'name': {
      const name = raw.trim()
      if (!name) return { error: 'Name cannot be empty.' }
      const { error } = await supabase.from('guests').update({ name }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'name', existing.name, name)
      revalidateGuestScreens()
      return { ok: true, field, value: name, flags: [] }
    }
    case 'pax': {
      const pax = Number(raw)
      if (!Number.isInteger(pax) || pax <= 0) return { error: 'Pax must be a whole number above zero.' }

      // Pax moves capacity, so it gets the same warn-allow-flag treatment as
      // the dialog: measure against the list without this guest's old pax.
      const previous = {
        inviterKey: existing.inviter_key as string,
        pax: existing.pax as number,
        confirmedEvents: (
          (existing.guest_events ?? []) as Array<{ event: 'akad' | 'resepsi'; invite_status: string }>
        )
          .filter((row) => row.invite_status === 'confirmed')
          .map((row) => row.event),
      }
      const invites: EventInvite[] = previous.confirmedEvents.map((event) => ({
        event,
        inviteStatus: 'confirmed' as const,
      }))
      const flags = await quotaFlags(supabase, previous.inviterKey, pax, invites, previous)

      const { error } = await supabase.from('guests').update({ pax }).eq('id', guestId)
      if (error) return { error: error.message }
      await logFieldChange(supabase, profile, existing, 'pax', existing.pax, pax)
      revalidateGuestScreens()
      return { ok: true, field, value: pax, flags }
    }
    default:
      return { error: `"${field}" is not an editable field.` }
  }
}
```

Note this removes the pax branch's own `getGuest` call (it now reuses `existing`, fetched once at the top of the function for every branch).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run `npm run dev`, sign in as an admin, go to `/guests`, create a guest, edit its pax inline, then delete it. After each action, use the Supabase MCP `execute_sql` tool against project ref `elzewxhtkqqfdjrvpahv` to run:

```sql
select action, entity_type, entity_label, diff, created_at
from audit_log
order by created_at desc
limit 5;
```

Expected: one `guest.create` row, one `guest.update` row (diff containing only `pax`), one `guest.delete` row, each with `entity_label` matching the guest's name and `actor_name` matching your admin account.

- [ ] **Step 9: Commit**

```bash
git add src/server/actions/guest-actions.ts
git commit -m "feat(audit): log guest create, update, delete and inline field edits"
```

---

### Task 6: Cap edit audit logging

**Files:**
- Modify: `src/server/actions/caps-actions.ts`

**Interfaces:**
- Consumes: `buildDiff` (Task 2), `insertAuditLog` (Task 3), `listInviters`/`listSideCaps` (existing, `src/server/repositories/inviters-repository.ts:33,51`).

- [ ] **Step 1: Add imports**

At the top of `src/server/actions/caps-actions.ts`, replace:

```ts
import { updateInviterCaps, updateSideVipCap } from '../repositories/inviters-repository'
```

with:

```ts
import { listInviters, listSideCaps, updateInviterCaps, updateSideVipCap } from '../repositories/inviters-repository'
import { buildDiff } from '@/domain/audit'
import { insertAuditLog } from '../repositories/audit-log-repository'
```

- [ ] **Step 2: Rewrite `saveCaps`**

Replace the whole function:

```ts
export async function saveCaps(formData: FormData): Promise<{ error: string } | { ok: true }> {
  if (!(await requireAdmin())) return { error: 'Only an admin can change caps.' }

  const supabase = await getServerSupabase()
  const inviterKeys = formData.getAll('inviterKey').map(String)

  for (const key of inviterKeys) {
    const akadCap = parseCap(formData.get(`akadCap:${key}`))
    const resepsiCap = parseCap(formData.get(`resepsiCap:${key}`))
    if (akadCap === null || resepsiCap === null) {
      return { error: `Caps for ${key} must be whole numbers, zero or above.` }
    }
    await updateInviterCaps(supabase, key, { akadCap, resepsiCap })
  }

  for (const side of ['fatan', 'sita'] as const) {
    const vipCap = parseCap(formData.get(`vipCap:${side}`))
    if (vipCap === null) return { error: `VIP cap for the ${side} side must be a whole number.` }
    await updateSideVipCap(supabase, side, vipCap)
  }

  revalidatePath('/caps')
  revalidatePath('/dashboard')
  return { ok: true }
}
```

with:

```ts
export async function saveCaps(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only an admin can change caps.' }

  const supabase = await getServerSupabase()
  const inviterKeys = formData.getAll('inviterKey').map(String)

  const beforeInviters = await listInviters(supabase)
  const beforeSideCaps = await listSideCaps(supabase)

  for (const key of inviterKeys) {
    const akadCap = parseCap(formData.get(`akadCap:${key}`))
    const resepsiCap = parseCap(formData.get(`resepsiCap:${key}`))
    if (akadCap === null || resepsiCap === null) {
      return { error: `Caps for ${key} must be whole numbers, zero or above.` }
    }
    await updateInviterCaps(supabase, key, { akadCap, resepsiCap })

    const before = beforeInviters?.find((row) => row.key === key)
    const diff = buildDiff(
      before ? { akad_cap: before.akad_cap, resepsi_cap: before.resepsi_cap } : null,
      { akad_cap: akadCap, resepsi_cap: resepsiCap },
      ['akad_cap', 'resepsi_cap']
    )
    if (Object.keys(diff).length > 0) {
      await insertAuditLog(supabase, {
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'caps.update',
        entityType: 'inviter_caps',
        entityId: key,
        entityLabel: key,
        diff,
      })
    }
  }

  for (const side of ['fatan', 'sita'] as const) {
    const vipCap = parseCap(formData.get(`vipCap:${side}`))
    if (vipCap === null) return { error: `VIP cap for the ${side} side must be a whole number.` }
    await updateSideVipCap(supabase, side, vipCap)

    const before = beforeSideCaps?.find((row) => row.side === side)
    const diff = buildDiff(before ? { vip_cap: before.vip_cap } : null, { vip_cap: vipCap }, ['vip_cap'])
    if (Object.keys(diff).length > 0) {
      await insertAuditLog(supabase, {
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'caps.update',
        entityType: 'side_caps',
        entityId: side,
        entityLabel: `${side} side`,
        diff,
      })
    }
  }

  revalidatePath('/caps')
  revalidatePath('/dashboard')
  return { ok: true }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, sign in as admin, go to `/caps`, change one inviter's `akad_cap` and save. Query:

```sql
select action, entity_type, entity_id, diff from audit_log where entity_type = 'inviter_caps' order by created_at desc limit 1;
```

Expected: one row, `diff` containing only `akad_cap` (not `resepsi_cap`, since it did not change). Save again with no changes at all: expect no new row.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/caps-actions.ts
git commit -m "feat(audit): log inviter and side cap changes"
```

---

### Task 7: Account management audit logging

**Files:**
- Modify: `src/server/actions/user-actions.ts`

**Interfaces:**
- Consumes: `buildDiff` (Task 2), `insertAuditLog` (Task 3), `getServerSupabase` (existing, `src/server/supabase/server-client.ts`).

- [ ] **Step 1: Add imports**

At the top of `src/server/actions/user-actions.ts`, replace:

```ts
import { revalidatePath } from 'next/cache'
import { checkUsername } from '@/domain/username'
import { getAdminSupabase } from '../supabase/admin-client'
import { getCurrentProfile } from './auth-actions'
```

with:

```ts
import { revalidatePath } from 'next/cache'
import { checkUsername } from '@/domain/username'
import { buildDiff } from '@/domain/audit'
import { getAdminSupabase } from '../supabase/admin-client'
import { getServerSupabase } from '../supabase/server-client'
import { insertAuditLog } from '../repositories/audit-log-repository'
import { getCurrentProfile } from './auth-actions'
```

- [ ] **Step 2: Rewrite `createUser`**

Replace the whole function:

```ts
export async function createUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  if (!(await requireAdmin())) return { error: 'Only an admin can create accounts.' }

  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()
  const role = String(formData.get('role') ?? '') as Role
  const inviterKey = String(formData.get('inviterKey') ?? '').trim() || null
  const side = (String(formData.get('side') ?? '').trim() || null) as 'fatan' | 'sita' | null

  const username = checkUsername(formData.get('username') as string | null)
  if (!username.ok) return { error: username.error }

  // Nothing is ever sent to the address: accounts are created confirmed and the
  // password is handed over in person. Supabase still needs one, so an account
  // created without an email gets a placeholder it can sign in with by username.
  const email =
    String(formData.get('email') ?? '').trim().toLowerCase() || `${username.username}@${PLACEHOLDER_EMAIL_DOMAIN}`

  if (!password || !fullName) return { error: 'Name, username and password are all required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }
  if (!['admin', 'inviter', 'usher', 'viewer'].includes(role)) return { error: 'Pick a role.' }
  if (role === 'inviter' && !inviterKey) return { error: 'An inviter account needs an inviter key.' }

  const admin = getAdminSupabase()
  const { data: taken } = await admin
    .from('profiles')
    .select('user_id')
    .eq('username', username.username)
    .maybeSingle()
  if (taken) return { error: `Username "${username.username}" is already taken.` }

  // Confirmed on creation: these are handed-over accounts, there is no inbox
  // to check and no self-signup flow (docs/PRD.md, "Login").
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) return { error: `Could not create the login: ${error?.message}` }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    username: username.username,
    full_name: fullName,
    role,
    inviter_key: role === 'inviter' ? inviterKey : null,
    side,
  })
  if (profileError) {
    // Roll the login back rather than leaving an account nobody can use.
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: `Could not create the profile: ${profileError.message}` }
  }

  revalidatePath('/users')
  return { ok: true }
}
```

with:

```ts
export async function createUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only an admin can create accounts.' }

  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()
  const role = String(formData.get('role') ?? '') as Role
  const inviterKey = String(formData.get('inviterKey') ?? '').trim() || null
  const side = (String(formData.get('side') ?? '').trim() || null) as 'fatan' | 'sita' | null

  const username = checkUsername(formData.get('username') as string | null)
  if (!username.ok) return { error: username.error }

  // Nothing is ever sent to the address: accounts are created confirmed and the
  // password is handed over in person. Supabase still needs one, so an account
  // created without an email gets a placeholder it can sign in with by username.
  const email =
    String(formData.get('email') ?? '').trim().toLowerCase() || `${username.username}@${PLACEHOLDER_EMAIL_DOMAIN}`

  if (!password || !fullName) return { error: 'Name, username and password are all required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }
  if (!['admin', 'inviter', 'usher', 'viewer'].includes(role)) return { error: 'Pick a role.' }
  if (role === 'inviter' && !inviterKey) return { error: 'An inviter account needs an inviter key.' }

  const admin = getAdminSupabase()
  const { data: taken } = await admin
    .from('profiles')
    .select('user_id')
    .eq('username', username.username)
    .maybeSingle()
  if (taken) return { error: `Username "${username.username}" is already taken.` }

  // Confirmed on creation: these are handed-over accounts, there is no inbox
  // to check and no self-signup flow (docs/PRD.md, "Login").
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) return { error: `Could not create the login: ${error?.message}` }

  const resolvedInviterKey = role === 'inviter' ? inviterKey : null
  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    username: username.username,
    full_name: fullName,
    role,
    inviter_key: resolvedInviterKey,
    side,
  })
  if (profileError) {
    // Roll the login back rather than leaving an account nobody can use.
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: `Could not create the profile: ${profileError.message}` }
  }

  await insertAuditLog(await getServerSupabase(), {
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: 'user.create',
    entityType: 'user',
    entityId: data.user.id,
    entityLabel: fullName,
    diff: buildDiff(
      null,
      { username: username.username, full_name: fullName, role, inviter_key: resolvedInviterKey, side },
      ['username', 'full_name', 'role', 'inviter_key', 'side']
    ),
  })

  revalidatePath('/users')
  return { ok: true }
}
```

- [ ] **Step 3: Rewrite `setUsername`**

Replace the whole function:

```ts
export async function setUsername(formData: FormData): Promise<{ error: string } | { ok: true }> {
  if (!(await requireAdmin())) return { error: 'Only an admin can change a username.' }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Account is required.' }

  const username = checkUsername(formData.get('username') as string | null)
  if (!username.ok) return { error: username.error }

  const { error } = await getAdminSupabase()
    .from('profiles')
    .update({ username: username.username })
    .eq('user_id', userId)
  if (error) {
    // 23505 is the unique constraint on profiles.username.
    if (error.code === '23505') return { error: `Username "${username.username}" is already taken.` }
    return { error: `Could not change the username: ${error.message}` }
  }

  revalidatePath('/users')
  return { ok: true }
}
```

with:

```ts
export async function setUsername(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only an admin can change a username.' }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Account is required.' }

  const username = checkUsername(formData.get('username') as string | null)
  if (!username.ok) return { error: username.error }

  const admin = getAdminSupabase()
  const { data: target } = await admin.from('profiles').select('username, full_name').eq('user_id', userId).single()

  const { error } = await admin.from('profiles').update({ username: username.username }).eq('user_id', userId)
  if (error) {
    // 23505 is the unique constraint on profiles.username.
    if (error.code === '23505') return { error: `Username "${username.username}" is already taken.` }
    return { error: `Could not change the username: ${error.message}` }
  }

  await insertAuditLog(await getServerSupabase(), {
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: 'user.update',
    entityType: 'user',
    entityId: userId,
    entityLabel: target?.full_name ?? userId,
    diff: buildDiff({ username: target?.username ?? null }, { username: username.username }, ['username']),
  })

  revalidatePath('/users')
  return { ok: true }
}
```

- [ ] **Step 4: Rewrite `resetPassword`**

Replace the whole function:

```ts
export async function resetPassword(formData: FormData): Promise<{ error: string } | { ok: true }> {
  if (!(await requireAdmin())) return { error: 'Only an admin can reset a password.' }

  const userId = String(formData.get('userId') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }

  const { error } = await getAdminSupabase().auth.admin.updateUserById(userId, { password })
  if (error) return { error: `Could not reset the password: ${error.message}` }

  revalidatePath('/users')
  return { ok: true }
}
```

with:

```ts
export async function resetPassword(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only an admin can reset a password.' }

  const userId = String(formData.get('userId') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (password.length < 8) return { error: 'Password has to be at least 8 characters.' }

  const admin = getAdminSupabase()
  const { data: target } = await admin.from('profiles').select('full_name').eq('user_id', userId).single()

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return { error: `Could not reset the password: ${error.message}` }

  // Never log the password itself: an empty diff records that the reset
  // happened without recording what it was reset to.
  await insertAuditLog(await getServerSupabase(), {
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: userId,
    entityLabel: target?.full_name ?? userId,
    diff: {},
  })

  revalidatePath('/users')
  return { ok: true }
}
```

- [ ] **Step 5: Rewrite `deleteUser`**

Replace the whole function:

```ts
export async function deleteUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const profile = await requireAdmin()
  if (!profile) return { error: 'Only an admin can delete an account.' }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (userId === profile.userId) return { error: 'You cannot delete your own account.' }

  const admin = getAdminSupabase()
  await admin.from('profiles').delete().eq('user_id', userId)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: `Could not delete the login: ${error.message}` }

  revalidatePath('/users')
  return { ok: true }
}
```

with:

```ts
export async function deleteUser(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const actor = await requireAdmin()
  if (!actor) return { error: 'Only an admin can delete an account.' }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Account is required.' }
  if (userId === actor.userId) return { error: 'You cannot delete your own account.' }

  const admin = getAdminSupabase()
  const { data: target } = await admin
    .from('profiles')
    .select('username, full_name, role, inviter_key, side')
    .eq('user_id', userId)
    .single()

  await admin.from('profiles').delete().eq('user_id', userId)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: `Could not delete the login: ${error.message}` }

  await insertAuditLog(await getServerSupabase(), {
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: 'user.delete',
    entityType: 'user',
    entityId: userId,
    entityLabel: target?.full_name ?? userId,
    diff: buildDiff(
      target
        ? {
            username: target.username,
            full_name: target.full_name,
            role: target.role,
            inviter_key: target.inviter_key,
            side: target.side,
          }
        : null,
      null,
      ['username', 'full_name', 'role', 'inviter_key', 'side']
    ),
  })

  revalidatePath('/users')
  return { ok: true }
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run `npm run dev`, sign in as admin, go to `/users`. Create a test account, reset its password, change its username, then delete it. Query:

```sql
select action, entity_label, diff from audit_log where entity_type = 'user' order by created_at desc limit 4;
```

Expected: `user.create`, `user.password_reset` (empty `diff`), `user.update` (diff containing only `username`), `user.delete`, in reverse chronological order. Confirm the password never appears anywhere in the `diff` column.

- [ ] **Step 8: Commit**

```bash
git add src/server/actions/user-actions.ts
git commit -m "feat(audit): log account create, username change, password reset and delete"
```

---

### Task 8: Waitlist promotion audit logging

**Files:**
- Modify: `src/server/actions/waitlist-actions.ts`
- Modify: `src/app/(dashboard)/waitlist/promote-button.tsx`
- Modify: `src/app/(dashboard)/waitlist/page.tsx:71-76`

**Interfaces:**
- Consumes: `buildDiff` (Task 2), `insertAuditLog` (Task 3), `getCurrentProfile` (Task 4), `WaitlistedEntry` (existing, `src/server/repositories/guest-events-repository.ts:52`, has `guestId` and `name`).

- [ ] **Step 1: Add imports and rewrite `promoteGuest`**

In `src/server/actions/waitlist-actions.ts`, replace:

```ts
import { getServerSupabase } from '../supabase/server-client'
import { listWaitlisted, promoteGuestEventStatus } from '../repositories/guest-events-repository'
import { loadInviterCapacity } from '../repositories/inviters-repository'
import { buildCascade, pickCascadeAnchor, type CascadeContext, type CascadeOffer } from '@/domain/waitlist'
import { checkPromotion } from '@/domain/waitlist'
import type { WaitlistedEntry } from '../repositories/guest-events-repository'
```

with:

```ts
import { getServerSupabase } from '../supabase/server-client'
import { listWaitlisted, promoteGuestEventStatus } from '../repositories/guest-events-repository'
import { loadInviterCapacity } from '../repositories/inviters-repository'
import { buildCascade, pickCascadeAnchor, type CascadeContext, type CascadeOffer } from '@/domain/waitlist'
import { checkPromotion } from '@/domain/waitlist'
import { buildDiff } from '@/domain/audit'
import { insertAuditLog } from '../repositories/audit-log-repository'
import { getCurrentProfile } from './auth-actions'
import type { WaitlistedEntry } from '../repositories/guest-events-repository'
```

Then replace the whole `promoteGuest` function:

```ts
export async function promoteGuest(formData: FormData) {
  const supabase = await getServerSupabase()
  const guestEventId = String(formData.get('guestEventId') ?? '')
  const inviterKey = String(formData.get('inviterKey') ?? '')
  const event = String(formData.get('event') ?? '') as 'akad' | 'resepsi'

  const state = await loadInviterCapacity(supabase, inviterKey, event)
  const guestPax = Number(formData.get('guestPax'))
  const decision = checkPromotion(state.cap - state.confirmedPax, guestPax)

  await promoteGuestEventStatus(supabase, guestEventId)

  // No revalidatePath here on purpose: the promoted row's client component
  // needs to render its own "Promoted" + over-cap flag state for the admin
  // to actually see it. Revalidating immediately would refetch the waitlist
  // and drop the row (and its flag) before it could be read. The page has a
  // manual "Refresh" link for admins to see the updated list afterward.
  return {
    flags: decision.overCap
      ? [`${inviterKey} is now over cap on ${event} after this promotion.`]
      : [],
  }
}
```

with:

```ts
export async function promoteGuest(formData: FormData) {
  const supabase = await getServerSupabase()
  const guestEventId = String(formData.get('guestEventId') ?? '')
  const guestId = String(formData.get('guestId') ?? '')
  const guestName = String(formData.get('guestName') ?? '')
  const inviterKey = String(formData.get('inviterKey') ?? '')
  const event = String(formData.get('event') ?? '') as 'akad' | 'resepsi'

  const state = await loadInviterCapacity(supabase, inviterKey, event)
  const guestPax = Number(formData.get('guestPax'))
  const decision = checkPromotion(state.cap - state.confirmedPax, guestPax)

  await promoteGuestEventStatus(supabase, guestEventId)

  const profile = await getCurrentProfile()
  if (profile) {
    await insertAuditLog(supabase, {
      actorId: profile.userId,
      actorName: profile.fullName,
      actorRole: profile.role,
      action: 'waitlist.promote',
      entityType: 'guest_event',
      entityId: guestEventId,
      entityLabel: `${guestName || guestId} (${event})`,
      diff: buildDiff({ invite_status: 'waitlisted' }, { invite_status: 'confirmed' }, ['invite_status']),
    })
  }

  // No revalidatePath here on purpose: the promoted row's client component
  // needs to render its own "Promoted" + over-cap flag state for the admin
  // to actually see it. Revalidating immediately would refetch the waitlist
  // and drop the row (and its flag) before it could be read. The page has a
  // manual "Refresh" link for admins to see the updated list afterward.
  return {
    flags: decision.overCap
      ? [`${inviterKey} is now over cap on ${event} after this promotion.`]
      : [],
  }
}
```

- [ ] **Step 2: Pass `guestId` and `guestName` through the form**

In `src/app/(dashboard)/waitlist/promote-button.tsx`, replace:

```tsx
export function PromoteButton({
  guestEventId,
  inviterKey,
  event,
  guestPax,
}: {
  guestEventId: string
  inviterKey: string
  event: 'akad' | 'resepsi'
  guestPax: number
}) {
  const [state, formAction] = useActionState(submitAction, {})

  if (state.promoted) {
    return (
      <div className="text-right text-sm">
        <p className="font-semibold text-emerald-600">Promoted</p>
        {state.flags && state.flags.length > 0 ? (
          <p className="text-destructive">{state.flags[0]}</p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="guestEventId" value={guestEventId} />
      <input type="hidden" name="inviterKey" value={inviterKey} />
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="guestPax" value={guestPax} />
      <Button type="submit" size="sm">
        Promote
      </Button>
    </form>
  )
}
```

with:

```tsx
export function PromoteButton({
  guestEventId,
  guestId,
  guestName,
  inviterKey,
  event,
  guestPax,
}: {
  guestEventId: string
  guestId: string
  guestName: string
  inviterKey: string
  event: 'akad' | 'resepsi'
  guestPax: number
}) {
  const [state, formAction] = useActionState(submitAction, {})

  if (state.promoted) {
    return (
      <div className="text-right text-sm">
        <p className="font-semibold text-emerald-600">Promoted</p>
        {state.flags && state.flags.length > 0 ? (
          <p className="text-destructive">{state.flags[0]}</p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="guestEventId" value={guestEventId} />
      <input type="hidden" name="guestId" value={guestId} />
      <input type="hidden" name="guestName" value={guestName} />
      <input type="hidden" name="inviterKey" value={inviterKey} />
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="guestPax" value={guestPax} />
      <Button type="submit" size="sm">
        Promote
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Pass the new props from the waitlist page**

In `src/app/(dashboard)/waitlist/page.tsx`, replace:

```tsx
                      <PromoteButton
                        guestEventId={guest.guestEventId}
                        inviterKey={guest.inviterKey}
                        event={event}
                        guestPax={guest.pax}
                      />
```

with:

```tsx
                      <PromoteButton
                        guestEventId={guest.guestEventId}
                        guestId={guest.guestId}
                        guestName={guest.name}
                        inviterKey={guest.inviterKey}
                        event={event}
                        guestPax={guest.pax}
                      />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, sign in as admin, go to `/waitlist`, promote one waitlisted guest. Query:

```sql
select action, entity_label, diff from audit_log where action = 'waitlist.promote' order by created_at desc limit 1;
```

Expected: one row, `entity_label` containing the guest's name and event, `diff` = `{"invite_status": {"old": "waitlisted", "new": "confirmed"}}`.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/waitlist-actions.ts src/app/\(dashboard\)/waitlist/promote-button.tsx src/app/\(dashboard\)/waitlist/page.tsx
git commit -m "feat(audit): log waitlist promotions"
```

---

### Task 9: `/audit` admin screen

**Files:**
- Create: `src/app/(dashboard)/audit/page.tsx`
- Modify: `src/app/(dashboard)/app-sidebar.tsx:5,28-36`

**Interfaces:**
- Consumes: `listAuditLog` (Task 3), `getCurrentProfile` (existing).

- [ ] **Step 1: Write the page**

```tsx
// src/app/(dashboard)/audit/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listAuditLog } from '@/server/repositories/audit-log-repository'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ENTITY_TYPES = ['guest', 'inviter_caps', 'side_caps', 'guest_event', 'user'] as const

const fieldClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; actor?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const { entityType, actor } = await searchParams
  const supabase = await getServerSupabase()
  const rows = await listAuditLog(supabase, { entityType, actorName: actor })
  const actors = Array.from(new Set(rows.map((row) => row.actorName))).sort()

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Every guest, cap, account and waitlist-promotion change. Read-only: nothing here can be edited or removed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rows.length} entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="entityType" className="text-xs text-muted-foreground">
                Entity
              </label>
              <select id="entityType" name="entityType" defaultValue={entityType ?? ''} className={fieldClass}>
                <option value="">All</option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="actor" className="text-xs text-muted-foreground">
                Actor
              </label>
              <select id="actor" name="actor" defaultValue={actor ?? ''} className={fieldClass}>
                <option value="">All</option>
                {actors.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="h-9 rounded-md border px-3 text-sm">
              Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries match this filter.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.entityLabel}</span>
                      <Badge variant="secondary">{row.action}</Badge>
                      <span className="text-muted-foreground">
                        by {row.actorName} ({row.actorRole})
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
                  </div>
                  {Object.keys(row.diff).length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        {Object.keys(row.diff).length} field(s) changed
                      </summary>
                      <ul className="mt-1 ml-4 space-y-0.5 text-xs text-muted-foreground">
                        {Object.entries(row.diff).map(([field, change]) => (
                          <li key={field}>
                            <span className="font-mono">{field}</span>: {String(change.old)} to{' '}
                            {String(change.new)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 2: Add the sidebar link**

In `src/app/(dashboard)/app-sidebar.tsx`, replace:

```tsx
import { LayoutDashboard, Users, ListOrdered, SlidersHorizontal, KeyRound, LogOut } from 'lucide-react'
```

with:

```tsx
import { LayoutDashboard, Users, ListOrdered, SlidersHorizontal, KeyRound, History, LogOut } from 'lucide-react'
```

and replace:

```tsx
  const items = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    // Ushers have zero guests-table RLS access — hide the link rather than
    // send them to a page that would render an empty, misleading table.
    { href: '/guests', label: 'Guests', icon: Users, show: profile.role !== 'usher' },
    { href: '/waitlist', label: 'Waitlist', icon: ListOrdered, show: profile.role === 'admin' },
    { href: '/caps', label: 'Caps', icon: SlidersHorizontal, show: profile.role === 'admin' },
    { href: '/users', label: 'Accounts', icon: KeyRound, show: profile.role === 'admin' },
  ]
```

with:

```tsx
  const items = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    // Ushers have zero guests-table RLS access — hide the link rather than
    // send them to a page that would render an empty, misleading table.
    { href: '/guests', label: 'Guests', icon: Users, show: profile.role !== 'usher' },
    { href: '/waitlist', label: 'Waitlist', icon: ListOrdered, show: profile.role === 'admin' },
    { href: '/caps', label: 'Caps', icon: SlidersHorizontal, show: profile.role === 'admin' },
    { href: '/users', label: 'Accounts', icon: KeyRound, show: profile.role === 'admin' },
    { href: '/audit', label: 'Audit', icon: History, show: profile.role === 'admin' },
  ]
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. Sign in as admin: confirm "Audit" appears in the sidebar, `/audit` lists the entries created during Tasks 5-8's manual verification, the entity-type and actor filters narrow the list, and expanding a row's "N field(s) changed" shows the old and new values. Sign in as an inviter or usher: confirm `/audit` redirects to `/dashboard` and no sidebar link is shown.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/audit/page.tsx" "src/app/(dashboard)/app-sidebar.tsx"
git commit -m "feat(audit): add admin-only /audit screen"
```

---

## Self-Review Notes

- **Spec coverage:** D1 (Task 1 schema), D2 (Task 2 `buildDiff`), D3 (Tasks 5, 8 combine guest+event and pax/cap fields into one entry), D4 (Tasks 5-8 call `insertAuditLog` explicitly, no trigger; Task 7 always inserts via `getServerSupabase()` even though the mutation itself uses `getAdminSupabase()`), D5 (Task 1's RLS policies, verified by the "nobody can update or delete" test).
- **Type consistency:** `AuditEntry`/`insertAuditLog` (Task 3) is the single shape every call site (Tasks 5-8) constructs; field names (`actorId`, `actorName`, `actorRole`, `action`, `entityType`, `entityId`, `entityLabel`, `diff`) are used identically everywhere. `CurrentProfile.fullName` (Task 4) is read as `profile.fullName` / `actor.fullName` consistently.
- **Scope check:** single subsystem (audit trail across four existing mutation surfaces), no decomposition needed.
