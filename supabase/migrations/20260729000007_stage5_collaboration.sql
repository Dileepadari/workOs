-- Stage 5: collaboration layer — generic comments (replacing project-only
-- `discussions`), @mentions, generic reactions (replacing
-- `discussion_reactions`), an activity feed, and persisted notifications.
--
-- Existing discussions/reactions are migrated non-destructively into the
-- new generic tables before the old ones are retired (old tables are
-- dropped in the *next* migration, after the frontend has been verified
-- against the new ones — see 20260729000008).

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  created_by uuid not null references public.users(id) on delete cascade,
  content_json jsonb not null default '[]'::jsonb,
  content_text text not null default '',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments enable row level security;
create index idx_comments_workspace on public.comments(workspace_id);
create index idx_comments_entity on public.comments(entity_type, entity_id);

create table public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.comment_mentions enable row level security;
create index idx_comment_mentions_comment on public.comment_mentions(comment_id);
create index idx_comment_mentions_user on public.comment_mentions(mentioned_user_id);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(entity_type, entity_id, user_id, emoji)
);
alter table public.reactions enable row level security;
create index idx_reactions_entity on public.reactions(entity_type, entity_id);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create index idx_activity_log_workspace on public.activity_log(workspace_id, created_at desc);
create index idx_activity_log_project on public.activity_log(project_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('mention', 'assignment', 'comment_reply', 'invite')),
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references public.users(id) on delete set null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index idx_notifications_recipient on public.notifications(recipient_id, read_at, created_at desc);

-- ============================================================================
-- Migrate existing discussions -> comments, discussion_reactions -> reactions
-- ============================================================================

insert into public.comments (id, workspace_id, entity_type, entity_id, created_by, content_json, content_text, is_pinned, created_at, updated_at)
select d.id, d.workspace_id, 'project', d.project_id, d.created_by,
       coalesce(d.content_json, '[]'::jsonb), coalesce(d.content_text, ''), d.is_pinned, d.created_at, d.updated_at
from public.discussions d;

-- Reactions attach to the comment itself (entity_type='comment'), not to
-- whatever the comment is posted under — `discussion_id` becomes the
-- matching `comments.id` since the migration above preserves discussion ids.
insert into public.reactions (workspace_id, entity_type, entity_id, user_id, emoji, created_at)
select r.workspace_id, 'comment', r.discussion_id, r.user_identifier::uuid, r.emoji, r.created_at
from public.discussion_reactions r
where r.user_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict do nothing;
