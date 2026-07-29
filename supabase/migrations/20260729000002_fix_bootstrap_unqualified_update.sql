-- Fix: the remote database rejects UPDATE statements with no WHERE clause
-- ("UPDATE requires a WHERE clause"), which bootstrap_initial_workspace()'s
-- blanket per-table backfill hit since every existing row is being migrated
-- unconditionally. `where true` is a no-op filter that satisfies the
-- requirement without changing which rows match.

create or replace function public.bootstrap_initial_workspace(p_owner_user_id uuid)
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
      'update public.%I set workspace_id = $1, created_by = $2 where true',
      t
    ) using v_workspace_id, p_owner_user_id;
  end loop;

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
