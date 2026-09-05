-- guests.candid is the couple's call and nobody else's: it decides who sees
-- the at-home photo series. Admins and inviters can edit every other field
-- of a guest through RLS, so the column needs its own guard, the same shape
-- as guard_guest_events_rsvp_columns.
create function guard_guests_candid() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'service_role' or current_profile_role() = 'superadmin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.candid then
      raise exception 'Only superadmin may set candid on a guest.';
    end if;
  elsif new.candid is distinct from old.candid then
    raise exception 'Only superadmin may change candid on a guest.';
  end if;
  return new;
end;
$$;

create trigger guests_guard_candid
  before insert or update on guests
  for each row execute function guard_guests_candid();
