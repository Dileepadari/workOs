-- The book, persisted focus sessions, and personal preferences.
--
-- Replaces the Daily Log / Weekly Review pair with a per-member book: one page
-- per day generated from that member's real activity, and one analysis page per
-- week bound in after it. Also closes two persistence gaps - Focus Mode kept its
-- session count in React state and lost it on every refresh, and several
-- personal settings lived only in localStorage so they never followed anyone to
-- a second browser.
--
-- Additive only. The `daily_log` drop is a separate migration so that this one
-- can be applied and verified before anything is destroyed.
--
-- Conventions followed from stage1: every content table carries `workspace_id`
-- and `created_by`, both NOT NULL, both stamped server-side by the edge
-- function and never supplied by the client. RLS is enabled with zero
-- permissive policies - authorization lives in the function, using the service
-- role, exactly as for every other table here.

-- ---------------------------------------------------------------- tasks --

-- Weekly Review has been reading `updated_at` as a proxy for "when was this
-- completed", which is wrong in a way that quietly corrupts the numbers: edit
-- the title of a task you finished last month and it counts as completed this
-- week. Record the real thing.
alter table public.tasks add column if not exists completed_at timestamptz;

-- Best available backfill. For tasks already done, `updated_at` is the closest
-- known approximation of when that happened; for everything else the honest
-- answer is null. Done once, here, so historical pages are not all empty.
update public.tasks
   set completed_at = updated_at
 where status = 'done'
   and completed_at is null;

create index if not exists idx_tasks_completed_at
  on public.tasks (workspace_id, created_by, completed_at)
  where completed_at is not null;

-- ------------------------------------------------------------ day pages --

-- One page per member per day. `metrics` holds the counted facts (tasks
-- completed, focus minutes, meetings, and so on) as they stood when the page
-- was written, so a sealed page keeps saying what it said even after the
-- underlying rows change.
create table if not exists public.day_pages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references public.users(id) on delete cascade,
  date          date not null,
  title         text,
  summary       text,
  highlights    text[] not null default '{}',
  friction      text[] not null default '{}',
  reflection    text,
  metrics       jsonb not null default '{}'::jsonb,
  -- 'builtin' when the templated engine wrote it, otherwise the provider name.
  generated_by  text not null default 'builtin',
  -- Once sealed the page is part of the book and is not silently rewritten.
  sealed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (created_by, date)
);

create index if not exists idx_day_pages_member_date
  on public.day_pages (workspace_id, created_by, date desc);

-- ----------------------------------------------------------- week pages --

-- `week_start` is always a Monday. The old Weekly Review relied on date-fns'
-- Sunday default without passing weekStartsOn, which made every week boundary
-- off by a day from what anyone actually means by "this week".
create table if not exists public.week_pages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references public.users(id) on delete cascade,
  week_start    date not null,
  title         text,
  summary       text,
  wins          text[] not null default '{}',
  concerns      text[] not null default '{}',
  focus_next    text[] not null default '{}',
  metrics       jsonb not null default '{}'::jsonb,
  generated_by  text not null default 'builtin',
  sealed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (created_by, week_start),
  constraint week_pages_starts_monday check (extract(isodow from week_start) = 1)
);

create index if not exists idx_week_pages_member_week
  on public.week_pages (workspace_id, created_by, week_start desc);

-- ------------------------------------------------------- focus sessions --

-- Focus Mode previously counted sessions in `useState(0)`, so a refresh threw
-- the day away. These rows are what make "2h 10m across 5 blocks" appear on a
-- day page and add up across a week.
create table if not exists public.focus_sessions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  created_by      uuid not null references public.users(id) on delete cascade,
  -- Null when the task or project is later deleted; the session still happened.
  task_id         uuid references public.tasks(id) on delete set null,
  project_id      uuid references public.projects(id) on delete set null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  planned_minutes integer not null default 25,
  actual_minutes  integer not null default 0,
  -- Break blocks are recorded too, but must not count as focus time.
  was_break       boolean not null default false,
  interruptions   integer not null default 0,
  -- Whether the block ran to completion or was stopped early. Both are real
  -- data; conflating them would overstate how much deep work happened.
  completed       boolean not null default false,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_focus_sessions_member_started
  on public.focus_sessions (workspace_id, created_by, started_at desc);

-- --------------------------------------------------- user preferences --

-- Personal and per-user, not per-workspace: the colour palette is shared with
-- the team (workspace_settings) but light/dark, font and timer lengths are
-- nobody else's business. Keyed by user alone so they follow you between
-- workspaces as well as between browsers.
create table if not exists public.user_preferences (
  user_id             uuid primary key references public.users(id) on delete cascade,
  theme               text not null default 'dark',
  font                text not null default 'sans',
  focus_minutes       integer not null default 25,
  break_minutes       integer not null default 5,
  focus_sound         boolean not null default true,
  notify_mentions     boolean not null default true,
  notify_assignments  boolean not null default true,
  onboarding_done     boolean not null default false,
  -- 'auto' resolves to whichever provider has a key configured server-side.
  cherry_provider     text not null default 'auto',
  updated_at          timestamptz not null default now()
);

-- ------------------------------------------------------------ hardening --

alter table public.day_pages       enable row level security;
alter table public.week_pages      enable row level security;
alter table public.focus_sessions  enable row level security;
alter table public.user_preferences enable row level security;

-- Deliberately no permissive policies, matching every other table in this
-- schema: nothing is reachable with the anon key, and the edge function does
-- the membership and ownership checks in code using the service role.

-- ------------------------------------------------------ updated_at --

-- Reuses the trigger function already defined in the first migration.
drop trigger if exists set_day_pages_updated_at on public.day_pages;
create trigger set_day_pages_updated_at
  before update on public.day_pages
  for each row execute function public.update_updated_at_column();

drop trigger if exists set_week_pages_updated_at on public.week_pages;
create trigger set_week_pages_updated_at
  before update on public.week_pages
  for each row execute function public.update_updated_at_column();
