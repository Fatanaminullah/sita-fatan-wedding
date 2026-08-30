-- The roster carries the guest's note, and searches it.
--
-- `note` was excluded from guest_roster_for_event on the grounds that it is
-- internal and often about the guest rather than for them. That was wrong
-- about how the column is actually used: it holds the group a guest belongs to
-- ("Keluarga A", "Keluarga B"), which is how the couple tell one Wati from
-- another at a door. Without it the list is a wall of names with no way to
-- distinguish them, and searching it is how an usher finds a whole family at
-- once.
--
-- `phone` stays excluded. That part of the original rule holds: nobody at a
-- door needs a phone number, and it is the most sensitive column on the table.
--
-- A function's return type cannot be altered in place, so this drops and
-- recreates rather than replacing.

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
  souvenir_claimed_at timestamptz
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
    sc.claimed_at as souvenir_claimed_at
  from guests g
  join guest_events ge
    on ge.guest_id = g.id and ge.event = p_event
  left join lateral (
    select c.checked_in_at
    from checkin_events c
    where c.guest_id = g.id and c.event = p_event
    order by c.checked_in_at asc
    limit 1
  ) ci on true
  left join souvenir_claims sc on sc.guest_id = g.id
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
