-- Let a sender append to the attempt log, and nothing more.
--
-- 20260901030000 created wa_send_attempts with read policies only, on the
-- assumption that rows would arrive through the secret key. They do not:
-- sendWave runs on the request-scoped, RLS-bound client, so every insert would
-- have been refused and the log would have stayed permanently empty. Routing it
-- through the secret key instead would have added a fifth service-role site,
-- which CLAUDE.md makes a decision to take with the owner rather than a
-- refactor.
--
-- Insert-yes, update-no, delete-no is a better answer than the secret key
-- anyway. It is append-only enforced by the database against the application's
-- own role, rather than append-only by convention in code that holds a key
-- which could do anything. There are deliberately no update or delete policies
-- here, and none should be added: a log its writer can rewrite is not a log.

create policy wa_send_attempts_superadmin_insert on wa_send_attempts for insert
  with check (current_profile_role() = 'superadmin');

create policy wa_send_attempts_admin_side_insert on wa_send_attempts for insert
  with check (
    current_profile_role() = 'admin'
    and exists (
      select 1 from guests g
      where g.id = wa_send_attempts.guest_id and g.side = current_profile_side()
    )
  );

comment on table wa_send_attempts is
  'Append-only. One row per attempt. Senders may insert; nobody may update or delete, which is enforced by the absence of those policies rather than by convention.';
