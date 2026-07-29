-- Stage 1: multi-tenant foundation + custom JWT auth.
--
-- Replaces Supabase Auth (GoTrue) entirely with a self-issued username/password
-- + JWT scheme (see supabase/functions/workos), matching the pattern already
-- proven in the sibling `portfolio` project. Every content table moves from
-- being owned directly by a single `auth.users` row to being scoped to a
-- `workspace_id`, with real membership/roles instead of the old bolted-on
-- guest-password system (project_collaborators/collaborator_sessions, left
-- untouched here - still retired in Stage 5, not this migration).
--
-- RLS stays enabled on every table as defense-in-depth, but is intentionally
-- left with zero permissive policies below: the actual authorization now
-- lives in the `workos` Edge Function (service-role key, checks membership in
-- code), since there is no Supabase-issued session for RLS to key off of once
-- the browser only ever holds the anon key.

-- ============================================================================
-- 1. public.users - fully replaces auth.users as the identity table.
-- ============================================================================

create table public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  display_name text,
  email text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.users enable row level security;

-- ============================================================================
-- 2. Workspaces, membership, invites, project-level guest scoping.
-- ============================================================================

create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');
create type public.project_member_role as enum ('viewer', 'commenter', 'editor');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  token uuid not null default gen_random_uuid(),
  -- when set, an accepted 'guest' invite also gets scoped project access
  -- created automatically (see accept_workspace_invite below).
  scoped_project_id uuid references public.projects(id) on delete cascade,
  scoped_project_role public.project_member_role,
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.project_member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  theme_preset text not null default 'common',
  custom_primary_hex text,
  custom_accent_hex text,
  logo_url text,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.project_members enable row level security;
alter table public.workspace_settings enable row level security;

create index idx_workspace_members_user on public.workspace_members(user_id);
create index idx_workspace_members_workspace on public.workspace_members(workspace_id);
create index idx_workspace_invites_email on public.workspace_invites(email);
create index idx_workspace_invites_token on public.workspace_invites(token);
create index idx_project_members_project on public.project_members(project_id);
create index idx_project_members_user on public.project_members(user_id);

-- ============================================================================
-- 3. Workspace-scope every content table: add workspace_id, repoint
--    ownership from auth.users to public.users (user_id -> created_by).
--    workspace_id/created_by are left nullable here on purpose - the
--    bootstrap function in section 5 fills them in, and a follow-up
--    migration (stage1 part 2) adds the NOT NULL + FK once that's done.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'tasks', 'notes', 'resources', 'milestones', 'meetings',
    'links', 'discussions', 'daily_log', 'calendar_integrations',
    'synced_events', 'events'
  ]
  loop
    execute format('alter table public.%I add column workspace_id uuid references public.workspaces(id)', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_user_id_fkey');
    execute format('alter table public.%I rename column user_id to created_by', t);
    execute format('create index idx_%I_workspace on public.%I(workspace_id)', t, t);
  end loop;
end $$;

-- Drop every old auth.uid()-keyed policy on these tables - they're dead now
-- that the browser never holds a Supabase-issued session, and are replaced
-- by the Edge Function's own membership checks (RLS on these tables now
-- intentionally has zero policies, i.e. deny-all, as defense-in-depth).
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'projects', 'tasks', 'notes', 'resources', 'milestones', 'meetings',
        'links', 'discussions', 'daily_log', 'calendar_integrations',
        'synced_events', 'events'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Dead code: superseded by Resources.tsx, not routed anywhere, zero rows.
drop table if exists public.bookmarks;

-- ============================================================================
-- 4. tasks: real assignee groundwork (Stage 3 wires the picker), safe to add
--    now since it's an independent nullable column.
-- ============================================================================

alter table public.tasks add column assignee_id uuid references public.users(id) on delete set null;

-- ============================================================================
-- 5. One-time bootstrap function: creates the initial owner's Personal
--    Workspace and migrates all existing rows into it. Only two legacy
--    auth.users accounts ever owned real data (verified against the live
--    project before writing this migration) - the primary owner (all 8
--    projects, 42/43 tasks, everything else) and one unrelated stray task
--    under a different email with no project association. Per the user's
--    explicit decision, only the primary owner gets a real account in the
--    new system; the stray task is folded into their Personal Workspace
--    rather than lost. The other 4 legacy accounts owned zero rows and are
--    not carried forward - they can sign up fresh if they return.
--
--    The one real external collaborator on record (an "editor" invite on the
--    IMS Redesign project, captured from project_collaborators before that
--    table is retired in Stage 5) is preserved as a proper workspace_invite
--    so that person has a real path back in once they accept it.
--
--    SECURITY DEFINER + execute revoked from everyone but service_role: this
--    is a one-shot migration helper invoked once by the bootstrap script
--    (scripts/create-user.mjs), never exposed to the app.
-- ============================================================================

create function public.bootstrap_initial_workspace(p_owner_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  t text;
begin
  insert into public.workspaces (name, slug, created_by)
  values ('Personal Workspace', 'personal', p_owner_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, p_owner_user_id, 'owner');

  insert into public.workspace_settings (workspace_id) values (v_workspace_id);

  foreach t in array array[
    'projects', 'tasks', 'notes', 'resources', 'milestones', 'meetings',
    'links', 'discussions', 'daily_log', 'calendar_integrations',
    'synced_events', 'events'
  ]
  loop
    execute format(
      'update public.%I set workspace_id = $1, created_by = $2',
      t
    ) using v_workspace_id, p_owner_user_id;
  end loop;

  -- Preserve the one real collaborator invite (IMS Redesign project, editor
  -- role) from project_collaborators before that table is retired.
  insert into public.workspace_invites (
    workspace_id, email, role, scoped_project_id, scoped_project_role, invited_by
  )
  select v_workspace_id, 'raman.saxena@iiit.ac.in', 'guest', p.id, 'editor', p_owner_user_id
  from public.projects p
  where p.id = 'a3000000-0000-0000-0000-000000000003'
  on conflict do nothing;

  return v_workspace_id;
end;
$$;

revoke all on function public.bootstrap_initial_workspace(uuid) from public;
grant execute on function public.bootstrap_initial_workspace(uuid) to service_role;
