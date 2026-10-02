-- VIP tables open to admins and inviters, scoped to the guests they manage.
--
-- Everyone who can reach the plan reads all of it: a table mixes both sides,
-- and a plan with the other family's names missing reads as empty seats.
-- Seating is scoped: an admin seats their own side, an inviter their own
-- guests. The tables themselves (add, rename, resize, remove) stay the
-- couple's.

-- Read the plan.
create policy vip_tables_manager_read on vip_tables for select
  using (current_profile_role() in ('admin', 'inviter'));
create policy vip_table_guests_manager_read on vip_table_guests for select
  using (current_profile_role() in ('admin', 'inviter'));

-- Whether the signed-in user may seat or unseat this guest. Security definer
-- so the answer does not depend on the caller's RLS view of guests.
create function vip_seat_manageable(p_guest_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select case current_profile_role()
    when 'superadmin' then true
    when 'admin' then exists (
      select 1 from guests g where g.id = p_guest_id and g.side = current_profile_side()
    )
    when 'inviter' then exists (
      select 1 from guests g where g.id = p_guest_id and g.inviter_key = current_inviter_key()
    )
    else false
  end
$$;
revoke execute on function vip_seat_manageable(uuid) from public, anon;
grant execute on function vip_seat_manageable(uuid) to authenticated;

create policy vip_table_guests_manager_insert on vip_table_guests for insert
  with check (current_profile_role() in ('admin', 'inviter') and vip_seat_manageable(guest_id));
create policy vip_table_guests_manager_update on vip_table_guests for update
  using (current_profile_role() in ('admin', 'inviter') and vip_seat_manageable(guest_id))
  with check (current_profile_role() in ('admin', 'inviter') and vip_seat_manageable(guest_id));
create policy vip_table_guests_manager_delete on vip_table_guests for delete
  using (current_profile_role() in ('admin', 'inviter') and vip_seat_manageable(guest_id));

-- The guests the plan draws: every VIP, plus anyone seated who no longer is.
-- Seating columns only, never a phone or a note, so an admin or inviter can
-- see who sits beside their guest without being able to read the other
-- side's guest list.
create function vip_seating_guests()
returns table (
  id uuid,
  name text,
  side text,
  inviter_key text,
  pax integer,
  is_vip boolean,
  resepsi_invite text,
  resepsi_rsvp text,
  resepsi_pax integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    g.id,
    g.name,
    g.side,
    g.inviter_key,
    g.pax,
    g.is_vip,
    e.invite_status,
    e.rsvp_status,
    e.pax_confirmed
  from guests g
  left join guest_events e on e.guest_id = g.id and e.event = 'resepsi'
  where current_profile_role() in ('superadmin', 'admin', 'inviter', 'viewer')
    and (g.is_vip or exists (select 1 from vip_table_guests s where s.guest_id = g.id))
  order by g.name
$$;
revoke execute on function vip_seating_guests() from public, anon;
grant execute on function vip_seating_guests() to authenticated;
