-- Gift envelopes, and the label that ties each one to a guest.
--
-- At the door an usher prints a label for the guest who was just let in and
-- sticks it on their envelope. After the wedding the couple count the
-- envelopes and record each amount against its code, so years later "how much
-- did X give" is one search when X has a wedding of their own.
--
-- The code is what the label carries: a side letter and a number, F-0142,
-- S-0007, and U- for somebody not on the list. It is assigned by the database
-- on insert so every path (the door function, the couple's own entries) gets
-- one from the same sequence and no two envelopes can share it.
--
-- Amounts are the couple's alone. Ushers print labels and never read this
-- table: they have no policy on it, and reach it only through
-- issue_envelope_label below, which returns what a label prints and nothing
-- about money.
create sequence envelope_code_seq;

create table envelopes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  -- Null for somebody not on the guest list. `set null` rather than cascade:
  -- deleting a guest must not delete the record of what they gave.
  guest_id uuid references guests (id) on delete set null,
  -- As printed. Kept even for a listed guest, so the record reads the same if
  -- the guest row is later renamed or removed.
  name text not null check (length(trim(name)) > 0),
  amount bigint check (amount >= 0),
  note text,
  printed_by uuid references profiles (user_id),
  recorded_at timestamptz,
  recorded_by uuid references profiles (user_id),
  created_at timestamptz not null default now()
);

create index envelopes_guest_id on envelopes (guest_id);

create function assign_envelope_code() returns trigger
  language plpgsql as $$
declare
  prefix text := 'U';
begin
  if new.code is not null then
    return new;
  end if;
  if new.guest_id is not null then
    select case side when 'fatan' then 'F' when 'sita' then 'S' else 'U' end
      into prefix from guests where id = new.guest_id;
  end if;
  new.code := coalesce(prefix, 'U') || '-' || lpad(nextval('envelope_code_seq')::text, 4, '0');
  return new;
end;
$$;

create trigger envelopes_assign_code
  before insert on envelopes
  for each row execute function assign_envelope_code();

alter table envelopes enable row level security;

create policy envelopes_superadmin_all on envelopes for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');

-- The door's one way in. Returns the guest's label, creating the envelope row
-- the first time and reusing it after, so a reprint carries the same code.
-- Refuses a guest who has not been checked in at either event: a label is for
-- an envelope that has arrived.
create function issue_envelope_label(p_guest_id uuid)
  returns table (code text, name text, side text, inviter_key text)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_guest guests%rowtype;
  v_code text;
begin
  if current_profile_role() not in ('usher', 'admin', 'superadmin') then
    raise exception 'Only door staff can print envelope labels.';
  end if;

  select * into v_guest from guests where id = p_guest_id;
  if not found then
    raise exception 'That guest is not on the list.';
  end if;

  if not exists (select 1 from checkin_events c where c.guest_id = p_guest_id) then
    raise exception '% has not been checked in yet.', v_guest.name;
  end if;

  select e.code into v_code from envelopes e
    where e.guest_id = p_guest_id order by e.created_at limit 1;
  if v_code is null then
    insert into envelopes (guest_id, name, printed_by)
      values (p_guest_id, v_guest.name, auth.uid())
      returning envelopes.code into v_code;
  end if;

  return query select v_code, v_guest.name, v_guest.side, v_guest.inviter_key;
end;
$$;

-- For an envelope from somebody who is not on the list: a colleague sent in
-- someone's place, a guest's plus-one who brought their own. Always a new
-- envelope; there is no guest to reuse one from.
create function issue_unlisted_envelope_label(p_name text)
  returns table (code text, name text)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_code text;
begin
  if current_profile_role() not in ('usher', 'admin', 'superadmin') then
    raise exception 'Only door staff can print envelope labels.';
  end if;
  if v_name = '' then
    raise exception 'Write the name on the envelope first.';
  end if;

  insert into envelopes (guest_id, name, printed_by)
    values (null, left(v_name, 80), auth.uid())
    returning envelopes.code into v_code;

  return query select v_code, left(v_name, 80);
end;
$$;

revoke all on function issue_envelope_label(uuid) from public, anon;
revoke all on function issue_unlisted_envelope_label(text) from public, anon;
grant execute on function issue_envelope_label(uuid) to authenticated;
grant execute on function issue_unlisted_envelope_label(text) to authenticated;
