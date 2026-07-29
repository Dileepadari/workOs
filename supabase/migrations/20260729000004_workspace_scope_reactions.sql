-- discussion_reactions was left out of the Stage 1 workspace-scoping pass
-- (it's slated to be replaced by a generic `reactions` table in Stage 5), but
-- its old auth.uid()-keyed RLS is now dead in the meantime, which would
-- silently break ProjectDetail.tsx's reaction feature. Give it workspace_id
-- too so it can go through the same Edge Function gateway as everything
-- else until Stage 5's generalization replaces it outright.

alter table public.discussion_reactions add column workspace_id uuid references public.workspaces(id);

update public.discussion_reactions r
set workspace_id = d.workspace_id
from public.discussions d
where d.id = r.discussion_id;

alter table public.discussion_reactions alter column workspace_id set not null;
create index idx_discussion_reactions_workspace on public.discussion_reactions(workspace_id);

drop policy if exists "Anyone can view reactions" on public.discussion_reactions;
drop policy if exists "Authenticated can add reactions" on public.discussion_reactions;
drop policy if exists "Users can remove own reactions" on public.discussion_reactions;
