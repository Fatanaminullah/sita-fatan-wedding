-- Fixes the role guard in both door functions.
--
-- `current_profile_role()` returns NULL when the caller has no profile row.
-- `null not in ('usher', 'admin', 'superadmin')` evaluates to NULL, and
-- plpgsql treats a NULL IF condition as false, so the guard fell through and
-- the function returned the guest. Verified against staging: a caller with a
-- null role resolved a guest by token.
--
-- Both functions are security definer, so the guard is the only access control
-- they have. coalesce makes a missing role fail closed.

create or replace function guest_by_rsvp_token(p_token uuid, p_event text)
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
  souvenir_claimed_at timestamptz,
  souvenir_claimed_via text
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
    sc.claimed_at as souvenir_claimed_at,
    sc.claimed_via as souvenir_claimed_via
  from guests g
  left join guest_events ge
    on ge.guest_id = g.id and ge.event = p_event
  left join lateral (
    select c.checked_in_at, c.checked_in_by
    from checkin_events c
    where c.guest_id = g.id and c.event = p_event
    order by c.checked_in_at asc
    limit 1
  ) ci on true
  left join profiles p on p.user_id = ci.checked_in_by
  left join souvenir_claims sc on sc.guest_id = g.id
  where g.rsvp_token = p_token;
end;
$$;

create or replace function guest_roster_for_event(p_event text, p_query text default null)
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
  souvenir_claimed_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
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
  where p_query is null
     or p_query = ''
     or g.name ilike '%' || p_query || '%'
  order by g.name;
end;
$$;
