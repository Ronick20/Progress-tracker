-- Habit Tracker — Phase 2 schema.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is idempotent: re-running it will not duplicate tables, policies or habits.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  icon       text,
  active     boolean     not null default true,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid        not null references public.habits (id) on delete cascade,
  date       date        not null,
  completed  boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- At most one record per habit per day, so the app can safely upsert.
  constraint habit_logs_habit_id_date_key unique (habit_id, date)
);

-- The app always reads one month of logs at a time; this serves that range scan.
create index if not exists habit_logs_date_idx on public.habit_logs (date);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists habit_logs_set_updated_at on public.habit_logs;
create trigger habit_logs_set_updated_at
  before update on public.habit_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Phase 2 has no authentication, so there is no user to isolate rows by. RLS is
-- enabled and every table denies everything by default; the policies below then
-- grant the narrowest set of operations the app actually performs:
--
--   habits      → read only (rows are managed from the Supabase dashboard)
--   habit_logs  → read, insert and update (never delete)
--
-- Limitation: anyone holding the project URL and anon key can read and write
-- this data. That is acceptable for a single-user personal tracker, but it is
-- NOT multi-tenant. Per-user isolation arrives with authentication in a later
-- phase, at which point these policies must be replaced with owner checks.
-- Never put the service role key in the browser — it bypasses RLS entirely.
-- ---------------------------------------------------------------------------

alter table public.habits     enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists habits_read on public.habits;
create policy habits_read
  on public.habits for select
  to anon, authenticated
  using (true);

drop policy if exists habit_logs_read on public.habit_logs;
create policy habit_logs_read
  on public.habit_logs for select
  to anon, authenticated
  using (true);

drop policy if exists habit_logs_insert on public.habit_logs;
create policy habit_logs_insert
  on public.habit_logs for insert
  to anon, authenticated
  with check (true);

drop policy if exists habit_logs_update on public.habit_logs;
create policy habit_logs_update
  on public.habit_logs for update
  to anon, authenticated
  using (true)
  with check (true);

-- No delete policy on either table: RLS denies deletes to the anon key.

-- ---------------------------------------------------------------------------
-- Initial habits (the Phase 1 list, in order)
--
-- Inserted only when a habit of the same name does not already exist, so this
-- script can be re-run without creating duplicates.
-- ---------------------------------------------------------------------------

insert into public.habits (name, sort_order)
select seed.name, seed.sort_order
from (values
  ('Wake up at 05:00',   1),
  ('Gym',                2),
  ('Reading / Learning', 3),
  ('Day Planning',       4),
  ('No Grooming',        5),
  ('Project Work',       6),
  ('No Alcohol',         7),
  ('Social Media Detox', 8),
  ('Goal Journaling',    9),
  ('Cold Shower',       10),
  ('10K Steps',         11),
  ('Plan Tomorrow',     12)
) as seed (name, sort_order)
where not exists (
  select 1 from public.habits h where h.name = seed.name
);
