-- Stage 4: rich content via BlockNote. Every place that used to be a plain
-- <Textarea> or a fake "<p>...</p>"-wrapped string gets a real block document
-- (`content_json`, BlockNote's Block[]) plus a derived plain-text mirror
-- (`content_text`, feeds full-text search / QuickSearch) instead.
--
-- Non-destructive: every existing value is wrapped into a single paragraph
-- block during backfill, so nothing is lost — old content just becomes the
-- first block of a document that can now be extended with formatting,
-- checklists, images, etc. Old columns are left in place (not dropped) since
-- Stage 5 hasn't retired the pages that still reference them.

alter table public.notes add column content_json jsonb;
alter table public.notes add column content_text text;
update public.notes set
  content_text = coalesce(content, ''),
  content_json = case when content is null or content = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', content, 'styles', '{}'::jsonb))
    )) end
where true;

alter table public.tasks add column content_json jsonb;
alter table public.tasks add column content_text text;
update public.tasks set
  content_text = coalesce(description, ''),
  content_json = case when description is null or description = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', description, 'styles', '{}'::jsonb))
    )) end
where true;

alter table public.discussions add column content_json jsonb;
alter table public.discussions add column content_text text;
update public.discussions set
  content_text = regexp_replace(coalesce(body_html, ''), '<[^>]*>', '', 'g'),
  content_json = case when body_html is null or body_html = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', regexp_replace(body_html, '<[^>]*>', '', 'g'), 'styles', '{}'::jsonb))
    )) end
where true;

alter table public.meetings add column agenda_json jsonb;
alter table public.meetings add column agenda_text text;
alter table public.meetings add column notes_json jsonb;
alter table public.meetings add column notes_text text;
update public.meetings set
  agenda_text = regexp_replace(coalesce(agenda_html, ''), '<[^>]*>', '', 'g'),
  agenda_json = case when agenda_html is null or agenda_html = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', regexp_replace(agenda_html, '<[^>]*>', '', 'g'), 'styles', '{}'::jsonb))
    )) end,
  notes_text = regexp_replace(coalesce(notes_html, ''), '<[^>]*>', '', 'g'),
  notes_json = case when notes_html is null or notes_html = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', regexp_replace(notes_html, '<[^>]*>', '', 'g'), 'styles', '{}'::jsonb))
    )) end
where true;

alter table public.daily_log add column content_json jsonb;
alter table public.daily_log add column content_text text;
update public.daily_log set
  content_text = regexp_replace(coalesce(notes_html, ''), '<[^>]*>', '', 'g'),
  content_json = case when notes_html is null or notes_html = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', regexp_replace(notes_html, '<[^>]*>', '', 'g'), 'styles', '{}'::jsonb))
    )) end
where true;

-- ============================================================================
-- Attachments: metadata for files uploaded through the Edge Function's
-- /upload proxy to the Oracle storage server (see supabase/functions/workos).
-- Storage itself has no tenancy concept, so this table is what actually
-- scopes a file to a workspace/entity for listing and access checks.
-- ============================================================================

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  url text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.attachments enable row level security;
create index idx_attachments_workspace on public.attachments(workspace_id);
create index idx_attachments_entity on public.attachments(entity_type, entity_id);
