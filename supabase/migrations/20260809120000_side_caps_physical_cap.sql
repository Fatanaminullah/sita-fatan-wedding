-- Only 50 invitation cards get printed, 25 per side, shared across that
-- side's inviters exactly like the VIP cap. The cap counts guest entries
-- (one card per invitation), never pax, and a card is counted the moment
-- is_physical_invitation is true regardless of RSVP or invite status: a
-- declined guest with the flag still consumed a printed card.
--
-- Seeded 25 per side as of 2026-08-09; admin-editable afterwards on /caps
-- like every other cap, so this is a starting point, not a re-assertable
-- snapshot.
alter table side_caps
  add column physical_cap int not null default 0;

update side_caps set physical_cap = 25;

-- The save-time over-cap warning and the dashboard meter both need the count
-- of physical entries across the WHOLE side, but an inviter's RLS-scoped
-- client only sees their own guests. Counting through the request client
-- would silently undercount for inviters, the very people sharing the pool.
-- security definer returns the aggregate only: two integers, no guest rows.
-- Same precedent as the RLS helper functions
-- (20260801144411_harden_rls_helper_functions.sql).
create or replace function physical_invitation_counts()
returns table (side text, used bigint)
language sql
security definer
set search_path = public
stable
as $$
  select g.side, count(*)::bigint as used
  from guests g
  where g.is_physical_invitation
  group by g.side
$$;

revoke all on function physical_invitation_counts() from public;
revoke all on function physical_invitation_counts() from anon;
grant execute on function physical_invitation_counts() to authenticated;
