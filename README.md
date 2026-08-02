# Sita and Fatan wedding invitation

Wedding invitation and guest-management app. Wedding date: 10 October 2026, one
day, two events (Akad then Resepsi).

Replaces the Google Sheet that tracked the guest list. After the one-shot
import at cut-over, this app is the only source of truth.

## Stack

Next.js (App Router) + TypeScript, Supabase (Postgres, RLS, email+password
auth), Tailwind, Vitest. Hosted on Vercel.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the keys from the Supabase dashboard
npm run dev
```

`.env.local` is required: the app will not boot without
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
`SUPABASE_SECRET_KEY` is server-only and bypasses RLS. `SUPABASE_ACCESS_TOKEN`
is for the `supabase` CLI only. See `.env.example` for the full notes.

## Commands

| | |
|---|---|
| `npm run dev` | dev server on :3000 |
| `npm test` | Vitest (domain + lint-purity + RLS integration) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | typecheck |
| `npx supabase db push --linked` | apply migrations (dry-run first) |
| `npx tsx scripts/import-sheet.ts <file.xlsx>` | one-shot guest import |

The RLS tests run against the real Supabase project and create then delete
their own users and guests. They need a populated `.env.local`.

## Docs

`docs/PRD.md` (product), `docs/TECH_SPEC.md` (architecture),
`docs/DATA_MODEL.md` (schema and RLS), `CLAUDE.md` (rules for AI agents).
