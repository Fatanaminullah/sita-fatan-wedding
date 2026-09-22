-- WhatsApp Cloud API: inbound inbox, delivery status, and per-guest template
-- language. Handover context: FATAN.HQ "WhatsApp Broadcast - Cloud API Setup".
--
-- Why an inbox has to exist at all: a number registered to Cloud API cannot be
-- opened in WhatsApp Messenger or the WhatsApp Business app, and Meta Business
-- Suite Inbox does not cover Cloud API numbers. There is no inbox anywhere.
-- Webhooks are the only way a guest's reply is ever seen. Without this table,
-- every message ~336 guests send to the wedding number is discarded.

-- 1. Template language, per guest.
--
-- Templates are submitted to Meta as language variants under one name
-- (wedding_invitation_v1 in en and id), so the app, not Meta, decides which
-- variant a guest receives.
--
-- Default 'en' matches the invitation site, which is English-only (owner's
-- call, 2026-08-09). The import heuristic in src/domain/language.ts seeds this
-- from Indonesian honorifics preserved in guests.name; it is a seed, not an
-- answer, and the couple hand-correct the list from the guests screen.
alter table guests add column language text not null default 'en'
  check (language in ('en', 'id'));

-- 2. Delivery status keyed to what we sent.
--
-- wa_sends is the campaign ledger and predates the Cloud API decision, so it
-- had nowhere to record Meta's message id. Without it a status callback cannot
-- be matched to the send it describes.
alter table wa_sends add column provider_message_id text unique;

-- Meta reports read receipts, which the original vocabulary did not
-- anticipate. 'link_opened' stays: it is our own signal, not Meta's.
alter table wa_sends drop constraint wa_sends_status_check;
alter table wa_sends add constraint wa_sends_status_check
  check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'link_opened'));

-- 3. The conversation itself.
create table wa_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound', 'outbound')),

  -- The counterpart's number as Meta sends it: digits, no plus. Kept verbatim
  -- rather than normalized, because it is the thread key and must survive a
  -- guest whose stored phone is wrong or absent.
  wa_id text not null,

  -- Nullable on purpose. A message from a number matching no guest is still a
  -- real person writing to the wedding, and losing it would be the exact
  -- failure this table exists to prevent.
  guest_id uuid references guests (id),

  -- Meta redelivers on any non-200, so dedupe is a constraint, not a code
  -- path. The recording function relies on this via ON CONFLICT DO NOTHING.
  provider_message_id text not null unique,

  type text not null,
  -- Null for the types we store but do not render (image, audio, sticker).
  -- The row still proves someone wrote, which is what stops a silent drop.
  body text,

  -- Meta's own timestamp, not our receipt time. Ordering a thread by arrival
  -- would reshuffle it whenever a retry lands late.
  sent_at timestamptz not null,

  status text check (status in ('sent', 'delivered', 'read', 'failed')),
  status_at timestamptz,
  error_code int,
  error_title text,

  -- Who typed an outbound reply. Null for inbound, and null for anything sent
  -- by a script rather than a person.
  sent_by uuid references profiles (user_id),

  created_at timestamptz not null default now()
);

create index wa_messages_thread on wa_messages (wa_id, sent_at desc);
create index wa_messages_guest on wa_messages (guest_id);

alter table wa_messages enable row level security;

-- The inbox is admin and superadmin only. Inviters get no policy: a guest's
-- reply is a private conversation with the couple, not inviter-visible
-- roster data, and viewers are read-only reporting.
create policy wa_messages_superadmin_all on wa_messages for all
  using (current_profile_role() = 'superadmin')
  with check (current_profile_role() = 'superadmin');

-- An admin sees their own side's guests, plus every unresolved number.
-- Unresolved is deliberately visible to both admins rather than superadmin
-- only: nobody knows whose guest it is until someone reads it, and a message
-- routed to nobody is a message nobody triages.
create policy wa_messages_admin_side on wa_messages for all
  using (
    current_profile_role() = 'admin'
    and (
      guest_id is null
      or exists (
        select 1 from guests g
        where g.id = wa_messages.guest_id and g.side = current_profile_side()
      )
    )
  )
  with check (
    current_profile_role() = 'admin'
    and (
      guest_id is null
      or exists (
        select 1 from guests g
        where g.id = wa_messages.guest_id and g.side = current_profile_side()
      )
    )
  );

