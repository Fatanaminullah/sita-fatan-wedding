-- The wedding organiser's crew (role `viewer`) sees the VIP seating plan,
-- read only. Viewers already read every guest (guests_viewer_read), so
-- seeing who sits where exposes nothing they could not already see, and
-- there is no side scoping to get wrong. No write policy: RLS refuses
-- their inserts, updates and deletes by default.
create policy vip_tables_viewer_read on vip_tables for select
  using (current_profile_role() = 'viewer');

create policy vip_table_guests_viewer_read on vip_table_guests for select
  using (current_profile_role() = 'viewer');
