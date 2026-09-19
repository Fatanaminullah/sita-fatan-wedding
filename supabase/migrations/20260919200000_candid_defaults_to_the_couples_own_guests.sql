-- The non-hijab invitation follows the inviter, not a hand-tick.
--
-- `candid` began as a per-guest choice the couple made one by one. It now
-- decides a whole version of the invitation (the unveiled studio photos, the
-- non-hijab figure in the dress code, both event doors), and the answer is
-- the same for everyone the couple invited themselves: their own friends see
-- it, the families' guests do not. Ticking 129 rows by hand is not a decision,
-- it is a chore, so the default comes from the inviter and the tick stays for
-- the exceptions.
--
-- One function holds the list, because "who is the couple" is a fact that may
-- gain a key and must not be spelled out in three places.
create function couple_inviter_keys() returns text[]
  language sql immutable set search_path = public, pg_temp as $$
  select array['Fatan', 'Sita']::text[]
$$;

comment on function couple_inviter_keys is
  'Inviters who are the couple themselves. Their guests get the non-hijab invitation by default.';

-- Existing rows. A guest already ticked stays ticked; nobody is untucked by
-- this, because an explicit tick on a family guest was a deliberate choice.
update guests
   set candid = true
 where inviter_key = any (couple_inviter_keys())
   and candid = false;

-- New rows. An insert that says nothing about `candid` gets the inviter's
-- answer. Named to sort before `guests_guard_candid`, which is what then
-- decides whether the caller was allowed to ask for it: Postgres fires BEFORE
-- triggers in name order, so the default is in place by the time the guard
-- reads it.
create function default_guests_candid() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if not new.candid and new.inviter_key = any (couple_inviter_keys()) then
    new.candid := true;
  end if;
  return new;
end;
$$;

create trigger guests_default_candid
  before insert on guests
  for each row execute function default_guests_candid();

-- The guard has to let that default through. Without this, an inviter adding
-- a guest of their own would be refused for a value they never set: the guard
-- raises on any INSERT carrying `candid` true from a non-superadmin, and the
-- trigger above has just set it. An UPDATE is unchanged, still superadmin
-- only, because changing a guest's version after the fact is a real decision.
create or replace function guard_guests_candid() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'service_role' or current_profile_role() = 'superadmin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.candid and not (new.inviter_key = any (couple_inviter_keys())) then
      raise exception 'Only superadmin may set candid on a guest.';
    end if;
  elsif new.candid is distinct from old.candid then
    raise exception 'Only superadmin may change candid on a guest.';
  end if;
  return new;
end;
$$;
