-- Who opened their invitation.
--
-- Every invitation link is unique to one guest, so an open is attributable in
-- a way an aggregate page-view count never is. The figure worth having is not
-- the total: it is the gap between opened and answered. A guest who clicked
-- and then did not reply was interested enough to look and something stopped
-- them, and they deserve different wording from a guest who never opened it at
-- all.

alter table guests add column first_opened_at timestamptz;
alter table guests add column last_opened_at timestamptz;
alter table guests add column open_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- Recording an open
-- ---------------------------------------------------------------------------
--
-- The invitation page is unauthenticated, and `guests` has no anon policy and
-- must not get one: a policy wide enough to let the page write would be wide
-- enough to read 334 people's phone numbers.
--
-- So the write goes through a definer function that takes a slug, updates
-- exactly that row, and returns nothing at all. It cannot be used to read, and
-- it cannot be used to discover whether a slug exists: an unknown slug updates
-- zero rows and returns just as silently as a known one.
create or replace function record_invitation_open(p_slug text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update guests
     set first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at = now(),
         open_count = open_count + 1
   where public_slug = p_slug;
end;
$$;

-- anon can call it: that is the point, the page has no session. The function's
-- own WHERE clause is the access control, and it gives nothing back.
grant execute on function record_invitation_open(text) to anon, authenticated;

-- The dashboard asks "who opened but never answered", which reads by opened
-- state across the whole list.
create index if not exists guests_first_opened_at_idx on guests (first_opened_at);
