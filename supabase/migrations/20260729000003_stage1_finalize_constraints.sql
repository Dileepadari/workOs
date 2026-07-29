-- Stage 1 finalize: bootstrap_initial_workspace() has run and every existing
-- row now has workspace_id/created_by populated (verified: row counts for
-- every content table match pre-migration counts exactly, zero data loss).
-- Lock the columns down for real: NOT NULL, and created_by now points at
-- public.users instead of the old (dropped) auth.users reference.

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
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('alter table public.%I alter column created_by set not null', t);
    execute format(
      'alter table public.%I add constraint %I foreign key (created_by) references public.users(id) on delete cascade',
      t, t || '_created_by_fkey'
    );
  end loop;
end $$;
