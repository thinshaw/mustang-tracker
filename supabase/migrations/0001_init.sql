-- Mustang Tracker — initial schema
--
-- Design notes (see CLAUDE.md):
--   * Statuses are a TABLE, not an enum. Traci may still want "late",
--     "excused", or "retake". Adding one must be an INSERT, not a migration.
--   * Behaviour hangs off status FLAGS, not off hardcoded status names, so
--     "Who Owes What" and "Re-teach Radar" keep working when she adds one.
--   * Every table is owned via classes.owner_id and locked by RLS. The anon
--     key ships in the browser, so RLS is the only thing standing between a
--     stranger and a student's grades. It is on for every table, no exceptions.

-- ---------------------------------------------------------------- statuses
-- Config, not enum. is_owed drives "Who Owes What"; expects_score decides
-- whether a cell participates in topic averages on the Re-teach Radar.
create table statuses (
  code           text primary key,
  label          text    not null,
  is_owed        boolean not null default false,
  expects_score  boolean not null default false,
  sort_order     integer not null default 0
);

insert into statuses (code, label, is_owed, expects_score, sort_order) values
  ('done',    'Graded',         false, true,  1),
  ('missing', 'Missing',        true,  false, 2),
  ('absent',  'Absent',         true,  false, 3),
  ('makeup',  'Makeup pending', true,  false, 4);

-- ----------------------------------------------------------------- classes
-- One row per period. The mockup shows only 2nd Period; the real build needs
-- the switcher, so period is a first-class row from day one.
create table classes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null,                  -- "2nd Period — Pre-Algebra"
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ topics
-- A table, not a free-text tag: the Re-teach Radar groups by topic, and
-- "Proportions" vs "proportions" would silently split a group in two.
create table topics (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references classes (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

-- ------------------------------------------------------------- assignments
create table assignments (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes (id) on delete cascade,
  topic_id     uuid references topics (id) on delete set null,
  name         text not null,                -- "Quiz 4.2"
  points       integer not null default 100,
  due_on       date,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- students
create table students (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes (id) on delete cascade,
  first_name   text not null,
  last_name    text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Voice entry matches on first name and needs last initial to break ties.
-- Generated, so the disambiguation rule can never drift from the roster.
alter table students
  add column display_name text
  generated always as (first_name || ' ' || left(last_name, 1) || '.') stored;

-- ------------------------------------------------------------------- cells
-- The heart of it: one row per student x assignment. Everything else in the
-- app derives from this table. Composite PK makes upsert-on-edit natural and
-- makes a duplicate cell structurally impossible.
create table cells (
  student_id    uuid not null references students (id)    on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  status        text not null references statuses (code)  default 'done',
  score         numeric(5,2),
  updated_at    timestamptz not null default now(),
  primary key (student_id, assignment_id)
);

create index cells_assignment_idx on cells (assignment_id);
create index cells_owed_idx       on cells (status) where status <> 'done';

-- Keep updated_at honest — the app must never have to remember to set it.
create function touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger cells_touch_updated_at
  before update on cells
  for each row execute function touch_updated_at();

-- A score on an absent/missing cell is a contradiction. This has to be a
-- trigger, not a CHECK: Postgres forbids subqueries in CHECK constraints, and
-- the rule has to read the statuses table precisely because statuses are
-- configurable. Enforced in the database so a voice-parser bug can never
-- quietly write a 78 onto a kid who was absent.
create function enforce_score_matches_status() returns trigger
  language plpgsql as $$
begin
  if new.score is not null
     and not (select expects_score from statuses where code = new.status) then
    raise exception 'status "%" does not take a score', new.status;
  end if;
  return new;
end $$;

create trigger cells_score_matches_status
  before insert or update on cells
  for each row execute function enforce_score_matches_status();

-- ------------------------------------------------------------------- RLS
-- Everything is reachable from a class, so ownership is checked by walking
-- back to classes.owner_id. Single teacher today; this already supports more.
alter table classes     enable row level security;
alter table topics      enable row level security;
alter table assignments enable row level security;
alter table students    enable row level security;
alter table cells       enable row level security;
alter table statuses    enable row level security;

create policy own_classes on classes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_topics on topics
  for all using (exists (
    select 1 from classes c where c.id = topics.class_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from classes c where c.id = topics.class_id and c.owner_id = auth.uid()));

create policy own_assignments on assignments
  for all using (exists (
    select 1 from classes c where c.id = assignments.class_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from classes c where c.id = assignments.class_id and c.owner_id = auth.uid()));

create policy own_students on students
  for all using (exists (
    select 1 from classes c where c.id = students.class_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from classes c where c.id = students.class_id and c.owner_id = auth.uid()));

create policy own_cells on cells
  for all using (exists (
    select 1 from students s join classes c on c.id = s.class_id
    where s.id = cells.student_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from students s join classes c on c.id = s.class_id
    where s.id = cells.student_id and c.owner_id = auth.uid()));

-- Statuses are shared config, not student data: readable by any signed-in
-- user, writable by nobody through the API.
create policy read_statuses on statuses for select to authenticated using (true);
