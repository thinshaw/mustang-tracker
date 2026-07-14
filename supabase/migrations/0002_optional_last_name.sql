-- Roster entry is first-name-first.
--
-- Traci adds kids by talking ("add Marcus, Kayla, Josh") or by pasting a CSV
-- column of first names. Requiring a last name up front would either reject
-- those inserts outright or generate display names like "Marcus ." — so the
-- last name becomes optional, and the display name simply omits the initial
-- until there is one.
--
-- CLAUDE.md: first-name matching is the norm; the last initial exists to break
-- collisions. So carry the initial only when we actually have it.

alter table students drop column display_name;

alter table students alter column last_name drop not null;

alter table students
  add column display_name text
  generated always as (
    case
      when last_name is null or btrim(last_name) = '' then first_name
      else first_name || ' ' || left(btrim(last_name), 1) || '.'
    end
  ) stored;
