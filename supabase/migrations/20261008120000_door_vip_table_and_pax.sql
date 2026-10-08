-- The door reads the guest's VIP table and how many actually walked in.
--
-- Two additions to both door functions, nothing else:
--
--   vip_table_name  The VIP table the guest is seated at, from the seating
--                   plan, or null. Shown under the VIP band on the
--                   confirmation and on the greeting, so the usher can say
--                   where to go and the guest can read it. Ushers hold no read
--                   on vip_tables or vip_table_guests and are not given one:
--                   the name travels through these definer functions the same
--                   way every other door field does.
--
--   checked_in_pax  pax_arrived on the admission that counts (the earliest
--                   row, the same one checked_in_at already comes from). The
--                   door may now admit more than were confirmed, and the door
--                   list marks those parties; it needs the number to do it.
--
-- A function's return type cannot be altered in place, so both are dropped and
-- recreated. Bodies are otherwise exactly what production runs, read back with
-- pg_get_functiondef on 2026-10-08.

drop function if exists guest_by_rsvp_token(uuid, text);

create function guest_by_rsvp_token(p_token uuid, p_event text)
returns table (
  id uuid,
  name text,
  pax integer,
  side text,
  inviter_key text,
  is_vip boolean,
  invite_status text,
  rsvp_status text,
  pax_confirmed integer,
  checked_in_at timestamptz,
  checked_in_by_name text,
  checked_in_pax integer,
  souvenir_claimed_at timestamptz,
  souvenir_claimed_via text,
  vip_table_name text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_profile_role(), '') not in ('usher', 'admin', 'superadmin') then
    raise exception 'not authorised to resolve a guest by entry ticket';
  end if;

  if p_event not in ('akad', 'resepsi') then
    raise exception 'unknown event: %', p_event;
  end if;

  return query
  select
    g.id,
    g.name,
    g.pax,
    g.side,
    g.inviter_key,
    g.is_vip,
    ge.invite_status,
    ge.rsvp_status,
    ge.pax_confirmed,
    ci.checked_in_at,
    p.full_name as checked_in_by_name,
    ci.pax_arrived as checked_in_pax,
    sc.claimed_at as souvenir_claimed_at,
    sc.claimed_via as souvenir_claimed_via,
    vt.name as vip_table_name
  from guests g
  left join guest_events ge
    on ge.guest_id = g.id and ge.event = p_event
  left join lateral (
    select c.checked_in_at, c.checked_in_by, c.pax_arrived
    from checkin_events c
    where c.guest_id = g.id and c.event = p_event
    order by c.checked_in_at asc
    limit 1
  ) ci on true
  left join profiles p on p.user_id = ci.checked_in_by
  left join souvenir_claims sc on sc.guest_id = g.id
  left join vip_table_guests vg on vg.guest_id = g.id
  left join vip_tables vt on vt.id = vg.table_id
  where g.rsvp_token = p_token;
end;
$$;

grant execute on function guest_by_rsvp_token(uuid, text) to authenticated;

drop function if exists guest_roster_for_event(text, text);

create function guest_roster_for_event(p_event text, p_query text default null)
returns table (
  id uuid,
  name text,
  pax integer,
  side text,
  inviter_key text,
  note text,
  is_vip boolean,
  invite_status text,
  rsvp_status text,
  pax_confirmed integer,
  checked_in_at timestamptz,
  checked_in_pax integer,
  souvenir_claimed_at timestamptz,
  vip_table_name text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  -- coalesce, not a bare NOT IN: current_profile_role() is NULL for a caller
  -- with no profile row, and `NULL not in (...)` is NULL, which plpgsql treats
  -- as false. The bare form let an unknown caller straight through.
  if coalesce(current_profile_role(), '') not in ('usher', 'admin', 'superadmin') then
    raise exception 'not authorised to read the door roster';
  end if;

  if p_event not in ('akad', 'resepsi') then
    raise exception 'unknown event: %', p_event;
  end if;

  return query
  select
    g.id,
    g.name,
    g.pax,
    g.side,
    g.inviter_key,
    g.note,
    g.is_vip,
    ge.invite_status,
    ge.rsvp_status,
    ge.pax_confirmed,
    ci.checked_in_at,
    ci.pax_arrived as checked_in_pax,
    sc.claimed_at as souvenir_claimed_at,
    vt.name as vip_table_name
  from guests g
  join guest_events ge
    on ge.guest_id = g.id and ge.event = p_event
  left join lateral (
    select c.checked_in_at, c.pax_arrived
    from checkin_events c
    where c.guest_id = g.id and c.event = p_event
    order by c.checked_in_at asc
    limit 1
  ) ci on true
  left join souvenir_claims sc on sc.guest_id = g.id
  left join vip_table_guests vg on vg.guest_id = g.id
  left join vip_tables vt on vt.id = vg.table_id
  -- Searches the group as well as the name, so typing "Keluarga A" returns
  -- that whole family rather than nothing.
  where p_query is null
     or p_query = ''
     or g.name ilike '%' || p_query || '%'
     or g.note ilike '%' || p_query || '%'
  order by g.name;
end;
$$;

grant execute on function guest_roster_for_event(text, text) to authenticated;
