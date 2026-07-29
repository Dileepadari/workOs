-- Stage 3: saved views for the unified task/project view model - named,
-- reusable filter+sort+view-type combos. Shared workspace-wide (not
-- per-user-private for v1): anyone on the team can see and use a saved view,
-- simplifying the access model versus tracking per-view visibility.

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  name text not null,
  entity_type text not null default 'tasks',
  view_type text not null default 'list' check (view_type in ('list', 'board', 'calendar')),
  filters jsonb not null default '{}'::jsonb,
  sort jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.saved_views enable row level security;
create index idx_saved_views_workspace on public.saved_views(workspace_id);
