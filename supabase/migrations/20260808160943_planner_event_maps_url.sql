-- A map link belongs beside the location name, not inside it. Before this,
-- the only place to put one was `location`, which meant a chip that should
-- read "Salte" rendered a raw maps.app.goo.gl URL instead.
--
-- Additive and nullable: nothing existing is read, altered or dropped, and
-- every current row keeps whatever `location` already holds. The table's
-- existing admin-only policy covers the new column, so no policy changes.
--
-- Only http and https are accepted. The value is rendered as an href, so a
-- javascript: URL here would be stored XSS. The server action validates the
-- scheme too; this constraint is the backstop that holds even if a future
-- write path forgets to.
alter table planner_events
  add column maps_url text
  constraint planner_events_maps_url_is_http check (
    maps_url is null or maps_url ~* '^https?://'
  );
