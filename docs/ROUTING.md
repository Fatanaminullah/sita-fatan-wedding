# Routing and the Public Surface

Ported from the vault note of the same name (2026-08-16) and extended with the
decisions taken while implementing it. This file is the repo's authority for
what is public, what is behind auth, and how a guest link is formed.

## Route map

| Path | Access | State |
|---|---|---|
| `/` | public | One-pager. **Still redirects to `/dashboard`** — not built. |
| `/privacy` | public | Not built. Required before the Meta app can leave dev mode. |
| `/to/<slug>` | bearer link | Greeting built. RSVP and the rest of the invitation are not. |
| `/login` | staff | built |
| `/dashboard` `/guests` `/caps` `/waitlist` `/planner` `/users` `/audit` | authed staff | built, `noindex` |
| `/checkin` | usher | Phase 3, not built |

The vault note and `docs/INVITATION_UI_BRIEF.md` both wrote this surface as
`/to/[token]`. The path is right; the credential is not. It is `/to/<slug>`.

## Decision 1 — the slug is name + entropy

```
sitafatan.wedding/to/azka-ruhama-607cb8f0
```

`guests.public_slug`, `slugify(name)` + `-` + 8 hex characters (32 bits).

**Not name-only.** Indonesian guest names are highly guessable and guests know
each other's names. If the slug were the credential, anyone could open
`/to/budi-santoso`, read his entry and RSVP as him, with a live waitlist and
inviters already over cap.

**The entropy is not for uniqueness.** Measured against the real list on
2026-08-16: naive slugify produced 336 distinct slugs from 336 guests, zero
collisions, zero duplicate names. The 32 bits buy unguessability only.

## Decision 2 — the invite link and the entry ticket are different values

| Message | Carries | Surface |
|---|---|---|
| 1, the invite | `public_slug` | `/to/azka-ruhama-607cb8f0` |
| 2, the QR ticket | `rsvp_token` | inside the QR image only |

Invite links get forwarded into family WhatsApp groups. If the invite link and
the entry ticket were one value, forwarding would hand out entry: the recipient
reads the token out of the URL, generates their own QR, and first scan wins, so
the gate-crasher is admitted and the real guest is turned away.

**`rsvp_token` must never appear on a `/to/` page, in a query string, or in
anything `guest_by_public_slug()` returns.**

## Decision 3 — slugify rules

Decided against all 336 real names, not invented.

| Rule | Example |
|---|---|
| Drop parentheticals | `Bu Dian (Mardiana)` → `bu-dian` |
| Keep titles | `Pak Ade` → `pak-ade` |
| Couples keep both names | `Rasyid dan Rani` → `rasyid-rani` |
| Keep digits | `Adit 2` → `adit-2` |
| Lowercase, non-alphanumeric → `-`, collapse, trim | |
| Body capped at 40 characters | longest real body is 30 |
| Empty body falls back to `guest` | so `NOT NULL` cannot be broken by a name |

Titles are kept because that is how those guests are known; stripping leaves
3-character slugs and turns `Bu Bidan` into a bare role. Parentheticals are
dropped because they are internal disambiguators, and with zero duplicate names
they are not load-bearing.

What the real data actually contains: 5 couples, 18 titles, 6 parentheticals, 2
with digits, and **zero** diacritics, apostrophes, or "Keluarga" entries. The
vault note's worry about `Bapak Budi & Keluarga` does not occur.

## Decision 4 — generated on insert, never on rename

A `before insert` trigger fills `public_slug` when it is null. In the database
rather than in app code, so the guest dialog, the import script and a raw
`psql` insert all get one, and no future code path can forget — which matters
because the column is `NOT NULL`.

**There is deliberately no update trigger.** Renaming a guest does not change
their slug. Regenerating after the first send would 404 every link already in a
guest's hands. A corrected name simply keeps its original slug; the link still
resolves and the page shows the corrected name.

Pre-send typo fixes go through an explicit admin action, which should warn once
`wa_sends` contains invite rows. That is real state rather than a flag someone
has to remember to set.

> **Freeze at send time.** Once message 1 ships, slugs are immutable. Any later
> fix must be an *additional* alias, never a replacement.

## Decision 5 — admin stays where it is

No obscure admin prefix. The dashboard is protected by auth, four roles and RLS
on every table; an unpredictable path is not a security control and would only
deter bots scanning for `/wp-admin`. The routes also live in a `(dashboard)`
route group with no path segment, so a prefix means a refactor for no gain.

Instead: `noindex` on all non-production deployments and on every guest page,
plus `robots.txt` disallowing the admin paths in production.

## How `/to/<slug>` reads the guest

`guest_by_public_slug(text)`, `SECURITY DEFINER`, granted to `anon`.

Not a table grant: `guests` has no anon policy and must not get one, because a
policy broad enough to serve this page would also permit enumeration of 336
real people with phone numbers.

It returns `name`, `pax`, `side`, `is_vip`, `invited_akad`, `invited_resepsi`.
It deliberately omits `rsvp_token` (Decision 2), `phone`, `note` (internal, and
often about the guest rather than for them) and `id`. An unknown slug returns
zero rows, and no distinction is made between "never existed" and "deleted", so
the function cannot be used to probe.

Because it needs no elevated key, the page runs on the publishable key and
`SUPABASE_SECRET_KEY` stays limited to the four uses named in `CLAUDE.md`.

## Still open

- `/` one-pager: design not started
- `/privacy`: not built, and it blocks the Meta app leaving dev mode
- The rest of the invitation: `docs/INVITATION_UI_BRIEF.md`, section by section,
  prototype not yet approved
- The regenerate-slug admin action
- Confirm Supabase Auth rate limiting on `/login`
