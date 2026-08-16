-- VIP is the only cap that is per side rather than per inviter, and an
-- inviter's RLS view of `guests` stops at their own rows. So an inviter's
-- dashboard could pair their own VIP pax with the whole side's cap: Abi Fatan
-- read "13 / 25, 12 left" while the fatan side actually held 26 against 25.
--
-- This returns one integer, the caller's own side's VIP pax. No guest rows and
-- no other side: an inviter learns their side's total, which is the number the
-- cap is about, and nothing else. Superadmins have no side and do not need it
-- (their summary aggregates both sides through the normal RLS path), so they
-- get null rather than a silent 0 that would read as "no VIP booked".
--
-- Definition of a VIP seat matches src/domain/summary.ts: VIP counts only on
-- Resepsi, only for a confirmed invite, and a declined RSVP gives the seat
-- back. Keep the two in step; a divergence here is invisible on screen.
create or replace function current_side_vip_used() returns integer
  language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when (select side from profiles where user_id = auth.uid()) is null then null
    else (
      select coalesce(sum(g.pax), 0)::int
      from guests g
      join guest_events ge on ge.guest_id = g.id
      where g.is_vip
        and ge.event = 'resepsi'
        and ge.invite_status = 'confirmed'
        and ge.rsvp_status <> 'not_attending'
        and g.side = (select side from profiles where user_id = auth.uid())
    )
  end
$$;

-- Same hardening as the other helpers (20260801144411): pg_temp pinned in the
-- search_path, and not callable anonymously.
revoke execute on function current_side_vip_used() from public, anon;
