-- Gifts that did not come in an envelope at the door.
--
-- A guest who could not come may still transfer money or send a present
-- ahead. They are recorded beside the envelopes, as one list of gifts, so
-- the totals and the guest's row tell the whole story. Only an envelope has
-- a printed label, so only an envelope gets a code.

alter table envelopes
  add column kind text not null default 'envelope'
    check (kind in ('envelope', 'transfer', 'item')),
  -- What an item gift is ("rice cooker"). Items usually carry no amount.
  add column item text;

alter table envelopes alter column code drop not null;

alter table envelopes
  add constraint envelopes_item_described
    check (kind <> 'item' or length(trim(coalesce(item, ''))) > 0);

-- Only envelopes are labelled, so only envelopes are numbered.
create or replace function assign_envelope_code() returns trigger
  language plpgsql as $$
declare
  prefix text := 'U';
begin
  if new.code is not null or new.kind <> 'envelope' then
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