-- 4. The webhook's write path.
--
-- /api/whatsapp/webhook is public: Meta calls it with no session. The
-- precedent set by guest_by_public_slug is followed here rather than reaching
-- for SUPABASE_SECRET_KEY, whose four sanctioned callers (CLAUDE.md) stay at
-- four. A service-role client sitting in a public route would hold full read
-- and write on every table, including 336 phone numbers, to do a job that
-- needs one insert.
--
-- But that precedent does not transfer unchanged. guest_by_public_slug is safe
-- to grant to anon because it only reads and the slug is itself the
-- credential. These functions write, and X-Hub-Signature-256 is verified in
-- Node, where Postgres cannot see it. So the grant is gated on a secret the
-- browser never holds.
create schema if not exists private;

-- One row, enforced by the primary key. Populated out of band, never by a
-- migration and never committed. Empty means the webhook writes nothing:
-- the functions below fail closed rather than open.
create table private.wa_webhook_secret (
  id boolean primary key default true check (id),
  secret text not null
);
alter table private.wa_webhook_secret enable row level security;
-- No policies, and no grants on the schema: only a SECURITY DEFINER function
-- owned by the migration role can read this.
revoke all on schema private from public, anon, authenticated;
revoke all on private.wa_webhook_secret from public, anon, authenticated;

create function private.wa_secret_ok(p_secret text) returns boolean
  language sql stable security definer set search_path = private, pg_temp as $$
  select exists (
    select 1 from private.wa_webhook_secret
    -- Both sides cast to text so a null stored secret cannot match a null
    -- argument. An unpopulated table returns false, not true.
    where secret = p_secret and p_secret is not null and length(p_secret) > 0
  )
$$;

-- Record one inbound or outbound message.
--
-- Returns void. That is load-bearing: a caller who somehow holds the secret
-- still learns nothing about whether the number matched a guest, so this
-- cannot be turned into an enumeration oracle against the guest list.
create function wa_webhook_record_message(
  p_secret text,
  p_direction text,
  p_wa_id text,
  p_provider_message_id text,
  p_type text,
  p_body text,
  p_sent_at timestamptz
) returns void
  language plpgsql volatile security definer set search_path = public, private, pg_temp as $$
declare
  matched_guest uuid;
begin
  if not private.wa_secret_ok(p_secret) then
    raise exception 'unauthorized';
  end if;

  -- Meta sends digits with no plus; guests.phone is E.164 from
  -- src/domain/phone.ts. Compare on the digits of both so a stored number that
  -- was normalized differently still resolves.
  select g.id into matched_guest
  from guests g
  where g.phone is not null
    and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_wa_id, '\D', '', 'g')
  limit 1;

  insert into wa_messages (
    direction, wa_id, guest_id, provider_message_id, type, body, sent_at
  ) values (
    p_direction, p_wa_id, matched_guest, p_provider_message_id, p_type, p_body, p_sent_at
  )
  on conflict (provider_message_id) do nothing;
end;
$$;

-- Record a delivery status callback.
--
-- The message id may belong to either table: wa_sends for a template campaign
-- send, wa_messages for a free-form reply typed in the inbox. Both are
-- updated, and a callback for an id we do not know is silently ignored, since
-- Meta will keep retrying anything that errors.
create function wa_webhook_record_status(
  p_secret text,
  p_provider_message_id text,
  p_status text,
  p_status_at timestamptz,
  p_error_code int,
  p_error_title text
) returns void
  language plpgsql volatile security definer set search_path = public, private, pg_temp as $$
begin
  if not private.wa_secret_ok(p_secret) then
    raise exception 'unauthorized';
  end if;

  update wa_messages
     set status = p_status,
         status_at = p_status_at,
         error_code = p_error_code,
         error_title = p_error_title
   where provider_message_id = p_provider_message_id
     -- Meta's callbacks are not ordered. Never walk a status backwards from
     -- read to sent because a delayed retry arrived after the newer one.
     and (status_at is null or p_status_at >= status_at);

  update wa_sends
     set status = p_status,
         error_message = p_error_title
   where provider_message_id = p_provider_message_id;
end;
$$;

-- anon executes these: the webhook route is unauthenticated by definition.
-- The secret argument is the access control, checked before any write.
revoke execute on function wa_webhook_record_message(text, text, text, text, text, text, timestamptz) from public;
revoke execute on function wa_webhook_record_status(text, text, text, timestamptz, int, text) from public;
grant execute on function wa_webhook_record_message(text, text, text, text, text, text, timestamptz) to anon, authenticated;
grant execute on function wa_webhook_record_status(text, text, text, timestamptz, int, text) to anon, authenticated;
