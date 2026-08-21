-- Phase 2 → Phase 3 migration.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Use this rather than re-running schema.sql if you have already deleted some of
-- the seeded habits: schema.sql ends with a seed insert that would bring them
-- back. This file contains only the Phase 3 delta and touches no existing rows.
--
-- It is idempotent, and safe to run even on a database that already has some of
-- these objects.

-- ---------------------------------------------------------------------------
-- 1. Daily tasks
--
-- Tasks planned for a single day: written the day before ("tomorrow's plan")
-- and ticked off on the day itself, so a task belongs to a date, not a habit.
-- ---------------------------------------------------------------------------

create table if not exists public.daily_tasks (
  id          uuid primary key default gen_random_uuid(),
  date        date        not null,
  title       text        not null,
  description text,
  completed   boolean     not null default false,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Only ever read one or two specific days at a time.
create index if not exists daily_tasks_date_idx on public.daily_tasks (date);

-- Already created by schema.sql; repeated here so this file stands alone.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_tasks_set_updated_at on public.daily_tasks;
create trigger daily_tasks_set_updated_at
  before update on public.daily_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Row level security
--
-- Habits and tasks are now created, edited and removed from the app, so the
-- anon key needs write access to both tables. Phase 2 granted `select` only on
-- habits, which is why adding a habit failed with
-- "new row violates row-level security policy for table habits".
--
-- habit_logs policies are unchanged and are not repeated here.
-- ---------------------------------------------------------------------------

alter table public.daily_tasks enable row level security;

drop policy if exists habits_insert on public.habits;
create policy habits_insert
  on public.habits for insert
  to anon, authenticated
  with check (true);

drop policy if exists habits_update on public.habits;
create policy habits_update
  on public.habits for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists habits_delete on public.habits;
create policy habits_delete
  on public.habits for delete
  to anon, authenticated
  using (true);

drop policy if exists daily_tasks_read on public.daily_tasks;
create policy daily_tasks_read
  on public.daily_tasks for select
  to anon, authenticated
  using (true);

drop policy if exists daily_tasks_insert on public.daily_tasks;
create policy daily_tasks_insert
  on public.daily_tasks for insert
  to anon, authenticated
  with check (true);

drop policy if exists daily_tasks_update on public.daily_tasks;
create policy daily_tasks_update
  on public.daily_tasks for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists daily_tasks_delete on public.daily_tasks;
create policy daily_tasks_delete
  on public.daily_tasks for delete
  to anon, authenticated
  using (true);
