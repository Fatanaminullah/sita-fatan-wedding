-- An inviter can read the conversations of their own guests.
--
-- They already see those guests, their phone numbers and their answers on the
-- guests screen. The replies those same guests typed were the one thing they
-- could not see, so an inviter chasing an RSVP had to ask the couple what the
-- guest had said.
--
-- Scoped to guests they own, and deliberately narrower than the admin policy
-- in one way: no `guest_id is null`. An unresolved thread is a number nobody
-- has matched to a guest yet, which could be anybody's guest or a stranger who
-- wrote to the wedding number by mistake. An admin sees those because somebody
-- has to; an inviter has no claim on a conversation that is not demonstrably
-- theirs.
--
-- Read only. USING governs what a row may be seen through, and with no WITH
-- CHECK clause and no insert of their own, an inviter cannot write a message
-- into a thread. Replying stays with the couple and their admins, where
-- sendReply also refuses them: a reply leaves the wedding's own number and
-- reads as the couple, which is a different thing from reading.
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
