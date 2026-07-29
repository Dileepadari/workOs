-- Stage 5 final step: retire the old guest-password/email collab bolt-on
-- now that the generic comments/reactions/workspace-invite system replaces
-- it. Confirmed with the user: no active guest link is in use, safe to drop.
--
-- discussions/discussion_reactions data was already migrated into
-- comments/reactions in 20260729000007. project_collaborators' one real
-- row (raman.saxena, editor on IMS Redesign) was already preserved as a
-- workspace_invite during the Stage 1 bootstrap.

drop function if exists public.verify_collab_password(text, text, text);
drop function if exists public.verify_collab_by_email(text, text);
drop function if exists public.get_collab_project_data(uuid);
drop function if exists public.get_collab_projects(text);

drop table if exists public.discussion_reactions;
drop table if exists public.collaborator_sessions;
drop table if exists public.project_collaborators;
drop table if exists public.discussions;

alter table public.projects drop column if exists collab_password_hash;
