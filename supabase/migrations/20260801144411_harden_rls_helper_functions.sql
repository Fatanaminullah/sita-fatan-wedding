-- Harden the RLS helper functions from the previous migration:
-- pin search_path to include pg_temp explicitly (standard SECURITY DEFINER
-- hardening), and revoke EXECUTE from public/anon so these aren't callable
-- as an anonymous RPC endpoint. `authenticated` keeps access since every
-- RLS policy on profiles/inviters/side_caps calls these functions.

create or replace function current_profile_role() returns text
  language sql stable security definer set search_path = public, pg_temp as $$
  select role from profiles where user_id = auth.uid()
$$;

create or replace function current_inviter_key() returns text
  language sql stable security definer set search_path = public, pg_temp as $$
  select inviter_key from profiles where user_id = auth.uid()
$$;

revoke execute on function current_profile_role() from public, anon;
revoke execute on function current_inviter_key() from public, anon;
