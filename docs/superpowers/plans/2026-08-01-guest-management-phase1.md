# Guest Management (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Sheet with a Next.js + Supabase app covering auth, schema/RLS for all four roles, one-shot sheet import, guest CRUD, phone backfill, a derived-capacity quota engine, per-event waitlist with slot-fill cascade, and a dashboard skeleton.

**Architecture:** Three layers per `docs/TECH_SPEC.md`: pure `src/domain/` business rules (lint-enforced no IO), `src/server/` repositories + server actions that load state, call a domain function, then persist regardless of the decision, and thin `src/app/` App Router screens. Postgres RLS is the second wall behind domain logic; DB constraints are the third, for concurrency.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind), Supabase (Postgres, RLS, email+password auth, `@supabase/ssr`), Vitest, Supabase CLI for local dev/migrations, `googleapis` for the one-shot sheet import. No UI or form library — Phase 1 screens use native `<form>` + Server Actions, so the "pick boring and popular" decision is deferred without blocking anything (owner's explicit ask-first list: UI library, form library, overlapping deps).

## Global Constraints

- `src/domain/` may not import `src/server/`, `supabase-js`, `next`, or any React package — enforced by ESLint `no-restricted-imports`, not discipline (`CLAUDE.md`, `TECH_SPEC.md` 2.1).
- Domain functions decide what a write *means*, never whether it happens. Over-cap/over-promotion writes still succeed and return flags (`PRD.md` "Warn, allow, flag").
- Capacity is always derived at read time (`cap - SUM(pax) WHERE confirmed AND != not_attending`), never a stored counter (`DATA_MODEL.md`).
- `souvenir_claims.guest_id` is `UNIQUE` at the database level. Never remove it, never upsert around a violation.
- `SUPABASE_SECRET_KEY` is server-only: only the import script and (later, Phase 2) the unauthenticated `/rsvp/[token]` route may use it. Never `NEXT_PUBLIC_`, never logged, never in a client component.
- Never write `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` anywhere, including comments — those are the deprecated legacy key names. Current format only: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`), `SUPABASE_SECRET_KEY` (`sb_secret_...`).
- The Google Sheet stays live during development. Import runs once, at cut-over. Read columns by header name, never position. Never hardcode or assert on sheet snapshot numbers (330 entries, 578 pax, etc. are 2026-08-01 scale references only). Duplicate names import as separate guests.
- Test-first only for: `domain/quota.ts`, `domain/waitlist.ts`, `domain/import-mapper.ts`, and RLS policies (one integration test per role per table). No component tests, no E2E tests. (`domain/rsvp.ts` and `domain/souvenir.ts` are Phase 2/3 — not built in this plan.)
- Domain layer before screens, no exception.
- Out of scope for this plan (Phase 2/3, do not build): `/rsvp/[token]`, WhatsApp sending, QR generation, check-in scanning, souvenir claim UI, visual design. The `checkin_events`, `souvenir_claims`, and `wa_sends` *tables and RLS* are in scope (schema-complete per `DATA_MODEL.md`); the screens that write to them are not.

---

## File Structure

```
src/
  domain/
    quota.ts               capacity math, over-cap detection
    waitlist.ts             cascade tiers, promotion eligibility
    import-mapper.ts        sheet row -> guest + guest_events
  server/
    supabase/
      env.ts                 typed env accessors, throws on missing var
      server-client.ts        @supabase/ssr client bound to user session (RLS applies)
      admin-client.ts         secret-key client (RLS bypass) — import script only in this plan
    repositories/
      inviters-repository.ts
      guests-repository.ts
      guest-events-repository.ts
    actions/
      auth-actions.ts
      guest-actions.ts
      waitlist-actions.ts
  app/
    login/page.tsx
    (dashboard)/
      layout.tsx             session + role guard
      dashboard/page.tsx
      guests/page.tsx
      guests/new/page.tsx
      guests/[id]/edit/page.tsx
      waitlist/page.tsx
    middleware.ts (project root, not under app/)
supabase/
  migrations/
    <ts>_profiles_inviters_side_caps.sql
    <ts>_guests_guest_events.sql
    <ts>_checkin_souvenir_wa_sends.sql
scripts/
  import-sheet.ts
  create-user.ts
tests/
  lint/domain-purity.test.ts
  rls/
    setup.ts                 local Supabase status parsing, test-user helpers
    profiles-inviters-side-caps.test.ts
    guests-guest-events.test.ts
    checkin-souvenir-wa-sends.test.ts
```

---

### Task 1: Next.js scaffold

**Files:**
- Move aside: `CLAUDE.md`, `AGENTS.md`, `.env.example` (repo root)
- Create: everything `create-next-app` generates (`package.json`, `next.config.ts`, `tsconfig.json`, `src/app/*`, `eslint.config.mjs`, `.gitignore`, etc.)
- Modify: `.gitignore` (merge generated with existing)

**Interfaces:**
- Produces: `src/app/` App Router tree, `tsconfig.json` with `@/*` -> `./src/*` path alias, Tailwind wired into `src/app/globals.css`.

- [ ] **Step 1: Move the three non-standard root files aside**

```bash
mkdir -p /tmp/scaffold-stash
mv CLAUDE.md AGENTS.md .env.example /tmp/scaffold-stash/
```

- [ ] **Step 2: Run create-next-app against the now-empty-looking root**

```bash
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --turbopack
```

Answer any remaining prompts: yes to overwrite nothing (directory has only `.git`, `docs/`, `.claude/`, `.gitignore` left — `create-next-app` will ask about the existing `.gitignore`; keep both, reconciled in Step 4).

- [ ] **Step 3: Move the three files back**

```bash
mv /tmp/scaffold-stash/CLAUDE.md /tmp/scaffold-stash/AGENTS.md /tmp/scaffold-stash/.env.example .
rmdir /tmp/scaffold-stash
```

- [ ] **Step 4: Reconcile `.gitignore`**

Read the generated `.gitignore`, then edit it (not overwrite) to re-add the guest-data-safety block that was in the pre-scaffold version:

```gitignore
# guest data must never be committed
*.csv
*.xlsx
*.sql.gz
dump*.sql
guests*.json

# supabase local
supabase/.branches
supabase/.temp
supabase/.env
```

Confirm `.env*` and `!.env.example` are still present (Next.js's generated `.gitignore` already has an `.env*` block — check it matches the intent, don't duplicate).

- [ ] **Step 5: Verify the app boots**

```bash
npm run dev &
sleep 3
curl -sf http://localhost:3000 > /dev/null && echo "OK"
kill %1
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js App Router project"
```

---

### Task 2: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script, devDependencies)

**Interfaces:**
- Produces: `npm test` runs Vitest once; `npm run test:watch` for watch mode. Later tasks' `*.test.ts` files under `src/domain/` and `tests/` are picked up by default include globs.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitest/ui
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Write a throwaway smoke test to prove the runner works**

Create `src/domain/__smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest smoke test', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

```bash
npm test
```

Expected: 1 passed.

- [ ] **Step 6: Delete the smoke test**

```bash
rm src/domain/__smoke.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Vitest"
```

---

### Task 3: ESLint no-restricted-imports rule for `src/domain/` purity

**Files:**
- Modify: `eslint.config.mjs`
- Test: `tests/lint/domain-purity.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: an ESLint override that fires `no-restricted-imports` on any file under `src/domain/**` importing `@supabase/supabase-js`, `next`, `next/*`, `react`, `react-dom`, or anything under `src/server/`. Later tasks rely on this to fail CI/lint if domain purity is violated.

- [ ] **Step 1: Write the failing test**

Uses ESLint's Node API to lint an in-memory fixture, so no throwaway file has to be created and cleaned up on disk.

```ts
// tests/lint/domain-purity.test.ts
import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'

async function lintFixture(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(code, { filePath })
  return result
}

describe('domain purity lint rule', () => {
  it('flags supabase-js imports inside src/domain', async () => {
    const result = await lintFixture(
      'src/domain/__fixture_supabase_import.ts',
      `import { createClient } from '@supabase/supabase-js'\nexport const x = createClient\n`
    )
    const ruleIds = result.messages.map((m) => m.ruleId)
    expect(ruleIds).toContain('no-restricted-imports')
  })

  it('flags src/server imports inside src/domain', async () => {
    const result = await lintFixture(
      'src/domain/__fixture_server_import.ts',
      `import { loadState } from '../server/repositories/guests-repository'\nexport const x = loadState\n`
    )
    const ruleIds = result.messages.map((m) => m.ruleId)
    expect(ruleIds).toContain('no-restricted-imports')
  })

  it('allows plain TypeScript imports inside src/domain', async () => {
    const result = await lintFixture(
      'src/domain/__fixture_clean.ts',
      `export function add(a: number, b: number) { return a + b }\n`
    )
    const ruleIds = result.messages.map((m) => m.ruleId)
    expect(ruleIds).not.toContain('no-restricted-imports')
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npm test -- tests/lint/domain-purity.test.ts
```

Expected: first two assertions FAIL (`ruleIds` is empty — no override exists yet).

- [ ] **Step 3: Add the ESLint override**

Next's generated `eslint.config.mjs` uses flat config via `FlatCompat`. Append a plain flat-config object (no compat needed for a native rule):

```js
// eslint.config.mjs — add after the existing `export default [...]` entries, inside the array
{
  files: ['src/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: '@supabase/supabase-js', message: 'src/domain/ must stay pure — no supabase-js.' },
          { name: 'next', message: 'src/domain/ must stay pure — no next.' },
          { name: 'react', message: 'src/domain/ must stay pure — no react.' },
          { name: 'react-dom', message: 'src/domain/ must stay pure — no react-dom.' },
        ],
        patterns: [
          {
            group: ['next/*', '../server/*', '../../server/*', '**/src/server/*'],
            message: 'src/domain/ must stay pure — no src/server, no next.',
          },
        ],
      },
    ],
  },
},
```

- [ ] **Step 4: Run the test again, confirm it passes**

```bash
npm test -- tests/lint/domain-purity.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: lint-enforce src/domain purity"
```

---

### Task 4: Supabase client wiring + migration 1 (`profiles`, `inviters`, `side_caps`)

**Files:**
- Create: `src/server/supabase/env.ts`, `src/server/supabase/server-client.ts`, `src/server/supabase/admin-client.ts`
- Create: `supabase/migrations/<timestamp>_profiles_inviters_side_caps.sql`
- Modify: `.env.local` (owner pastes real values, agent copies `.env.example` -> `.env.local` and stops)

**Interfaces:**
- Produces: `getServerSupabase()` — async, reads cookies, returns a session-bound client (RLS applies as the logged-in user). `getAdminSupabase()` — returns a secret-key client (RLS bypassed). Both throw a clear error if their required env vars are missing, per `src/server/supabase/env.ts`'s `requireEnv(name: string): string`.
- Later tasks (repositories) call `getServerSupabase()`; the import script (Task 15) calls `getAdminSupabase()`.

- [ ] **Step 1: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase
```

- [ ] **Step 2: Copy the env template**

```bash
cp .env.example .env.local
```

Tell the owner: "`.env.local` created from `.env.example`. Paste in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` from the Supabase dashboard (Settings -> API -> the current-format keys, not the legacy anon/service_role ones) before running anything that touches the database." Do not attempt to fetch these keys.

- [ ] **Step 3: Write the env accessor**

```ts
// src/server/supabase/env.ts
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Check .env.local against .env.example.`)
  }
  return value
}
```

- [ ] **Step 4: Write the session-bound server client**

```ts
// src/server/supabase/server-client.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireEnv } from './env'

export async function getServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // called from a Server Component without a mutable response —
            // middleware refreshes the session instead, safe to ignore here
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: Write the admin (secret-key) client**

```ts
// src/server/supabase/admin-client.ts
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env'

/**
 * Bypasses RLS entirely. Restricted to scripts/import-sheet.ts in this plan
 * (Phase 2 adds the unauthenticated /rsvp/[token] route as the only other caller).
 * Never call this from a route that renders for a logged-in user.
 */
export function getAdminSupabase() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 6: Init and link the Supabase CLI project**

```bash
npx supabase init
npx supabase link --project-ref elzewxhtkqqfdjrvpahv
```

This will prompt for the database password (owner has it from project creation) or an access token login (`npx supabase login` first if not already authenticated). Ask the owner if either prompt blocks.

- [ ] **Step 7: Write migration 1**

```bash
npx supabase migration new profiles_inviters_side_caps
```

Edit the generated file (`supabase/migrations/<timestamp>_profiles_inviters_side_caps.sql`):

```sql
-- profiles, inviters, side_caps: identity and cap tables, plus the RLS
-- helper functions every later policy depends on.

create extension if not exists pgcrypto;

create table inviters (
  key text primary key,
  side text not null check (side in ('fatan', 'sita')),
  akad_cap int not null,
  resepsi_cap int not null
);

create table side_caps (
  side text primary key check (side in ('fatan', 'sita')),
  vip_cap int not null
);

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'inviter', 'usher', 'viewer')),
  inviter_key text references inviters (key),
  side text check (side in ('fatan', 'sita')),
  constraint inviter_role_has_inviter_key
    check (role <> 'inviter' or inviter_key is not null)
);

-- Seed values as of 2026-08-01 (docs/DATA_MODEL.md). Caps are admin-editable
-- afterwards; this is the starting point, not a re-assertable snapshot.
insert into inviters (key, side, akad_cap, resepsi_cap) values
  ('Fatan', 'fatan', 20, 90),
  ('Mama Fatan', 'fatan', 40, 80),
  ('Papa Fatan', 'fatan', 40, 80),
  ('Sita', 'sita', 20, 90),
  ('Mama Sita', 'sita', 40, 80),
  ('Papa Sita', 'sita', 40, 80);

insert into side_caps (side, vip_cap) values
  ('fatan', 25),
  ('sita', 25);

-- RLS helpers. security definer so a policy on `profiles` itself doesn't
-- recurse into RLS when reading the caller's own role.
create function current_profile_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

create function current_inviter_key() returns text
  language sql stable security definer set search_path = public as $$
  select inviter_key from profiles where user_id = auth.uid()
$$;

alter table profiles enable row level security;
alter table inviters enable row level security;
alter table side_caps enable row level security;

create policy profiles_admin_all on profiles for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy profiles_self_read on profiles for select
  using (user_id = auth.uid());

create policy inviters_admin_all on inviters for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy inviters_read_all on inviters for select
  using (current_profile_role() in ('inviter', 'viewer'));

create policy side_caps_admin_all on side_caps for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy side_caps_read_all on side_caps for select
  using (current_profile_role() in ('inviter', 'viewer'));
```

- [ ] **Step 8: Verify the migration applies cleanly on a local stack**

```bash
npx supabase start
npx supabase db reset
```

Expected: no errors; final output lists the migration as applied.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Supabase client wiring + profiles/inviters/side_caps schema"
```

---

### Task 5: Migration 2 (`guests`, `guest_events`)

**Files:**
- Create: `supabase/migrations/<timestamp>_guests_guest_events.sql`

**Interfaces:**
- Produces: `guests` and `guest_events` tables, the `UNIQUE(guest_id, event)` and `UNIQUE(rsvp_token)` constraints, a trigger enforcing `pax_confirmed <= guests.pax`, and full RLS for both tables.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new guests_guest_events
```

- [ ] **Step 2: Write it**

```sql
-- guests, guest_events: the core write path. RLS scoping predicate here
-- (inviter_key = current_inviter_key()) is the single most important
-- policy in the system per docs/DATA_MODEL.md.

create table guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pax int not null check (pax > 0),
  side text not null check (side in ('fatan', 'sita')),
  inviter_key text not null references inviters (key),
  type text not null check (type in ('family', 'friend')),
  note text,
  phone text,
  rsvp_token uuid not null unique default gen_random_uuid(),
  is_vip boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table guest_events (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id) on delete cascade,
  event text not null check (event in ('akad', 'resepsi')),
  invite_status text not null default 'confirmed' check (invite_status in ('confirmed', 'waitlisted')),
  waitlist_rank int,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'attending', 'not_attending')),
  pax_confirmed int,
  responded_at timestamptz,
  responded_via text check (responded_via in ('guest_form', 'admin_manual')),
  responded_by uuid references profiles (user_id),
  unique (guest_id, event)
);

-- pax_confirmed <= guests.pax can't be a CHECK constraint (no subqueries
-- allowed), so it's a trigger. docs/DATA_MODEL.md: "via trigger or app".
create function validate_pax_confirmed() returns trigger
  language plpgsql as $$
declare
  invited_pax int;
begin
  if new.pax_confirmed is null then
    return new;
  end if;
  select pax into invited_pax from guests where id = new.guest_id;
  if new.pax_confirmed > invited_pax then
    raise exception 'pax_confirmed (%) exceeds invited pax (%) for guest %',
      new.pax_confirmed, invited_pax, new.guest_id;
  end if;
  return new;
end;
$$;

create trigger guest_events_pax_confirmed_check
  before insert or update on guest_events
  for each row execute function validate_pax_confirmed();

create function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger guests_set_updated_at
  before update on guests
  for each row execute function set_updated_at();

alter table guests enable row level security;
alter table guest_events enable row level security;

create policy guests_admin_all on guests for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy guests_inviter_own on guests for all
  using (current_profile_role() = 'inviter' and inviter_key = current_inviter_key())
  with check (current_profile_role() = 'inviter' and inviter_key = current_inviter_key());
create policy guests_viewer_read on guests for select
  using (current_profile_role() = 'viewer');
-- Ushers get no policy here by design (docs/DATA_MODEL.md: "read via
-- token/scan path only"). That path is a Phase 3 SECURITY DEFINER RPC
-- resolving a single guest by rsvp_token, not a direct table grant.

create policy guest_events_admin_all on guest_events for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy guest_events_inviter_own on guest_events for all
  using (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = guest_events.guest_id and g.inviter_key = current_inviter_key()
    )
  )
  with check (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = guest_events.guest_id and g.inviter_key = current_inviter_key()
    )
  );
create policy guest_events_viewer_read on guest_events for select
  using (current_profile_role() = 'viewer');
```

- [ ] **Step 3: Apply and verify**

```bash
npx supabase db reset
```

Expected: applies cleanly, no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: guests + guest_events schema and RLS"
```

---

### Task 6: Migration 3 (`checkin_events`, `souvenir_claims`, `wa_sends`)

**Files:**
- Create: `supabase/migrations/<timestamp>_checkin_souvenir_wa_sends.sql`

**Interfaces:**
- Produces: the three remaining tables from `DATA_MODEL.md`, including the load-bearing `UNIQUE` constraint on `souvenir_claims.guest_id`. Screens that write to these tables are Phase 3 and not built in this plan — this task is schema-only, matching Phase 1 scope item 1 ("schema migrations, RLS policies for all four roles").

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new checkin_souvenir_wa_sends
```

- [ ] **Step 2: Write it**

```sql
-- checkin_events, souvenir_claims, wa_sends: schema-complete now so Phase 3
-- adds screens against a stable model, not new tables. souvenir_claims's
-- UNIQUE(guest_id) is what makes a double handout impossible under
-- concurrent scans — do not remove it, do not upsert around a violation.

create table checkin_events (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id),
  event text not null check (event in ('akad', 'resepsi')),
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid not null references profiles (user_id)
);

create table souvenir_claims (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references guests (id),
  claimed_at timestamptz not null default now(),
  claimed_by uuid not null references profiles (user_id),
  claimed_via text not null check (claimed_via in ('akad_table', 'resepsi_scan'))
);

create table wa_sends (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id),
  kind text not null check (kind in ('invite', 'qr_checkin')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'link_opened')),
  provider text not null check (provider in ('fake', 'fonnte', 'meta', 'waha')),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  error_message text
);

create trigger wa_sends_set_updated_at
  before update on wa_sends
  for each row execute function set_updated_at();

alter table checkin_events enable row level security;
alter table souvenir_claims enable row level security;
alter table wa_sends enable row level security;

create policy checkin_events_admin_all on checkin_events for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy checkin_events_usher_insert on checkin_events for insert
  with check (current_profile_role() = 'usher');
create policy checkin_events_usher_read on checkin_events for select
  using (current_profile_role() = 'usher');
create policy checkin_events_viewer_read on checkin_events for select
  using (current_profile_role() = 'viewer');

create policy souvenir_claims_admin_all on souvenir_claims for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy souvenir_claims_usher_insert on souvenir_claims for insert
  with check (current_profile_role() = 'usher');
create policy souvenir_claims_usher_read on souvenir_claims for select
  using (current_profile_role() = 'usher');
create policy souvenir_claims_viewer_read on souvenir_claims for select
  using (current_profile_role() = 'viewer');

create policy wa_sends_admin_all on wa_sends for all
  using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');
create policy wa_sends_inviter_read on wa_sends for select
  using (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = wa_sends.guest_id and g.inviter_key = current_inviter_key()
    )
  );
create policy wa_sends_viewer_read on wa_sends for select
  using (current_profile_role() = 'viewer');
```

- [ ] **Step 3: Apply and verify**

```bash
npx supabase db reset
```

Expected: applies cleanly.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: checkin_events, souvenir_claims, wa_sends schema and RLS"
```

---

### Task 7: RLS integration test harness

**Files:**
- Create: `tests/rls/setup.ts`

**Interfaces:**
- Produces: `getLocalStackConfig(): { url: string; publishableKey: string; adminKey: string }` (reads `supabase status -o json`, throws if the local stack isn't running); `createTestUser(admin, { email, role, inviterKey?, side? }): Promise<{ userId: string; email: string; password: string }>` (creates an `auth.users` row via the admin client, inserts the matching `profiles` row, returns credentials); `clientAs(config, email, password): Promise<SupabaseClient>` (signs in, returns a session-bound client — the same shape a real logged-in user's requests would use, so it exercises RLS exactly as production does).
- Later tasks (8, 9, 10) import these to build one test file per table group.

- [ ] **Step 1: Write the harness**

```ts
// tests/rls/setup.ts
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type LocalStackConfig = {
  url: string
  publishableKey: string
  adminKey: string
}

/**
 * Parses `supabase status -o json`. Field names below (API_URL, ANON_KEY,
 * SERVICE_ROLE_KEY) are the Supabase CLI's own local-stack JSON schema —
 * unrelated to this project's key-format policy, which governs env vars
 * for the *hosted* project only. Nothing here is written to .env.local.
 */
export function getLocalStackConfig(): LocalStackConfig {
  let raw: string
  try {
    raw = execSync('npx supabase status -o json', { encoding: 'utf-8' })
  } catch {
    throw new Error('Local Supabase stack is not running. Run `npx supabase start` first.')
  }
  const parsed = JSON.parse(raw)
  return {
    url: parsed.API_URL,
    publishableKey: parsed.ANON_KEY,
    adminKey: parsed.SERVICE_ROLE_KEY,
  }
}

export type TestRole = 'admin' | 'inviter' | 'usher' | 'viewer'

export type CreateTestUserInput = {
  email: string
  role: TestRole
  inviterKey?: string
  side?: 'fatan' | 'sita'
}

const TEST_PASSWORD = 'rls-test-password-only'

export async function createTestUser(admin: SupabaseClient, input: CreateTestUserInput) {
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${input.email}: ${error?.message}`)
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    full_name: input.email,
    role: input.role,
    inviter_key: input.inviterKey ?? null,
    side: input.side ?? null,
  })
  if (profileError) {
    throw new Error(`Failed to create profile for ${input.email}: ${profileError.message}`)
  }

  return { userId: data.user.id, email: input.email, password: TEST_PASSWORD }
}

export async function clientAs(config: LocalStackConfig, email: string, password: string) {
  const client = createClient(config.url, config.publishableKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  }
  return client
}

export function getAdminClient(config: LocalStackConfig) {
  return createClient(config.url, config.adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 2: Sanity-check the harness against the running local stack**

```bash
npx supabase start
```

```ts
// scratch check, not committed — run with `npx tsx` or paste into a throwaway test
import { getLocalStackConfig, getAdminClient, createTestUser } from './tests/rls/setup'
const config = getLocalStackConfig()
const admin = getAdminClient(config)
await createTestUser(admin, { email: 'sanity@example.com', role: 'admin' })
console.log('OK')
```

Expected: prints `OK` with no thrown error. Delete the scratch file after confirming.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: RLS integration test harness"
```

---

### Task 8: RLS tests — `profiles`, `inviters`, `side_caps`

**Files:**
- Test: `tests/rls/profiles-inviters-side-caps.test.ts`

**Interfaces:**
- Consumes: `getLocalStackConfig`, `getAdminClient`, `createTestUser`, `clientAs` from Task 7.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rls/profiles-inviters-side-caps.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { getLocalStackConfig, getAdminClient, createTestUser, clientAs, type LocalStackConfig } from './setup'

let config: LocalStackConfig

beforeAll(() => {
  config = getLocalStackConfig()
})

describe('profiles RLS', () => {
  it('admin can read another user\'s profile row', async () => {
    const admin = getAdminClient(config)
    const other = await createTestUser(admin, { email: `other-${Date.now()}@example.com`, role: 'viewer' })
    const adminUser = await createTestUser(admin, { email: `admin-${Date.now()}@example.com`, role: 'admin' })
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    const { data, error } = await asAdmin.from('profiles').select('*').eq('user_id', other.userId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('inviter can read only their own profile row', async () => {
    const admin = getAdminClient(config)
    const inviter = await createTestUser(admin, {
      email: `inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const other = await createTestUser(admin, { email: `other2-${Date.now()}@example.com`, role: 'viewer' })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const own = await asInviter.from('profiles').select('*').eq('user_id', inviter.userId)
    expect(own.data).toHaveLength(1)

    const others = await asInviter.from('profiles').select('*').eq('user_id', other.userId)
    expect(others.data).toHaveLength(0)
  })
})

describe('inviters RLS', () => {
  it('usher cannot read inviters', async () => {
    const admin = getAdminClient(config)
    const usher = await createTestUser(admin, { email: `usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data } = await asUsher.from('inviters').select('*')
    expect(data).toHaveLength(0)
  })

  it('viewer can read all inviters', async () => {
    const admin = getAdminClient(config)
    const viewer = await createTestUser(admin, { email: `viewer-${Date.now()}@example.com`, role: 'viewer' })
    const asViewer = await clientAs(config, viewer.email, viewer.password)

    const { data } = await asViewer.from('inviters').select('*')
    expect(data?.length).toBe(6)
  })

  it('inviter cannot write to inviters', async () => {
    const admin = getAdminClient(config)
    const inviter = await createTestUser(admin, {
      email: `inviter2-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter.from('inviters').update({ akad_cap: 999 }).eq('key', 'Sita')
    // RLS denies the row silently (0 rows affected) rather than erroring —
    // assert nothing actually changed.
    const check = await getAdminClient(config).from('inviters').select('akad_cap').eq('key', 'Sita').single()
    expect(check.data?.akad_cap).toBe(20)
    expect(error).toBeNull()
  })
})

describe('side_caps RLS', () => {
  it('admin can update vip_cap', async () => {
    const admin = getAdminClient(config)
    const adminUser = await createTestUser(admin, { email: `admin2-${Date.now()}@example.com`, role: 'admin' })
    const asAdmin = await clientAs(config, adminUser.email, adminUser.password)

    const { error } = await asAdmin.from('side_caps').update({ vip_cap: 30 }).eq('side', 'fatan')
    expect(error).toBeNull()

    const check = await admin.from('side_caps').select('vip_cap').eq('side', 'fatan').single()
    expect(check.data?.vip_cap).toBe(30)

    // restore for test isolation
    await admin.from('side_caps').update({ vip_cap: 25 }).eq('side', 'fatan')
  })
})
```

- [ ] **Step 2: Run, confirm the suite fails without a running local stack, then start it and confirm real failures/passes**

```bash
npx supabase start
npm test -- tests/rls/profiles-inviters-side-caps.test.ts
```

Expected: all pass against the schema from Task 4 (no implementation step needed here — this task validates existing migrations, it doesn't add new policy code). If any fail, the bug is in Task 4's migration, not this test; fix the migration, re-run `npx supabase db reset`, re-run the test.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: RLS coverage for profiles, inviters, side_caps"
```

---

### Task 9: RLS tests — `guests`, `guest_events`

**Files:**
- Test: `tests/rls/guests-guest-events.test.ts`

**Interfaces:**
- Consumes: same harness as Task 8. This is the highest-priority test file per `DATA_MODEL.md` ("the inviter scoping predicate is the single most important policy in the system").

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rls/guests-guest-events.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { getLocalStackConfig, getAdminClient, createTestUser, clientAs, type LocalStackConfig } from './setup'

let config: LocalStackConfig

beforeAll(() => {
  config = getLocalStackConfig()
})

async function seedGuest(admin: ReturnType<typeof getAdminClient>, inviterKey: string, side: 'fatan' | 'sita') {
  const { data, error } = await admin
    .from('guests')
    .insert({ name: `Test Guest ${Date.now()}`, pax: 2, side, inviter_key: inviterKey, type: 'family' })
    .select()
    .single()
  if (error || !data) throw new Error(`seed failed: ${error?.message}`)
  return data
}

describe('guests RLS', () => {
  it('inviter sees only their own guests', async () => {
    const admin = getAdminClient(config)
    const mine = await seedGuest(admin, 'Fatan', 'fatan')
    const notMine = await seedGuest(admin, 'Sita', 'sita')
    const inviter = await createTestUser(admin, {
      email: `g-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('guests').select('id')
    const ids = data?.map((g) => g.id) ?? []
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(notMine.id)
  })

  it('inviter cannot insert a guest under another inviter_key', async () => {
    const admin = getAdminClient(config)
    const inviter = await createTestUser(admin, {
      email: `g-inviter2-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Mama Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter
      .from('guests')
      .insert({ name: 'Sneaky', pax: 1, side: 'fatan', inviter_key: 'Papa Fatan', type: 'friend' })

    expect(error).not.toBeNull()
  })

  it('viewer can read all guests but cannot write', async () => {
    const admin = getAdminClient(config)
    await seedGuest(admin, 'Papa Sita', 'sita')
    const viewer = await createTestUser(admin, { email: `g-viewer-${Date.now()}@example.com`, role: 'viewer' })
    const asViewer = await clientAs(config, viewer.email, viewer.password)

    const read = await asViewer.from('guests').select('id')
    expect(read.data?.length).toBeGreaterThan(0)

    const write = await asViewer
      .from('guests')
      .insert({ name: 'Should Fail', pax: 1, side: 'sita', inviter_key: 'Papa Sita', type: 'friend' })
    expect(write.error).not.toBeNull()
  })

  it('usher has no direct guest-list read', async () => {
    const admin = getAdminClient(config)
    await seedGuest(admin, 'Fatan', 'fatan')
    const usher = await createTestUser(admin, { email: `g-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const { data } = await asUsher.from('guests').select('id')
    expect(data).toHaveLength(0)
  })
})

describe('guest_events RLS', () => {
  it('inviter can manage events on their own guest', async () => {
    const admin = getAdminClient(config)
    const guest = await seedGuest(admin, 'Sita', 'sita')
    const inviter = await createTestUser(admin, {
      email: `ge-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Sita',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter
      .from('guest_events')
      .insert({ guest_id: guest.id, event: 'akad', invite_status: 'confirmed' })
    expect(error).toBeNull()
  })

  it('inviter cannot manage events on another inviter\'s guest', async () => {
    const admin = getAdminClient(config)
    const guest = await seedGuest(admin, 'Mama Sita', 'sita')
    const inviter = await createTestUser(admin, {
      email: `ge-inviter2-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Papa Sita',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { error } = await asInviter
      .from('guest_events')
      .insert({ guest_id: guest.id, event: 'resepsi', invite_status: 'confirmed' })
    expect(error).not.toBeNull()
  })

  it('the pax_confirmed trigger rejects a value above invited pax', async () => {
    const admin = getAdminClient(config)
    const guest = await seedGuest(admin, 'Fatan', 'fatan') // pax = 2
    const { error } = await admin
      .from('guest_events')
      .insert({ guest_id: guest.id, event: 'resepsi', pax_confirmed: 5 })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('exceeds invited pax')
  })
})
```

- [ ] **Step 2: Run, confirm real pass/fail against Task 5's migration**

```bash
npm test -- tests/rls/guests-guest-events.test.ts
```

Expected: all pass. Any failure means a bug in Task 5's policies or trigger — fix there, re-apply, re-run.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: RLS coverage for guests, guest_events"
```

---

### Task 10: RLS tests — `checkin_events`, `souvenir_claims`, `wa_sends`

**Files:**
- Test: `tests/rls/checkin-souvenir-wa-sends.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rls/checkin-souvenir-wa-sends.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { getLocalStackConfig, getAdminClient, createTestUser, clientAs, type LocalStackConfig } from './setup'

let config: LocalStackConfig

beforeAll(() => {
  config = getLocalStackConfig()
})

async function seedGuest(admin: ReturnType<typeof getAdminClient>) {
  const { data, error } = await admin
    .from('guests')
    .insert({ name: `WA Guest ${Date.now()}`, pax: 1, side: 'fatan', inviter_key: 'Fatan', type: 'friend' })
    .select()
    .single()
  if (error || !data) throw new Error(`seed failed: ${error?.message}`)
  return data
}

describe('checkin_events RLS', () => {
  it('usher can insert and read, but not act as admin-only writer for others', async () => {
    const admin = getAdminClient(config)
    const guest = await seedGuest(admin)
    const usher = await createTestUser(admin, { email: `ck-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const insert = await asUsher
      .from('checkin_events')
      .insert({ guest_id: guest.id, event: 'resepsi', checked_in_by: usher.userId })
    expect(insert.error).toBeNull()

    const read = await asUsher.from('checkin_events').select('id').eq('guest_id', guest.id)
    expect(read.data?.length).toBe(1)
  })

  it('inviter has no access to checkin_events', async () => {
    const admin = getAdminClient(config)
    const inviter = await createTestUser(admin, {
      email: `ck-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('checkin_events').select('id')
    expect(data).toHaveLength(0)
  })
})

describe('souvenir_claims RLS', () => {
  it('the UNIQUE(guest_id) constraint rejects a second claim', async () => {
    const admin = getAdminClient(config)
    const guest = await seedGuest(admin)
    const usher = await createTestUser(admin, { email: `sv-usher-${Date.now()}@example.com`, role: 'usher' })
    const asUsher = await clientAs(config, usher.email, usher.password)

    const first = await asUsher
      .from('souvenir_claims')
      .insert({ guest_id: guest.id, claimed_by: usher.userId, claimed_via: 'akad_table' })
    expect(first.error).toBeNull()

    const second = await asUsher
      .from('souvenir_claims')
      .insert({ guest_id: guest.id, claimed_by: usher.userId, claimed_via: 'resepsi_scan' })
    expect(second.error).not.toBeNull()
    expect(second.error?.message).toMatch(/duplicate key|unique/i)
  })
})

describe('wa_sends RLS', () => {
  it('inviter can read wa_sends only for their own guests', async () => {
    const admin = getAdminClient(config)
    const guest = await seedGuest(admin)
    await admin.from('wa_sends').insert({ guest_id: guest.id, kind: 'invite', provider: 'fake' })

    const inviter = await createTestUser(admin, {
      email: `wa-inviter-${Date.now()}@example.com`,
      role: 'inviter',
      inviterKey: 'Fatan',
    })
    const asInviter = await clientAs(config, inviter.email, inviter.password)

    const { data } = await asInviter.from('wa_sends').select('id').eq('guest_id', guest.id)
    expect(data?.length).toBe(1)

    const write = await asInviter
      .from('wa_sends')
      .insert({ guest_id: guest.id, kind: 'qr_checkin', provider: 'fake' })
    expect(write.error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run, confirm against Task 6's migration**

```bash
npm test -- tests/rls/checkin-souvenir-wa-sends.test.ts
```

Expected: all pass.

- [ ] **Step 3: Run the full RLS suite together as a final check for this slice**

```bash
npm test -- tests/rls
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: RLS coverage for checkin_events, souvenir_claims, wa_sends"
```

---

### Task 11: Auth — admin-created accounts, login, session/role guard

**Files:**
- Create: `scripts/create-user.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/server/actions/auth-actions.ts`
- Create: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Produces: `signIn(formData: FormData): Promise<{ error: string } | never>` (server action, redirects on success). `getCurrentProfile(): Promise<{ userId: string; role: TestRole; inviterKey: string | null; side: 'fatan' | 'sita' | null } | null>` — later tasks (16, 19, 20) use this to branch admin-vs-inviter UI and to redirect unauthenticated requests.

- [ ] **Step 1: Write the one-shot user creation script**

No self-signup (`PRD.md`): the owner runs this once per person (6 inviters + owner's own admin account + ushers, as needed) against the real project.

```ts
// scripts/create-user.ts
import { getAdminSupabase } from '../src/server/supabase/admin-client'

type Role = 'admin' | 'inviter' | 'usher' | 'viewer'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i === -1 ? undefined : args[i + 1]
  }
  const email = get('--email')
  const password = get('--password')
  const fullName = get('--name')
  const role = get('--role') as Role | undefined
  const inviterKey = get('--inviter-key')
  const side = get('--side') as 'fatan' | 'sita' | undefined

  if (!email || !password || !fullName || !role) {
    throw new Error(
      'Usage: tsx scripts/create-user.ts --email X --password X --name X --role admin|inviter|usher|viewer [--inviter-key "Mama Fatan"] [--side fatan|sita]'
    )
  }
  if (role === 'inviter' && !inviterKey) {
    throw new Error('--inviter-key is required when --role inviter')
  }
  return { email, password, fullName, role, inviterKey, side }
}

async function main() {
  const { email, password, fullName, role, inviterKey, side } = parseArgs()
  const admin = getAdminSupabase()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message}`)
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    full_name: fullName,
    role,
    inviter_key: inviterKey ?? null,
    side: side ?? null,
  })
  if (profileError) {
    // roll back the auth user so a failed run doesn't leave an orphan login
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`profile insert failed, auth user rolled back: ${profileError.message}`)
  }

  console.log(`Created ${role} account for ${email}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Write the auth server action**

```ts
// src/server/actions/auth-actions.ts
'use server'

import { redirect } from 'next/navigation'
import { getServerSupabase } from '../supabase/server-client'

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await getServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: 'Email or password is wrong.' }
  }
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await getServerSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}

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

- [ ] **Step 3: Write the login page**

```tsx
// src/app/login/page.tsx
import { signIn } from '@/server/actions/auth-actions'

export default function LoginPage() {
  async function action(formData: FormData) {
    'use server'
    const result = await signIn(formData)
    return result
  }

  return (
    <main className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">Sign in</h1>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Sign in
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Write middleware to refresh the session on every request**

```ts
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 5: Write the dashboard layout guard**

```tsx
// src/app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/login')
  }
  return <div>{children}</div>
}
```

- [ ] **Step 6: Manual verification**

Create one real admin account against the local stack, sign in through the UI, confirm redirect to `/dashboard` and that visiting `/dashboard` while signed out redirects to `/login`.

```bash
npx tsx scripts/create-user.ts --email admin@example.com --password test1234 --name "Test Admin" --role admin
npm run dev
```

Visit `http://localhost:3000/login`, sign in, confirm landing on `/dashboard` (page doesn't exist yet until Task 20 — a 404 there is expected and fine, the redirect itself is what's being checked). Then open a private window and visit `/dashboard` directly — expect redirect to `/login`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: email/password auth, session middleware, role guard"
```

---

### Task 12: `domain/quota.ts` (TDD)

**Files:**
- Create: `src/domain/quota.ts`
- Test: `src/domain/quota.test.ts`

**Interfaces:**
- Produces: `checkQuota(state: QuotaState, addingPax: number): QuotaDecision`, `QuotaState = { cap: number; confirmedPax: number }`, `QuotaDecision = { allowed: true; overCap: boolean; remaining: number; overBy: number }`.
- Task 18 calls this from the guest-create/edit server action, passing capacity loaded by `inviters-repository.ts` (Task 16).

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/quota.test.ts
import { describe, it, expect } from 'vitest'
import { checkQuota } from './quota'

describe('checkQuota', () => {
  it('allows and reports remaining capacity when comfortably under cap', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 10 }, 5)
    expect(result).toEqual({ allowed: true, overCap: false, remaining: 25, overBy: 0 })
  })

  it('allows and reports zero remaining when landing exactly on cap', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 35 }, 5)
    expect(result).toEqual({ allowed: true, overCap: false, remaining: 0, overBy: 0 })
  })

  it('still allows, but flags over-cap, when the addition exceeds cap', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 38 }, 5)
    expect(result).toEqual({ allowed: true, overCap: true, remaining: -3, overBy: 3 })
  })

  it('flags over-cap when the state was already over before this write', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 65 }, 0)
    expect(result).toEqual({ allowed: true, overCap: true, remaining: -25, overBy: 25 })
  })

  it('a negative addingPax (a decline freeing pax) always reports allowed and never over', () => {
    const result = checkQuota({ cap: 40, confirmedPax: 42 }, -10)
    expect(result).toEqual({ allowed: true, overCap: false, remaining: 8, overBy: 0 })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm test -- src/domain/quota.test.ts
```

Expected: FAIL — `quota.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/domain/quota.ts
export type QuotaState = {
  cap: number
  confirmedPax: number
}

export type QuotaDecision = {
  allowed: true
  overCap: boolean
  remaining: number
  overBy: number
}

export function checkQuota(state: QuotaState, addingPax: number): QuotaDecision {
  const projected = state.confirmedPax + addingPax
  const remaining = state.cap - projected
  const overCap = remaining < 0
  return {
    allowed: true,
    overCap,
    remaining,
    overBy: overCap ? -remaining : 0,
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- src/domain/quota.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: domain/quota.ts capacity math"
```

---

### Task 13: `domain/waitlist.ts` (TDD)

**Files:**
- Create: `src/domain/waitlist.ts`
- Test: `src/domain/waitlist.test.ts`

**Interfaces:**
- Produces: `buildCascade(pool: WaitlistedGuest[], context: { inviterKey: string; side: 'fatan' | 'sita' }): CascadeOffer[]` (same-inviter tier first, then same-side, then global, each sorted by `waitlistRank`, nulls last); `checkPromotion(remainingBefore: number, guestPax: number): PromotionDecision`.
- Task 19 calls `buildCascade` to populate the promote screen and `checkPromotion` in the promote server action.

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/waitlist.test.ts
import { describe, it, expect } from 'vitest'
import { buildCascade, checkPromotion, type WaitlistedGuest } from './waitlist'

const guest = (over: Partial<WaitlistedGuest>): WaitlistedGuest => ({
  guestId: 'g1',
  inviterKey: 'Fatan',
  side: 'fatan',
  pax: 1,
  waitlistRank: null,
  ...over,
})

describe('buildCascade', () => {
  it('orders same-inviter before same-side before global', () => {
    const pool: WaitlistedGuest[] = [
      guest({ guestId: 'global', inviterKey: 'Papa Sita', side: 'sita' }),
      guest({ guestId: 'same-side', inviterKey: 'Mama Fatan', side: 'fatan' }),
      guest({ guestId: 'same-inviter', inviterKey: 'Fatan', side: 'fatan' }),
    ]

    const offers = buildCascade(pool, { inviterKey: 'Fatan', side: 'fatan' })

    expect(offers.map((o) => o.guest.guestId)).toEqual(['same-inviter', 'same-side', 'global'])
    expect(offers.map((o) => o.tier)).toEqual(['same_inviter', 'same_side', 'global'])
  })

  it('sorts within a tier by waitlistRank ascending, nulls last', () => {
    const pool: WaitlistedGuest[] = [
      guest({ guestId: 'no-rank', inviterKey: 'Fatan', waitlistRank: null }),
      guest({ guestId: 'rank-2', inviterKey: 'Fatan', waitlistRank: 2 }),
      guest({ guestId: 'rank-1', inviterKey: 'Fatan', waitlistRank: 1 }),
    ]

    const offers = buildCascade(pool, { inviterKey: 'Fatan', side: 'fatan' })

    expect(offers.map((o) => o.guest.guestId)).toEqual(['rank-1', 'rank-2', 'no-rank'])
  })

  it('an empty pool produces an empty cascade', () => {
    expect(buildCascade([], { inviterKey: 'Fatan', side: 'fatan' })).toEqual([])
  })
})

describe('checkPromotion', () => {
  it('allows and reports remaining after when there is enough room', () => {
    const result = checkPromotion(10, 3)
    expect(result).toEqual({ allowed: true, overCap: false, remainingAfter: 7 })
  })

  it('still allows, but flags over-cap, when promoting exceeds remaining room', () => {
    const result = checkPromotion(2, 5)
    expect(result).toEqual({ allowed: true, overCap: true, remainingAfter: -3 })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm test -- src/domain/waitlist.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/domain/waitlist.ts
export type WaitlistedGuest = {
  guestId: string
  inviterKey: string
  side: 'fatan' | 'sita'
  pax: number
  waitlistRank: number | null
}

export type CascadeTier = 'same_inviter' | 'same_side' | 'global'

export type CascadeOffer = {
  tier: CascadeTier
  guest: WaitlistedGuest
}

function byRankAscendingNullsLast(a: WaitlistedGuest, b: WaitlistedGuest): number {
  const rankA = a.waitlistRank ?? Number.MAX_SAFE_INTEGER
  const rankB = b.waitlistRank ?? Number.MAX_SAFE_INTEGER
  return rankA - rankB
}

export function buildCascade(
  pool: WaitlistedGuest[],
  context: { inviterKey: string; side: 'fatan' | 'sita' }
): CascadeOffer[] {
  const sameInviter = pool
    .filter((g) => g.inviterKey === context.inviterKey)
    .sort(byRankAscendingNullsLast)
  const sameSide = pool
    .filter((g) => g.inviterKey !== context.inviterKey && g.side === context.side)
    .sort(byRankAscendingNullsLast)
  const global = pool
    .filter((g) => g.side !== context.side)
    .sort(byRankAscendingNullsLast)

  return [
    ...sameInviter.map((guest) => ({ tier: 'same_inviter' as const, guest })),
    ...sameSide.map((guest) => ({ tier: 'same_side' as const, guest })),
    ...global.map((guest) => ({ tier: 'global' as const, guest })),
  ]
}

export type PromotionDecision = {
  allowed: true
  overCap: boolean
  remainingAfter: number
}

export function checkPromotion(remainingBefore: number, guestPax: number): PromotionDecision {
  const remainingAfter = remainingBefore - guestPax
  return { allowed: true, overCap: remainingAfter < 0, remainingAfter }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- src/domain/waitlist.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: domain/waitlist.ts cascade tiers and promotion eligibility"
```

---

### Task 14: `domain/import-mapper.ts` (TDD)

**Files:**
- Create: `src/domain/import-mapper.ts`
- Test: `src/domain/import-mapper.test.ts`

**Interfaces:**
- Produces: `requiredHeaders(): readonly string[]`, `mapSheetRow(row: SheetRow): MapRowResult`, `SheetRow = Record<string, string>`, `MapRowResult = { ok: true; row: MappedGuest } | { ok: false; errors: string[] }`.
- Task 15 (`scripts/import-sheet.ts`) validates the sheet's header row against `requiredHeaders()` and calls `mapSheetRow` per data row.

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/import-mapper.test.ts
import { describe, it, expect } from 'vitest'
import { mapSheetRow, requiredHeaders, type SheetRow } from './import-mapper'

function row(overrides: Partial<SheetRow> = {}): SheetRow {
  return {
    Name: 'Budi Santoso',
    Pax: '2',
    Side: 'fatan',
    Inviter: 'Mama Fatan',
    Type: 'family',
    Note: '',
    Whatsapp: '',
    VIP: '',
    'Waiting List': '',
    Akad: 'Yes',
    Resepsi: 'Yes',
    ...overrides,
  }
}

describe('requiredHeaders', () => {
  it('lists every header the mapper reads', () => {
    expect(requiredHeaders()).toEqual([
      'Name', 'Pax', 'Side', 'Inviter', 'Type', 'Whatsapp', 'VIP', 'Waiting List', 'Akad', 'Resepsi',
    ])
  })
})

describe('mapSheetRow', () => {
  it('maps a complete row invited to both events, confirmed', () => {
    const result = mapSheetRow(row())
    expect(result).toEqual({
      ok: true,
      row: {
        guest: {
          name: 'Budi Santoso',
          pax: 2,
          side: 'fatan',
          inviterKey: 'Mama Fatan',
          type: 'family',
          note: null,
          phone: null,
          isVip: false,
        },
        guestEvents: [
          { event: 'akad', inviteStatus: 'confirmed' },
          { event: 'resepsi', inviteStatus: 'confirmed' },
        ],
      },
    })
  })

  it('only creates a guest_events row for non-blank event columns', () => {
    const result = mapSheetRow(row({ Akad: '', Resepsi: 'Yes' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guestEvents).toEqual([{ event: 'resepsi', inviteStatus: 'confirmed' }])
    }
  })

  it('expands a guest-level Waiting List flag across every event that guest is invited to', () => {
    const result = mapSheetRow(row({ 'Waiting List': 'Yes' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guestEvents).toEqual([
        { event: 'akad', inviteStatus: 'waitlisted' },
        { event: 'resepsi', inviteStatus: 'waitlisted' },
      ])
    }
  })

  it('reads VIP and phone when present', () => {
    const result = mapSheetRow(row({ VIP: 'Yes', Whatsapp: '+6281234567890' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.guest.isVip).toBe(true)
      expect(result.row.guest.phone).toBe('+6281234567890')
    }
  })

  it('reports an error for a missing name without throwing', () => {
    const result = mapSheetRow(row({ Name: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('Name is required')
    }
  })

  it('reports an error for non-numeric pax', () => {
    const result = mapSheetRow(row({ Pax: 'two' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/Pax is not a positive number/)
    }
  })

  it('reports an error for an unrecognized side, case-insensitively accepting valid ones', () => {
    const bad = mapSheetRow(row({ Side: 'north' }))
    expect(bad.ok).toBe(false)

    const good = mapSheetRow(row({ Side: 'FATAN' }))
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.row.guest.side).toBe('fatan')
  })

  it('two rows with the same name map independently, as two separate guests', () => {
    const first = mapSheetRow(row({ Name: 'Dian' }))
    const second = mapSheetRow(row({ Name: 'Dian', Pax: '1' }))
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(first.row.guest.pax).toBe(2)
      expect(second.row.guest.pax).toBe(1)
    }
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm test -- src/domain/import-mapper.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/domain/import-mapper.ts
export type SheetRow = Record<string, string>

export type MappedGuest = {
  guest: {
    name: string
    pax: number
    side: 'fatan' | 'sita'
    inviterKey: string
    type: 'family' | 'friend'
    note: string | null
    phone: string | null
    isVip: boolean
  }
  guestEvents: Array<{
    event: 'akad' | 'resepsi'
    inviteStatus: 'confirmed' | 'waitlisted'
  }>
}

export type MapRowResult = { ok: true; row: MappedGuest } | { ok: false; errors: string[] }

const REQUIRED_HEADERS = [
  'Name', 'Pax', 'Side', 'Inviter', 'Type', 'Whatsapp', 'VIP', 'Waiting List', 'Akad', 'Resepsi',
] as const

export function requiredHeaders(): readonly string[] {
  return REQUIRED_HEADERS
}

export function mapSheetRow(row: SheetRow): MapRowResult {
  const errors: string[] = []

  const name = row['Name']?.trim()
  if (!name) errors.push('Name is required')

  const paxRaw = row['Pax']?.trim()
  const pax = Number(paxRaw)
  if (!paxRaw || Number.isNaN(pax) || pax <= 0) {
    errors.push(`Pax is not a positive number: "${paxRaw ?? ''}"`)
  }

  const sideRaw = row['Side']?.trim().toLowerCase()
  if (sideRaw !== 'fatan' && sideRaw !== 'sita') {
    errors.push(`Side must be "fatan" or "sita", got "${row['Side'] ?? ''}"`)
  }

  const inviterKey = row['Inviter']?.trim()
  if (!inviterKey) errors.push('Inviter is required')

  const typeRaw = row['Type']?.trim().toLowerCase()
  if (typeRaw !== 'family' && typeRaw !== 'friend') {
    errors.push(`Type must be "family" or "friend", got "${row['Type'] ?? ''}"`)
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const isWaitlisted = row['Waiting List']?.trim().toLowerCase() === 'yes'
  const isVip = row['VIP']?.trim().toLowerCase() === 'yes'
  const phone = row['Whatsapp']?.trim() || null
  const note = row['Note']?.trim() || null

  const guestEvents: MappedGuest['guestEvents'] = []
  if (row['Akad']?.trim()) {
    guestEvents.push({ event: 'akad', inviteStatus: isWaitlisted ? 'waitlisted' : 'confirmed' })
  }
  if (row['Resepsi']?.trim()) {
    guestEvents.push({ event: 'resepsi', inviteStatus: isWaitlisted ? 'waitlisted' : 'confirmed' })
  }

  return {
    ok: true,
    row: {
      guest: {
        name: name!,
        pax,
        side: sideRaw as 'fatan' | 'sita',
        inviterKey: inviterKey!,
        type: typeRaw as 'family' | 'friend',
        note,
        phone,
        isVip,
      },
      guestEvents,
    },
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- src/domain/import-mapper.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: domain/import-mapper.ts sheet row to guest + guest_events"
```

---

### Task 15: `scripts/import-sheet.ts`

**Files:**
- Create: `scripts/import-sheet.ts`

**Interfaces:**
- Consumes: `requiredHeaders`, `mapSheetRow` from Task 14; `getAdminSupabase` from Task 4.
- Produces: a CLI script (`npx tsx scripts/import-sheet.ts [--force]`) run once at cut-over, per `TECH_SPEC.md` 4.1. Reads `GUEST_SHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON` from env (already scaffolded in `.env.example`).

- [ ] **Step 1: Install the Google Sheets client**

```bash
npm install googleapis
```

- [ ] **Step 2: Write the script**

```ts
// scripts/import-sheet.ts
import { google } from 'googleapis'
import { getAdminSupabase } from '../src/server/supabase/admin-client'
import { requiredHeaders, mapSheetRow, type SheetRow } from '../src/domain/import-mapper'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

function loadServiceAccountCredentials() {
  const raw = requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON')
  // accepts either a raw JSON string or a base64-encoded one
  const jsonText = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  return JSON.parse(jsonText)
}

async function fetchSheetRows(sheetId: string): Promise<string[][]> {
  const credentials = loadServiceAccountCredentials()
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A:Z',
  })
  return (response.data.values as string[][]) ?? []
}

function rowsToObjects(headerRow: string[], dataRows: string[][]): SheetRow[] {
  return dataRows.map((rawRow) => {
    const obj: SheetRow = {}
    headerRow.forEach((header, i) => {
      obj[header] = rawRow[i] ?? ''
    })
    return obj
  })
}

function validateHeaders(headerRow: string[]) {
  const missing = requiredHeaders().filter((h) => !headerRow.includes(h))
  if (missing.length > 0) {
    throw new Error(
      `Sheet is missing required column(s): ${missing.join(', ')}. ` +
        `This is structural damage — refusing to import. Found columns: ${headerRow.join(', ')}`
    )
  }
}

async function main() {
  const force = process.argv.includes('--force')
  const sheetId = requireEnv('GUEST_SHEET_ID')
  const admin = getAdminSupabase()

  const { count: existingCount, error: countError } = await admin
    .from('guests')
    .select('id', { count: 'exact', head: true })
  if (countError) throw new Error(`Failed to check existing guests: ${countError.message}`)
  if ((existingCount ?? 0) > 0 && !force) {
    throw new Error(
      `guests table already has ${existingCount} row(s). Import is one-shot at cut-over — ` +
        `pass --force to re-run against a non-empty table.`
    )
  }

  console.log(`Fetching sheet ${sheetId}...`)
  const allRows = await fetchSheetRows(sheetId)
  if (allRows.length === 0) {
    throw new Error('Sheet returned no rows at all — refusing to import.')
  }
  const [headerRow, ...dataRows] = allRows
  validateHeaders(headerRow)

  const sheetRows = rowsToObjects(headerRow, dataRows)

  let imported = 0
  const anomalies: string[] = []

  for (const [index, sheetRow] of sheetRows.entries()) {
    const rowNumber = index + 2 // header is row 1, data starts at row 2
    const mapped = mapSheetRow(sheetRow)
    if (!mapped.ok) {
      anomalies.push(`Row ${rowNumber} (${sheetRow['Name'] || 'unnamed'}): ${mapped.errors.join('; ')}`)
      continue
    }

    const { guest, guestEvents } = mapped.row
    const { data: insertedGuest, error: guestError } = await admin
      .from('guests')
      .insert({
        name: guest.name,
        pax: guest.pax,
        side: guest.side,
        inviter_key: guest.inviterKey,
        type: guest.type,
        note: guest.note,
        phone: guest.phone,
        is_vip: guest.isVip,
      })
      .select()
      .single()

    if (guestError || !insertedGuest) {
      anomalies.push(`Row ${rowNumber} (${guest.name}): failed to insert guest — ${guestError?.message}`)
      continue
    }

    if (guestEvents.length > 0) {
      const { error: eventsError } = await admin.from('guest_events').insert(
        guestEvents.map((ge) => ({
          guest_id: insertedGuest.id,
          event: ge.event,
          invite_status: ge.inviteStatus,
        }))
      )
      if (eventsError) {
        anomalies.push(`Row ${rowNumber} (${guest.name}): guest inserted but guest_events failed — ${eventsError.message}`)
        continue
      }
    }

    imported += 1
  }

  console.log(`Imported ${imported} of ${sheetRows.length} rows.`)
  if (anomalies.length > 0) {
    console.log(`\n${anomalies.length} anomaly/anomalies (skipped, not imported):`)
    for (const line of anomalies) console.log(`  - ${line}`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
```

- [ ] **Step 3: Manual verification against a test sheet**

Create a small throwaway Google Sheet (5-10 fake rows using invented names, matching `docs/CLAUDE.md`'s "test fixtures use invented names" rule) with the exact header row from `requiredHeaders()`, share it with the service account, and run:

```bash
GUEST_SHEET_ID=<test-sheet-id> npx tsx scripts/import-sheet.ts
```

Expected: reports imported count matching the test sheet's row count, zero anomalies for well-formed rows, and confirms refusing without `--force` on a second run:

```bash
GUEST_SHEET_ID=<test-sheet-id> npx tsx scripts/import-sheet.ts
```

Expected: throws "guests table already has N row(s)..." Then verify `--force` proceeds:

```bash
GUEST_SHEET_ID=<test-sheet-id> npx tsx scripts/import-sheet.ts --force
```

After verifying, truncate the local `guests`/`guest_events` tables (`npx supabase db reset`) so later tasks start clean. **Do not run this against the real project's real sheet — that happens once, at cut-over, per the owner.**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: scripts/import-sheet.ts one-shot Google Sheets import"
```

---

### Task 16: Guest repositories + server actions + CRUD screens

**Files:**
- Create: `src/server/repositories/inviters-repository.ts`
- Create: `src/server/repositories/guests-repository.ts`
- Create: `src/server/repositories/guest-events-repository.ts`
- Create: `src/server/actions/guest-actions.ts`
- Create: `src/app/(dashboard)/guests/page.tsx`
- Create: `src/app/(dashboard)/guests/new/page.tsx`
- Create: `src/app/(dashboard)/guests/[id]/edit/page.tsx`

**Interfaces:**
- Produces: `loadInviterCapacity(supabase, inviterKey, event): Promise<{ cap: number; confirmedPax: number }>` (Task 18 wires this into quota checks); `listGuests(supabase): Promise<Guest[]>` (RLS scopes the rows automatically — no manual `WHERE inviter_key = ...` needed, and none should be added, since RLS is the wall that must hold even if this code has a bug); `createGuest(formData): Promise<{ flags: string[] }>`, `updateGuestPhone(formData): Promise<void>`.
- This task does not yet call `domain/quota.ts` — that wiring, and the warning banner, is Task 18's deliverable, kept separate so it's independently reviewable.

- [ ] **Step 1: Write the inviters repository**

```ts
// src/server/repositories/inviters-repository.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function loadInviterCapacity(
  supabase: SupabaseClient,
  inviterKey: string,
  event: 'akad' | 'resepsi'
): Promise<{ cap: number; confirmedPax: number }> {
  const capColumn = event === 'akad' ? 'akad_cap' : 'resepsi_cap'
  const { data: inviter, error: inviterError } = await supabase
    .from('inviters')
    .select(capColumn)
    .eq('key', inviterKey)
    .single()
  if (inviterError || !inviter) {
    throw new Error(`Failed to load inviter cap for ${inviterKey}: ${inviterError?.message}`)
  }

  const { data: guests, error: guestsError } = await supabase
    .from('guests')
    .select('id, pax, guest_events!inner(event, invite_status, rsvp_status)')
    .eq('inviter_key', inviterKey)
    .eq('guest_events.event', event)
    .eq('guest_events.invite_status', 'confirmed')
    .neq('guest_events.rsvp_status', 'not_attending')
  if (guestsError) {
    throw new Error(`Failed to load confirmed pax for ${inviterKey}/${event}: ${guestsError.message}`)
  }

  const confirmedPax = (guests ?? []).reduce((sum, g) => sum + g.pax, 0)
  return { cap: (inviter as unknown as Record<string, number>)[capColumn], confirmedPax }
}

export async function listInviters(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('inviters').select('*').order('key')
  if (error) throw new Error(`Failed to list inviters: ${error.message}`)
  return data
}
```

- [ ] **Step 2: Write the guests repository**

```ts
// src/server/repositories/guests-repository.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type NewGuest = {
  name: string
  pax: number
  side: 'fatan' | 'sita'
  inviterKey: string
  type: 'family' | 'friend'
  phone: string | null
  isVip: boolean
}

// RLS scopes these results by role automatically — do not add a manual
// inviter_key filter here. That's the point: app-code bugs can't leak rows.
export async function listGuests(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('guests')
    .select('*, guest_events(*)')
    .order('name')
  if (error) throw new Error(`Failed to list guests: ${error.message}`)
  return data
}

export async function getGuest(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('guests')
    .select('*, guest_events(*)')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Failed to load guest ${id}: ${error.message}`)
  return data
}

export async function insertGuest(supabase: SupabaseClient, guest: NewGuest) {
  const { data, error } = await supabase
    .from('guests')
    .insert({
      name: guest.name,
      pax: guest.pax,
      side: guest.side,
      inviter_key: guest.inviterKey,
      type: guest.type,
      phone: guest.phone,
      is_vip: guest.isVip,
    })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to insert guest: ${error?.message}`)
  return data
}

export async function updateGuestPhone(supabase: SupabaseClient, guestId: string, phone: string) {
  const { error } = await supabase.from('guests').update({ phone }).eq('id', guestId)
  if (error) throw new Error(`Failed to update phone for guest ${guestId}: ${error.message}`)
}
```

- [ ] **Step 3: Write the guest_events repository**

```ts
// src/server/repositories/guest-events-repository.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function insertGuestEvents(
  supabase: SupabaseClient,
  guestId: string,
  events: Array<{ event: 'akad' | 'resepsi'; inviteStatus: 'confirmed' | 'waitlisted' }>
) {
  if (events.length === 0) return
  const { error } = await supabase.from('guest_events').insert(
    events.map((e) => ({ guest_id: guestId, event: e.event, invite_status: e.inviteStatus }))
  )
  if (error) throw new Error(`Failed to insert guest_events for guest ${guestId}: ${error.message}`)
}
```

- [ ] **Step 4: Write the guest server actions**

```ts
// src/server/actions/guest-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { insertGuest, updateGuestPhone as updateGuestPhoneRepo } from '../repositories/guests-repository'
import { insertGuestEvents } from '../repositories/guest-events-repository'

export async function createGuest(formData: FormData) {
  const supabase = await getServerSupabase()

  const name = String(formData.get('name') ?? '').trim()
  const pax = Number(formData.get('pax'))
  const side = String(formData.get('side') ?? '') as 'fatan' | 'sita'
  const inviterKey = String(formData.get('inviterKey') ?? '')
  const type = String(formData.get('type') ?? '') as 'family' | 'friend'
  const phone = String(formData.get('phone') ?? '').trim() || null
  const isVip = formData.get('isVip') === 'on'
  const events = formData.getAll('events') as Array<'akad' | 'resepsi'>

  if (!name || !pax || !side || !inviterKey || !type) {
    return { error: 'Name, pax, side, inviter, and type are required.' }
  }

  const guest = await insertGuest(supabase, { name, pax, side, inviterKey, type, phone, isVip })
  await insertGuestEvents(
    supabase,
    guest.id,
    events.map((event) => ({ event, inviteStatus: 'confirmed' as const }))
  )

  revalidatePath('/guests')
  return { guestId: guest.id }
}

export async function updateGuestPhone(formData: FormData) {
  const supabase = await getServerSupabase()
  const guestId = String(formData.get('guestId') ?? '')
  const phone = String(formData.get('phone') ?? '').trim()
  if (!guestId || !phone) {
    return { error: 'Guest and phone are required.' }
  }
  await updateGuestPhoneRepo(supabase, guestId, phone)
  revalidatePath('/guests')
  return { ok: true }
}
```

- [ ] **Step 5: Write the guest list screen**

```tsx
// src/app/(dashboard)/guests/page.tsx
import Link from 'next/link'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listGuests } from '@/server/repositories/guests-repository'

export default async function GuestsPage() {
  const supabase = await getServerSupabase()
  const guests = await listGuests(supabase)

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Guests</h1>
        <Link href="/guests/new" className="rounded bg-black px-3 py-2 text-sm text-white">
          Add guest
        </Link>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Pax</th>
            <th className="py-2">Inviter</th>
            <th className="py-2">Phone</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => (
            <tr key={guest.id} className="border-b">
              <td className="py-2">{guest.name}</td>
              <td className="py-2">{guest.pax}</td>
              <td className="py-2">{guest.inviter_key}</td>
              <td className="py-2">{guest.phone ?? <span className="text-red-600">missing</span>}</td>
              <td className="py-2">
                <Link href={`/guests/${guest.id}/edit`} className="text-blue-600 underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 6: Write the new-guest form**

```tsx
// src/app/(dashboard)/guests/new/page.tsx
import { redirect } from 'next/navigation'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listInviters } from '@/server/repositories/inviters-repository'
import { createGuest } from '@/server/actions/guest-actions'

export default async function NewGuestPage() {
  const supabase = await getServerSupabase()
  const inviters = await listInviters(supabase)

  async function action(formData: FormData) {
    'use server'
    const result = await createGuest(formData)
    if ('guestId' in result) {
      redirect('/guests')
    }
    return result
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Add guest</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="name" placeholder="Name" required className="rounded border px-3 py-2" />
        <input name="pax" type="number" min={1} placeholder="Pax" required className="rounded border px-3 py-2" />
        <select name="side" required className="rounded border px-3 py-2">
          <option value="">Side</option>
          <option value="fatan">Fatan</option>
          <option value="sita">Sita</option>
        </select>
        <select name="inviterKey" required className="rounded border px-3 py-2">
          <option value="">Inviter</option>
          {inviters.map((inviter) => (
            <option key={inviter.key} value={inviter.key}>
              {inviter.key}
            </option>
          ))}
        </select>
        <select name="type" required className="rounded border px-3 py-2">
          <option value="">Type</option>
          <option value="family">Family</option>
          <option value="friend">Friend</option>
        </select>
        <input name="phone" placeholder="Phone (optional)" className="rounded border px-3 py-2" />
        <label className="flex items-center gap-2">
          <input name="isVip" type="checkbox" /> VIP
        </label>
        <fieldset className="flex gap-4">
          <label className="flex items-center gap-2">
            <input name="events" type="checkbox" value="akad" /> Akad
          </label>
          <label className="flex items-center gap-2">
            <input name="events" type="checkbox" value="resepsi" /> Resepsi
          </label>
        </fieldset>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: Write the edit-guest screen (phone only, for now — Task 17 extends it)**

```tsx
// src/app/(dashboard)/guests/[id]/edit/page.tsx
import { redirect } from 'next/navigation'
import { getServerSupabase } from '@/server/supabase/server-client'
import { getGuest } from '@/server/repositories/guests-repository'
import { updateGuestPhone } from '@/server/actions/guest-actions'

export default async function EditGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getServerSupabase()
  const guest = await getGuest(supabase, id)

  async function action(formData: FormData) {
    'use server'
    formData.set('guestId', id)
    const result = await updateGuestPhone(formData)
    if (result && 'ok' in result) {
      redirect('/guests')
    }
    return result
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Edit {guest.name}</h1>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="phone"
          defaultValue={guest.phone ?? ''}
          placeholder="Phone"
          required
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save phone
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Manual verification**

```bash
npm run dev
```

Sign in as the admin created in Task 11. Add a guest, confirm it appears in the list. Sign in as an inviter test account (create one via `scripts/create-user.ts`), confirm the list shows only that inviter's guests (RLS enforced, not app code). Edit a guest's phone, confirm it saves.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: guest repositories, server actions, and CRUD screens"
```

---

### Task 17: Phone backfill filter + per-inviter gap count

**Files:**
- Modify: `src/app/(dashboard)/guests/page.tsx`
- Modify: `src/server/repositories/guests-repository.ts`

**Interfaces:**
- Produces: `countMissingPhone(supabase): Promise<number>` — counts rows the caller can already see under RLS (so an inviter's count is automatically their own gap, no extra scoping code needed). Guest list page gets a `?missingPhone=1` query-param filter, default-scoped to whatever RLS already returns for the signed-in user.

- [ ] **Step 1: Add the count helper to the repository**

```ts
// src/server/repositories/guests-repository.ts — append
export async function countMissingPhone(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .is('phone', null)
  if (error) throw new Error(`Failed to count missing-phone guests: ${error.message}`)
  return count ?? 0
}
```

- [ ] **Step 2: Wire the filter and count into the guest list page**

```tsx
// src/app/(dashboard)/guests/page.tsx
import Link from 'next/link'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listGuests, countMissingPhone } from '@/server/repositories/guests-repository'

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ missingPhone?: string }>
}) {
  const { missingPhone } = await searchParams
  const supabase = await getServerSupabase()
  const [allGuests, missingPhoneCount] = await Promise.all([
    listGuests(supabase),
    countMissingPhone(supabase),
  ])
  const guests = missingPhone === '1' ? allGuests.filter((g) => !g.phone) : allGuests

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Guests</h1>
        <Link href="/guests/new" className="rounded bg-black px-3 py-2 text-sm text-white">
          Add guest
        </Link>
      </div>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <span>{missingPhoneCount} missing phone</span>
        {missingPhone === '1' ? (
          <Link href="/guests" className="text-blue-600 underline">
            Clear filter
          </Link>
        ) : (
          <Link href="/guests?missingPhone=1" className="text-blue-600 underline">
            Show missing phone only
          </Link>
        )}
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Pax</th>
            <th className="py-2">Inviter</th>
            <th className="py-2">Phone</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => (
            <tr key={guest.id} className="border-b">
              <td className="py-2">{guest.name}</td>
              <td className="py-2">{guest.pax}</td>
              <td className="py-2">{guest.inviter_key}</td>
              <td className="py-2">{guest.phone ?? <span className="text-red-600">missing</span>}</td>
              <td className="py-2">
                <Link href={`/guests/${guest.id}/edit`} className="text-blue-600 underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 3: Manual verification**

Sign in as an inviter with at least one guest missing a phone. Confirm the count matches, and the filter link shows only their own gaps (RLS already limits the base list to their guests — the filter just narrows further).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: missing-phone filter and per-inviter gap count"
```

---

### Task 18: Quota engine wiring — warn, allow, flag on the write path

**Files:**
- Modify: `src/server/actions/guest-actions.ts`
- Modify: `src/app/(dashboard)/guests/new/page.tsx`

**Interfaces:**
- Consumes: `checkQuota` from Task 12, `loadInviterCapacity` from Task 16.
- Produces: `createGuest` now returns `{ guestId: string; flags: string[] }` on success — `flags` contains one human-readable string per event the guest pushed over cap. The write always succeeds regardless of `flags`.

- [ ] **Step 1: Wire quota checks into `createGuest`**

```ts
// src/server/actions/guest-actions.ts — replace createGuest
import { checkQuota } from '@/domain/quota'
import { loadInviterCapacity } from '../repositories/inviters-repository'

export async function createGuest(formData: FormData) {
  const supabase = await getServerSupabase()

  const name = String(formData.get('name') ?? '').trim()
  const pax = Number(formData.get('pax'))
  const side = String(formData.get('side') ?? '') as 'fatan' | 'sita'
  const inviterKey = String(formData.get('inviterKey') ?? '')
  const type = String(formData.get('type') ?? '') as 'family' | 'friend'
  const phone = String(formData.get('phone') ?? '').trim() || null
  const isVip = formData.get('isVip') === 'on'
  const events = formData.getAll('events') as Array<'akad' | 'resepsi'>

  if (!name || !pax || !side || !inviterKey || !type) {
    return { error: 'Name, pax, side, inviter, and type are required.' }
  }

  // Load capacity and decide per event BEFORE the write, per the write-path
  // shape in docs/TECH_SPEC.md: decide, then persist regardless of the flag.
  const flags: string[] = []
  for (const event of events) {
    const state = await loadInviterCapacity(supabase, inviterKey, event)
    const decision = checkQuota(state, pax)
    if (decision.overCap) {
      flags.push(`${inviterKey} is now ${decision.overBy} pax over cap on ${event}.`)
    }
  }

  const guest = await insertGuest(supabase, { name, pax, side, inviterKey, type, phone, isVip })
  await insertGuestEvents(
    supabase,
    guest.id,
    events.map((event) => ({ event, inviteStatus: 'confirmed' as const }))
  )

  revalidatePath('/guests')
  return { guestId: guest.id, flags }
}
```

- [ ] **Step 2: Show the flags on the new-guest form**

Server Actions can't easily show a post-redirect banner without a query param or session flash; keep it simple and avoid the redirect when there are flags, rendering them inline instead.

```tsx
// src/app/(dashboard)/guests/new/page.tsx — replace the `action` function and add a result render
export default async function NewGuestPage() {
  const supabase = await getServerSupabase()
  const inviters = await listInviters(supabase)

  async function action(formData: FormData) {
    'use server'
    const result = await createGuest(formData)
    if ('guestId' in result && result.flags.length === 0) {
      redirect('/guests')
    }
    return result
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Add guest</h1>
      <form action={action} className="flex flex-col gap-3">
        {/* ...same fields as Task 16 Step 6... */}
      </form>
    </main>
  )
}
```

Since Server Actions invoked directly from a form (without `useActionState`) discard their return value on the client in a plain Server Component page, promote the form to a minimal Client Component wrapper so the flags actually render:

```tsx
// src/app/(dashboard)/guests/new/guest-form.tsx
'use client'

import { useActionState } from 'react'
import { createGuest } from '@/server/actions/guest-actions'

type Inviter = { key: string }

type FormState = { error?: string; guestId?: string; flags?: string[] }

async function submitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await createGuest(formData)
  if ('error' in result) return result
  if (result.flags.length === 0) {
    window.location.href = '/guests'
    return {}
  }
  return { guestId: result.guestId, flags: result.flags }
}

export function GuestForm({ inviters }: { inviters: Inviter[] }) {
  const [state, formAction] = useActionState(submitAction, {})

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="name" placeholder="Name" required className="rounded border px-3 py-2" />
      <input name="pax" type="number" min={1} placeholder="Pax" required className="rounded border px-3 py-2" />
      <select name="side" required className="rounded border px-3 py-2">
        <option value="">Side</option>
        <option value="fatan">Fatan</option>
        <option value="sita">Sita</option>
      </select>
      <select name="inviterKey" required className="rounded border px-3 py-2">
        <option value="">Inviter</option>
        {inviters.map((inviter) => (
          <option key={inviter.key} value={inviter.key}>
            {inviter.key}
          </option>
        ))}
      </select>
      <select name="type" required className="rounded border px-3 py-2">
        <option value="">Type</option>
        <option value="family">Family</option>
        <option value="friend">Friend</option>
      </select>
      <input name="phone" placeholder="Phone (optional)" className="rounded border px-3 py-2" />
      <label className="flex items-center gap-2">
        <input name="isVip" type="checkbox" /> VIP
      </label>
      <fieldset className="flex gap-4">
        <label className="flex items-center gap-2">
          <input name="events" type="checkbox" value="akad" /> Akad
        </label>
        <label className="flex items-center gap-2">
          <input name="events" type="checkbox" value="resepsi" /> Resepsi
        </label>
      </fieldset>
      <button type="submit" className="rounded bg-black px-3 py-2 text-white">
        Save
      </button>
      {state.error ? <p className="text-red-600">{state.error}</p> : null}
      {state.flags && state.flags.length > 0 ? (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Saved, but over cap:</p>
          <ul className="list-disc pl-5">
            {state.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  )
}
```

```tsx
// src/app/(dashboard)/guests/new/page.tsx — final version
import { getServerSupabase } from '@/server/supabase/server-client'
import { listInviters } from '@/server/repositories/inviters-repository'
import { GuestForm } from './guest-form'

export default async function NewGuestPage() {
  const supabase = await getServerSupabase()
  const inviters = await listInviters(supabase)

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-semibold">Add guest</h1>
      <GuestForm inviters={inviters} />
    </main>
  )
}
```

- [ ] **Step 3: Manual verification**

As an inviter already at or near cap (seed one via the dashboard or `scripts/create-user.ts` + a few guests), add one more guest pushing them over. Confirm: the guest is saved (check the guest list), and the red "over cap" banner shows the correct inviter/event/overBy numbers.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire quota engine into guest creation, warn-allow-flag"
```

---

### Task 19: Waitlist promote screen + cascade wiring

**Files:**
- Modify: `src/server/repositories/guest-events-repository.ts`
- Create: `src/server/actions/waitlist-actions.ts`
- Create: `src/app/(dashboard)/waitlist/page.tsx`

**Interfaces:**
- Consumes: `buildCascade`, `checkPromotion` from Task 13; `loadInviterCapacity` from Task 16.
- Produces: `listWaitlisted(supabase, event): Promise<WaitlistedGuest[]>`; `promoteGuestEvent(guestEventId, inviterKey, side, event): Promise<{ flags: string[] }>` — always promotes (sets `invite_status = 'confirmed'`), returns a flag if the promotion itself pushes the inviter back over cap.

- [ ] **Step 1: Add waitlist listing and promotion to the repository**

```ts
// src/server/repositories/guest-events-repository.ts — append
import type { WaitlistedGuest } from '@/domain/waitlist'

export async function listWaitlisted(
  supabase: SupabaseClient,
  event: 'akad' | 'resepsi'
): Promise<Array<WaitlistedGuest & { guestEventId: string }>> {
  const { data, error } = await supabase
    .from('guest_events')
    .select('id, waitlist_rank, guests!inner(id, pax, side, inviter_key)')
    .eq('event', event)
    .eq('invite_status', 'waitlisted')
  if (error) throw new Error(`Failed to list waitlisted guests for ${event}: ${error.message}`)

  return (data ?? []).map((row) => {
    const guest = row.guests as unknown as { id: string; pax: number; side: 'fatan' | 'sita'; inviter_key: string }
    return {
      guestEventId: row.id,
      guestId: guest.id,
      inviterKey: guest.inviter_key,
      side: guest.side,
      pax: guest.pax,
      waitlistRank: row.waitlist_rank,
    }
  })
}

export async function promoteGuestEventStatus(supabase: SupabaseClient, guestEventId: string) {
  const { error } = await supabase
    .from('guest_events')
    .update({ invite_status: 'confirmed', waitlist_rank: null })
    .eq('id', guestEventId)
  if (error) throw new Error(`Failed to promote guest_event ${guestEventId}: ${error.message}`)
}
```

- [ ] **Step 2: Write the waitlist server actions**

```ts
// src/server/actions/waitlist-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '../supabase/server-client'
import { listWaitlisted, promoteGuestEventStatus } from '../repositories/guest-events-repository'
import { loadInviterCapacity } from '../repositories/inviters-repository'
import { buildCascade } from '@/domain/waitlist'
import { checkPromotion } from '@/domain/waitlist'

export async function getCascadeForEvent(inviterKey: string, side: 'fatan' | 'sita', event: 'akad' | 'resepsi') {
  const supabase = await getServerSupabase()
  const pool = await listWaitlisted(supabase, event)
  return buildCascade(pool, { inviterKey, side })
}

export async function promoteGuest(formData: FormData) {
  const supabase = await getServerSupabase()
  const guestEventId = String(formData.get('guestEventId') ?? '')
  const inviterKey = String(formData.get('inviterKey') ?? '')
  const event = String(formData.get('event') ?? '') as 'akad' | 'resepsi'

  const state = await loadInviterCapacity(supabase, inviterKey, event)
  const guestPax = Number(formData.get('guestPax'))
  const decision = checkPromotion(state.cap - state.confirmedPax, guestPax)

  await promoteGuestEventStatus(supabase, guestEventId)

  revalidatePath('/waitlist')
  return {
    flags: decision.overCap
      ? [`${inviterKey} is now over cap on ${event} after this promotion.`]
      : [],
  }
}
```

- [ ] **Step 3: Write the promote screen (admin-only — matches PRD: promotion is a judgment call made by the couple, not self-service by inviters)**

```tsx
// src/app/(dashboard)/waitlist/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/actions/auth-actions'
import { getServerSupabase } from '@/server/supabase/server-client'
import { listWaitlisted } from '@/server/repositories/guest-events-repository'
import { promoteGuest } from '@/server/actions/waitlist-actions'

const EVENTS = ['akad', 'resepsi'] as const

export default async function WaitlistPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await getServerSupabase()
  const pools = await Promise.all(EVENTS.map((event) => listWaitlisted(supabase, event)))

  async function action(formData: FormData) {
    'use server'
    await promoteGuest(formData)
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-xl font-semibold">Waitlist</h1>
      {EVENTS.map((event, i) => (
        <section key={event} className="mb-8">
          <h2 className="mb-2 font-semibold capitalize">{event}</h2>
          {pools[i].length === 0 ? (
            <p className="text-sm text-gray-500">Nobody waiting.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pools[i].map((entry) => (
                <li key={entry.guestEventId} className="flex items-center justify-between border-b py-2 text-sm">
                  <span>
                    {entry.inviterKey} — {entry.side} — {entry.pax} pax
                  </span>
                  <form action={action}>
                    <input type="hidden" name="guestEventId" value={entry.guestEventId} />
                    <input type="hidden" name="inviterKey" value={entry.inviterKey} />
                    <input type="hidden" name="event" value={event} />
                    <input type="hidden" name="guestPax" value={entry.pax} />
                    <button type="submit" className="rounded bg-black px-3 py-1 text-white">
                      Promote
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}
```

- [ ] **Step 4: Manual verification**

Seed a couple of waitlisted `guest_events` rows (via the admin client or by hand-inserting through the dashboard's SQL editor on the local stack) across different inviters/sides. Load `/waitlist` as admin, confirm both event sections list them, click Promote, confirm `invite_status` flips to `confirmed` and the row disappears from the waitlist screen.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: waitlist promote screen with slot-fill cascade"
```

---

### Task 20: Dashboard skeleton

**Files:**
- Create: `src/server/repositories/dashboard-repository.ts`
- Create: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Produces: `loadDashboardSummary(supabase): Promise<InviterSummary[]>` where `InviterSummary = { inviterKey: string; event: 'akad' | 'resepsi'; cap: number; invited: number; confirmed: number; overCap: boolean }`. Per `TECH_SPEC.md` section 5 and Phase 1 scope item 8: "confirmed defaults to invited until RSVP exists in Phase 2" — this plan does not build RSVP, so `confirmed === invited` here by construction, not a placeholder; "arrived" is Phase 3 and is omitted from this screen entirely rather than faked with a zero.

- [ ] **Step 1: Write the dashboard repository**

```ts
// src/server/repositories/dashboard-repository.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkQuota } from '@/domain/quota'
import { loadInviterCapacity } from './inviters-repository'

export type InviterSummary = {
  inviterKey: string
  event: 'akad' | 'resepsi'
  cap: number
  invited: number
  confirmed: number
  overCap: boolean
}

const EVENTS = ['akad', 'resepsi'] as const

export async function loadDashboardSummary(supabase: SupabaseClient): Promise<InviterSummary[]> {
  const { data: inviters, error } = await supabase.from('inviters').select('key')
  if (error) throw new Error(`Failed to load inviters for dashboard: ${error.message}`)

  const summaries: InviterSummary[] = []
  for (const inviter of inviters ?? []) {
    for (const event of EVENTS) {
      const state = await loadInviterCapacity(supabase, inviter.key, event)
      // confirmedPax already reflects invited-and-not-declined; Phase 1 has
      // no RSVP yet, so "invited" and "confirmed" are the same number here
      // by construction, not a stand-in for a feature that doesn't exist.
      const decision = checkQuota(state, 0)
      summaries.push({
        inviterKey: inviter.key,
        event,
        cap: state.cap,
        invited: state.confirmedPax,
        confirmed: state.confirmedPax,
        overCap: decision.overCap,
      })
    }
  }
  return summaries
}
```

- [ ] **Step 2: Write the dashboard screen**

```tsx
// src/app/(dashboard)/dashboard/page.tsx
import { getServerSupabase } from '@/server/supabase/server-client'
import { loadDashboardSummary } from '@/server/repositories/dashboard-repository'
import { countMissingPhone } from '@/server/repositories/guests-repository'

export default async function DashboardPage() {
  const supabase = await getServerSupabase()
  const [summary, missingPhoneCount] = await Promise.all([
    loadDashboardSummary(supabase),
    countMissingPhone(supabase),
  ])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold">Dashboard</h1>
      <p className="mb-6 text-sm text-gray-500">{missingPhoneCount} guests missing a phone number.</p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Inviter</th>
            <th className="py-2">Event</th>
            <th className="py-2">Invited</th>
            <th className="py-2">Cap</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={`${row.inviterKey}-${row.event}`} className={`border-b ${row.overCap ? 'bg-red-50' : ''}`}>
              <td className="py-2">{row.inviterKey}</td>
              <td className="py-2 capitalize">{row.event}</td>
              <td className={`py-2 ${row.overCap ? 'font-semibold text-red-700' : ''}`}>{row.invited}</td>
              <td className="py-2">{row.cap}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 3: Manual verification**

Sign in as admin, visit `/dashboard`. Confirm every inviter/event row renders, and any inviter over cap (per the 2026-08-01 snapshot in `PRD.md`: Mama Fatan/Akad, Mama Sita/Akad, Sita/Resepsi, Papa Fatan/Resepsi — if the sheet has since changed, whichever rows are actually over cap in the current data) shows red.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: dashboard skeleton with per-inviter capacity view"
```

---

## Self-Review

**Spec coverage** (`docs/superpowers/specs/2026-08-01-guest-management-design.md`, "Phase 1 scope"):

1. Schema migrations + RLS, all four roles — Tasks 4, 5, 6 (schema), 8, 9, 10 (RLS tests).
2. Auth, admin-created, no self-signup — Task 11.
3. `scripts/import-sheet.ts` — Tasks 14 (mapper), 15 (script).
4. Guest CRUD, scoped by role — Task 16 (RLS does the scoping, not app code).
5. Phone backfill — Task 17.
6. Quota engine, warn/allow/flag — Tasks 12, 18.
7. Waitlist, cascade, promote screen — Tasks 13, 19.
8. Dashboard skeleton — Task 20.

Non-negotiables: domain purity lint (Task 3), warn-allow-flag write path (Tasks 18, 19), derived capacity never stored (Task 12's `checkQuota` takes state in, `inviters-repository.ts`'s `loadInviterCapacity` computes from `SUM(pax)` at read time, no counter column anywhere in the schema), `souvenir_claims.guest_id UNIQUE` (Task 6, tested in Task 10), `SUPABASE_SECRET_KEY` server-only (Task 4's `admin-client.ts` is only imported by Task 15's script and Task 11's `create-user.ts`, never by any `src/app/` file), sheet-stays-live rules (Task 15 reads headers by name via `requiredHeaders()`, refuses only on missing columns, never asserts row counts), domain-before-screens ordering (Tasks 12/13/14 precede 16/18/19/20 in the task order and in every cross-reference).

**Placeholder scan:** no TBD/TODO, no "add appropriate error handling" — every step above has runnable code. The one deliberate non-implementation (usher direct guest read) is explained as a Phase 3 RPC, not left vague.

**Type consistency:** `QuotaState { cap, confirmedPax }` and `QuotaDecision { allowed, overCap, remaining, overBy }` from Task 12 are used identically in Tasks 16, 18, 20. `WaitlistedGuest` and `CascadeOffer`/`PromotionDecision` from Task 13 match the repository return shape in Task 19 (`guestEventId` added as an extension, not a rename). `MapRowResult`/`MappedGuest` from Task 14 match the script's usage in Task 15 (`mapped.row.guest`, `mapped.row.guestEvents`) and the header list (`requiredHeaders()`) is the same array literal in both the test and the implementation.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-01-guest-management-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
