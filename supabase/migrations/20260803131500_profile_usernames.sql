-- Usernames on profiles, so an account can sign in with a handle instead of an
-- email (docs/PRD.md, "Login"). The addresses on auth.users were never real
-- inboxes: nothing is ever sent to them, accounts are created confirmed and
-- passwords are handed over in person. Email still works as an identifier, the
-- login form accepts either.

alter table profiles add column username text;

-- Backfill: first word of the full name, lowercased, with anything outside the
-- allowed character set stripped. Collisions get a numeric suffix so the unique
-- constraint below can be added in the same migration.
with derived as (
  select
    user_id,
    base,
    row_number() over (partition by base order by user_id) as rn
  from (
    select
      user_id,
      regexp_replace(lower(split_part(full_name, ' ', 1)), '[^a-z0-9._-]', '', 'g') as base
    from profiles
  ) stripped
)
update profiles p
set username = case when d.rn = 1 then d.base else d.base || d.rn::text end
from derived d
where d.user_id = p.user_id;

alter table profiles
  alter column username set not null,
  add constraint profiles_username_unique unique (username),
  -- Same rule as checkUsername in src/domain/username.ts. The `@` is excluded
  -- by the character class, which is what lets the login form tell a username
  -- and an email apart without guessing.
  add constraint profiles_username_format
    check (username ~ '^[a-z0-9][a-z0-9._-]{0,30}[a-z0-9]$');

-- Sign-in happens before there is a session, so the lookup from username to
-- email runs as `anon` and cannot go through RLS. Narrow security definer
-- function instead of opening `profiles` up: it takes one username and returns
-- one email, nothing else. It does let an unauthenticated caller confirm
-- whether a username exists, which is the same thing the sign-in attempt itself
-- would reveal, on a six-account internal app.
create function email_for_username(p_username text) returns text
  language sql stable security definer set search_path = public, pg_temp as $$
  select u.email::text
  from profiles p
  join auth.users u on u.id = p.user_id
  where p.username = lower(trim(p_username))
$$;

revoke execute on function email_for_username(text) from public;
grant execute on function email_for_username(text) to anon, authenticated, service_role;
