# Physical invitation cap

Date: 2026-08-09
Status: approved

## What

Only 50 invitation cards get printed, 25 per side. The cap is side-level and
shared across that side's inviters, exactly like the VIP cap. It counts guest
entries (one card per invitation), never pax: a family of 5 uses one card.

A card is counted the moment `is_physical_invitation` is true, regardless of
RSVP status, invite status, or which events the guest is on. A declined or
waitlisted guest with the flag still consumed a printed card.

Enforcement is warn, allow, flag (docs/PRD.md): the save always succeeds; going
over cap produces a flag message at save time and a red state on the dashboard.

## Why side-level counting needs a definer function

The save-time warning needs the count of physical entries across the whole
side, but an inviter's RLS-scoped client only sees their own guests. Counting
through the request client would silently undercount for inviters, the very
people sharing the pool. A `security definer` SQL function returns the
aggregate only:

```sql
create function physical_invitation_counts()
returns table (side text, used bigint)
security definer set search_path = public
-- count(*) from guests where is_physical_invitation group by side
```

Granted to `authenticated`. No guest rows or names leak, only two integers.
This follows the existing precedent of `security definer` RLS helper functions
(migration `20260801144411_harden_rls_helper_functions.sql`).

## Changes by layer

### Migration (one file)

- `alter table side_caps add column physical_cap int not null default 0;`
- `update side_caps set physical_cap = 25;` (seed both sides, admin-editable
  afterwards like every other cap; 25 is the 2026-08-09 starting point, not a
  re-assertable snapshot)
- `physical_invitation_counts()` as above, `grant execute to authenticated`,
  `revoke from anon`.

### Domain, `src/domain/summary.ts` (TDD)

- `SummaryCaps` gains `physicalCapBySide: Record<Side, number>` and
  `physicalUsedBySide: Record<Side, number>`. The used counts are an input,
  not derived from the guest list: under an inviter's RLS the guest list is
  partial, and the whole point is showing the true shared pool. The repository
  supplies them from the definer function for every role, so admin and inviter
  read the same number.
- `SideRow` gains `physicalUsed`, `physicalCap`, `physicalRemaining`.
- `Summary.events` is untouched: physical is not a seat capacity. Side rows
  carry it; `scopeSummaryToInviter` already passes the scoped side row through.

The save-time arithmetic reuses `checkQuota` from `src/domain/quota.ts` with
`pax = 1` per entry; no new domain module.

### Server

- `dashboard-repository.ts`: add `physical_cap` to the side_caps select, call
  `physical_invitation_counts()` via RPC in the same `Promise.all`, thread
  both into `buildSummary`.
- `guest-actions.ts`: a `physicalFlag()` helper mirrors `quotaFlags()`. It runs
  only when the save results in `is_physical_invitation = true` and the guest
  was not already physical (create with flag on, or edit turning it on).
  It calls `physical_invitation_counts()` via RPC, adds 1 for the new card,
  compares against the side's `physical_cap`, and on overflow appends:
  `"Fatan side now has 26 of 25 printed invitations."` Never blocks.
- `inviters-repository.ts`: side caps read/update includes `physical_cap`.

### Dashboard, `/dashboard`

New "Printed invitations" card in the Phone coverage / Waiting list row (row
becomes `lg:grid-cols-3`). Per side: a meter `used / cap` in the same visual
language as the existing capacity meters, red plus an "N over" badge when over
(Never-Color-Alone Rule). Admin sees both sides; an inviter sees their own
side only, with the hint "Shared by your whole side". Because the used counts
come from the definer function, the inviter's meter shows the true shared
pool, not just their own RLS-visible entries.

### Caps admin, `/caps`

`physical_cap` editable per side next to `vip_cap`, same form pattern, same
audit log entry (`entity_type: 'side_caps'`).

## Out of scope, deliberately

- Per-inviter split of the 25 (owner: combined per side).
- Per-event distinction (a card is per guest, not per event).
- Any change to WA broadcast, RSVP, QR, or delivery-status flows.
- Hard blocking at the cap.

## Testing

- `summary.test.ts`: physical used/cap/remaining plumb-through to side rows,
  over-cap when used exceeds cap, scoped side row keeps the numbers.
- No new RLS test table rows: `side_caps` policies are unchanged, and the
  definer function is covered by a test in `tests/rls` asserting an
  inviter-role client gets the full-side count through it.
- Screens: manual, owner checks by eye.
