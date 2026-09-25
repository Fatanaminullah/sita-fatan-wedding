-- An inviter reads and answers the conversations of their own guests.
--
-- They already see those guests, their numbers and their answers. What the
-- guest actually typed was the one thing they had to ask the couple for, which
-- made chasing an RSVP a two-person job and defeated the point of the role.
--
-- wa_messages had no policy for `inviter` at all, so this is where the change
-- lives. Two policies rather than one FOR ALL: reading and writing are
-- different permissions, and an inviter has no business updating or deleting a
-- message once it exists.
--
-- Both are scoped to guests they own, and both are narrower than the admin
-- policy in the same way: no `guest_id is null`. An unresolved thread is a
-- number nobody has matched to a guest, which could be anybody's guest or a
-- stranger who wrote to the wedding number by mistake. An admin sees those
-- because somebody has to; an inviter has no claim on a conversation that is
-- not demonstrably theirs, and certainly may not write into one.
create policy wa_messages_inviter_own on wa_messages
  for select
  using (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = wa_messages.guest_id
        and g.inviter_key = current_inviter_key()
    )
  );

-- WITH CHECK, not USING: this governs the row being written. sendReply takes
-- guest_id from the form, so without this an inviter could file a reply
-- against somebody else's guest. The database refuses it rather than trusting
-- the request.
create policy wa_messages_inviter_reply on wa_messages
  for insert
  with check (
    current_profile_role() = 'inviter'
    and exists (
      select 1 from guests g
      where g.id = wa_messages.guest_id
        and g.inviter_key = current_inviter_key()
    )
  );
