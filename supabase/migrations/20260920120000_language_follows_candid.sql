-- The invitation's language follows the version of it, not a separate tick.
--
-- `guests.language` has existed since 20260823100000 to pick the Meta
-- template variant, and 20260916130000 handed it to /to/<slug> as the page's
-- opening language. Nothing has ever seeded it: `seedLanguageFromName` in
-- src/domain/language.ts was drafted for the import and never wired in, so
-- every row sits on the column default, 'en'. That means every guest opens
-- the page in English, including the families' guests who would rather read
-- Indonesian. The guests table can correct a row by hand, and nobody has.
--
-- The answer is already in the row. `candid` decides which version of the
-- invitation a guest gets (studio photographs, the dress code without a
-- hijab, both event doors), and since 20260919200000 it follows the inviter:
-- the couple's own friends get it, the families' guests do not. That is the
-- same split as the language. So the couple's friends read English and the
-- families' guests read Indonesian, from one flag, which means a guest can
-- never be shown the studio set in Indonesian or the hijab set in English.
--
-- The WhatsApp template reads the same column, so the message and the page it
-- links to are now guaranteed to agree. They were not before.

-- Existing rows, except any a human has already corrected. A language edit
-- from the guests screen writes an audit_log row whose diff carries the
-- `language` key (src/server/actions/guest-actions.ts, case 'language'), so
-- that is what a deliberate choice looks like from here, and it is left
-- alone. Everything else is derived, written as a full case rather than a
-- one-way flip so the table ends up in the state the rule describes.
update guests g
   set language = case when g.candid then 'en' else 'id' end
 where g.language is distinct from (case when g.candid then 'en' else 'id' end)
   and not exists (
     select 1
       from audit_log a
      where a.entity_type = 'guest'
        and a.entity_id = g.id::text
        and a.diff ? 'language'
   );

-- New rows, and rows whose version changes later.
--
-- INSERT: the column default is 'en', so a caller who said nothing and a
-- caller who said 'en' are indistinguishable here, exactly as they are for
-- `candid` itself. Only that default is overridden, so a hijab guest inserted
-- with an explicit 'en' still lands on 'id'. Setting a language against the
-- rule is an UPDATE, which is the same shape as the `candid` tick it follows
-- and the same shape the guests screen already writes.
--
-- UPDATE: when a superadmin moves a guest between versions, the language
-- moves with them, because flipping `candid` is a statement about who the
-- guest is and the photographs and the words should not then disagree. A
-- statement that leaves `candid` alone is not touched at all, which is the
-- inline editor's write (src/server/actions/guest-actions.ts writes one
-- field per statement), so a correction made there stands.
--
-- The one case this cannot serve: a single statement that flips `candid` and
-- names a `language` equal to the row's current one. A BEFORE trigger cannot
-- tell that apart from a statement that never mentioned `language`, so the
-- flip wins. Nothing in the app writes both columns at once; to keep a
-- language across a version change, set it in a second statement.
create function default_guests_language() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if not new.candid and new.language = 'en' then
      new.language := 'id';
    end if;
  elsif new.candid is distinct from old.candid
    and new.language is not distinct from old.language then
    new.language := case when new.candid then 'en' else 'id' end;
  end if;
  return new;
end;
$$;

comment on function default_guests_language is
  'Language follows the invitation version: candid (non-hijab) reads English, everyone else Indonesian. An explicit language UPDATE overrides it.';

-- Named to sort between `guests_default_candid`, which must have settled
-- `candid` before this reads it, and `guests_guard_candid`, which decides
-- whether the caller was allowed to ask for that version at all. Postgres
-- fires BEFORE triggers in name order: default_candid, default_language,
-- guard_candid.
create trigger guests_default_language
  before insert or update on guests
  for each row execute function default_guests_language();
