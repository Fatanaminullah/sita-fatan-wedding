-- Guest invite slugs: /g/<name>-<8 hex>
--
-- The slug is the credential for the invite link. It is deliberately NOT the
-- entry ticket: `guests.rsvp_token` stays separate and ships only inside the
-- D-7 QR image. Invite links get forwarded into family WhatsApp groups, and if
-- the two were one value, forwarding would hand out entry. Split, a forwarded
-- invite leaks only RSVP.
--   -> docs/ROUTING.md, Decision 2. Never render rsvp_token on a /g/ page.
--
-- Why name + entropy rather than name alone: Indonesian guest names are highly
-- guessable and guests know each other's names. A name-only slug would let
-- anyone open /g/budi-santoso and RSVP as Budi or read his entry, with a live
-- waitlist and several inviters already over cap.
--
-- Why entropy is not about uniqueness: measured against the real list on
-- 2026-08-16, naive slugify already produced 336 distinct slugs from 336
-- guests, zero collisions. The 32 bits buy unguessability, not disambiguation.

-- Slug body from a guest name. Rules decided against the real 336 names:
--
--   drop parentheticals   "Bu Dian (Mardiana)"  -> bu-dian
--                         internal disambiguators, not how anyone is addressed
--   keep titles           "Pak Ade"             -> pak-ade
--                         how these guests are known; stripping leaves 3-char
--                         slugs and turns "Bu Bidan" into a bare role
--   couples keep both     "Rasyid dan Rani"     -> rasyid-rani
--                         both people open the same link and should see
--                         themselves in it
--   keep digits           "Adit 2"              -> adit-2
--   cap at 40 chars       longest real body is 30; this is headroom, not a
--                         constraint anything hits today
create or replace function slugify_guest_name(p_name text) returns text
  language sql immutable strict set search_path = public, pg_temp as $$
  select regexp_replace(
    left(
      regexp_replace(
        regexp_replace(
          lower(
            -- '&' and the word 'dan' become plain separators
            regexp_replace(
              -- parentheticals go first, so "(Om Iskandar)" never reaches the body
              regexp_replace(p_name, '\s*\([^)]*\)', '', 'g'),
              '\s*(&|\mdan\M)\s*', ' ', 'gi')
          ),
          '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'),
    40),
  '-+$', '')
$$;

-- Body + 32 bits of crypto-random hex, retried on the astronomically unlikely
-- collision. A name that slugifies to nothing (punctuation only) falls back to
-- 'guest', so the column can be NOT NULL without a name being able to break an
-- insert.
create or replace function generate_guest_slug(p_name text) returns text
  language plpgsql volatile set search_path = public, extensions, pg_temp as $$
declare
  v_body text;
  v_slug text;
begin
  v_body := coalesce(nullif(slugify_guest_name(p_name), ''), 'guest');

  for _ in 1..10 loop
    v_slug := v_body || '-' || encode(gen_random_bytes(4), 'hex');
    if not exists (select 1 from guests where public_slug = v_slug) then
      return v_slug;
    end if;
  end loop;

  -- Ten collisions on 32 bits means something is wrong with the entropy
  -- source, not bad luck. Fail loudly rather than loop forever.
  raise exception 'could not generate a unique slug for %', p_name;
end;
$$;

alter table guests add column public_slug text;

-- Backfill before the NOT NULL. Existing rows keep whatever their name is now;
-- renames after this point deliberately do NOT change the slug.
update guests set public_slug = generate_guest_slug(name) where public_slug is null;

alter table guests alter column public_slug set not null;
create unique index guests_public_slug_key on guests (public_slug);

-- New guests get a slug automatically, from any path: the guest dialog, the
-- import script, a psql insert. Doing this in the database rather than in app
-- code means no future code path can forget, which matters because the column
-- is NOT NULL.
--
-- Only fires when public_slug is null, so an explicit regenerate can pass a
-- value and have it respected.
create or replace function set_guest_public_slug() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if new.public_slug is null then
    new.public_slug := generate_guest_slug(new.name);
  end if;
  return new;
end;
$$;

create trigger guests_set_public_slug
  before insert on guests
  for each row execute function set_guest_public_slug();

-- Deliberately NO update trigger. A corrected name must not silently change a
-- link that is already in a guest's hands: regenerating after the first
-- WhatsApp send 404s every link already delivered. Pre-send typo fixes go
-- through an explicit admin action instead.
--   -> docs/ROUTING.md, "Freeze slugs at send time"

comment on column guests.public_slug is
  'Invite-link credential for /g/<slug>. Generated once at insert, never auto-updated on rename. NOT the entry ticket: that is rsvp_token, which ships only in the D-7 QR and must never appear on a /g/ page or in a URL.';
