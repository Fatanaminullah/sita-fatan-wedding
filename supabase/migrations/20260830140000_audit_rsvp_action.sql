-- An RSVP answer is an auditable event.
--
-- `audit_log.action` is a closed CHECK, and it has no value for recording who
-- answered on a guest's behalf. It needs one, because the door now admits only
-- a confirmed `attending`: an answer entered here is what decides whether a
-- person gets into the wedding, and nobody can override that decision on the
-- day.
--
-- The couple will resolve every non-responder by hand before the QR send,
-- several hundred answers between two people over several evenings. When a
-- relative is refused at the door in October, "who recorded this, and when"
-- is the only way back to what happened.

alter table audit_log drop constraint audit_log_action_check;

alter table audit_log add constraint audit_log_action_check check (
  action = any (array[
    'guest.create',
    'guest.update',
    'guest.delete',
    'guest.rsvp',
    'caps.update',
    'waitlist.promote',
    'user.create',
    'user.update',
    'user.password_reset',
    'user.delete'
  ])
);
