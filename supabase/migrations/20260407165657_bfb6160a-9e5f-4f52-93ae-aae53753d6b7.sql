
-- Add blocked and dropped to task_status enum
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'dropped';

-- Add due_time to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time text;

-- Create project_collaborators table for email-based invites with roles
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'commenter', 'editor', 'admin')),
  invited_at timestamp with time zone NOT NULL DEFAULT now(),
  last_access_at timestamp with time zone DEFAULT now(),
  UNIQUE(project_id, email)
);

ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with collaborators
CREATE POLICY "Owner can manage collaborators"
ON public.project_collaborators
FOR ALL
TO authenticated
USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- Collaborators can view their own entries (for the collab portal)
CREATE POLICY "Anyone can read collab by anon"
ON public.project_collaborators
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Authenticated can read own collab"
ON public.project_collaborators
FOR SELECT
TO authenticated
USING (true);

-- Create discussion_reactions table
CREATE TABLE IF NOT EXISTS public.discussion_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discussion_id uuid NOT NULL REFERENCES public.discussions(id) ON DELETE CASCADE,
  user_identifier text NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(discussion_id, user_identifier, emoji)
);

ALTER TABLE public.discussion_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reactions"
ON public.discussion_reactions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can add reactions"
ON public.discussion_reactions
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can remove own reactions"
ON public.discussion_reactions
FOR DELETE
TO authenticated
USING (user_identifier = auth.uid()::text);

-- Update get_collab_project_data to also return meetings
CREATE OR REPLACE FUNCTION public.get_collab_project_data(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_session RECORD;
  v_project JSON;
  v_tasks JSON;
  v_milestones JSON;
  v_resources JSON;
  v_discussions JSON;
  v_meetings JSON;
BEGIN
  SELECT * INTO v_session
  FROM public.collaborator_sessions
  WHERE id = p_session_id AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Session expired or invalid');
  END IF;

  UPDATE public.collaborator_sessions SET last_access_at = now() WHERE id = p_session_id;

  SELECT row_to_json(p) INTO v_project
  FROM (SELECT id, name, description, status, color, slug, type, tags, start_date, target_end_date, status_note FROM public.projects WHERE id = v_session.project_id) p;

  SELECT json_agg(t) INTO v_tasks
  FROM (SELECT id, title, status, priority, due_date, due_time, time_estimate_min FROM public.tasks WHERE project_id = v_session.project_id ORDER BY sort_order, created_at DESC) t;

  SELECT json_agg(m) INTO v_milestones
  FROM (SELECT id, title, date, is_completed FROM public.milestones WHERE project_id = v_session.project_id ORDER BY date) m;

  SELECT json_agg(r) INTO v_resources
  FROM (SELECT id, title, url, type, tags FROM public.resources WHERE project_id = v_session.project_id ORDER BY created_at DESC) r;

  SELECT json_agg(d) INTO v_discussions
  FROM (SELECT id, body_html, author, author_type, is_pinned, created_at FROM public.discussions WHERE project_id = v_session.project_id ORDER BY is_pinned DESC, created_at DESC) d;

  SELECT json_agg(mt) INTO v_meetings
  FROM (SELECT id, title, scheduled_at, attendees, agenda_html FROM public.meetings WHERE project_id = v_session.project_id ORDER BY scheduled_at DESC) mt;

  RETURN json_build_object(
    'success', true,
    'project', v_project,
    'tasks', COALESCE(v_tasks, '[]'::json),
    'milestones', COALESCE(v_milestones, '[]'::json),
    'resources', COALESCE(v_resources, '[]'::json),
    'discussions', COALESCE(v_discussions, '[]'::json),
    'meetings', COALESCE(v_meetings, '[]'::json)
  );
END;
$function$;

-- Create a function to verify collaborator by email (account-based access)
CREATE OR REPLACE FUNCTION public.verify_collab_by_email(p_project_slug text, p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_project RECORD;
  v_collab RECORD;
  v_session_id UUID;
BEGIN
  SELECT id, name, slug INTO v_project
  FROM public.projects
  WHERE slug = p_project_slug;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Project not found');
  END IF;

  -- Check if email is in project_collaborators
  SELECT * INTO v_collab
  FROM public.project_collaborators
  WHERE project_id = v_project.id AND email = p_email;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You do not have access to this project');
  END IF;

  -- Update last access
  UPDATE public.project_collaborators SET last_access_at = now() WHERE id = v_collab.id;

  -- Create session
  INSERT INTO public.collaborator_sessions (email, project_id, last_access_at, expires_at)
  VALUES (p_email, v_project.id, now(), now() + interval '24 hours')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    UPDATE public.collaborator_sessions
    SET last_access_at = now(), expires_at = now() + interval '24 hours'
    WHERE email = p_email AND project_id = v_project.id
    RETURNING id INTO v_session_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'project_id', v_project.id,
    'project_name', v_project.name,
    'role', v_collab.role
  );
END;
$function$;

-- Function to get all projects a collaborator has access to
CREATE OR REPLACE FUNCTION public.get_collab_projects(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_projects JSON;
BEGIN
  SELECT json_agg(row_to_json(r)) INTO v_projects
  FROM (
    SELECT p.id, p.name, p.slug, p.status, p.color, p.type, p.description, pc.role,
           (SELECT count(*) FROM public.tasks WHERE project_id = p.id AND status != 'done') as open_tasks,
           (SELECT count(*) FROM public.tasks WHERE project_id = p.id) as total_tasks
    FROM public.project_collaborators pc
    JOIN public.projects p ON p.id = pc.project_id
    WHERE pc.email = p_email
    ORDER BY pc.last_access_at DESC
  ) r;

  RETURN json_build_object('success', true, 'projects', COALESCE(v_projects, '[]'::json));
END;
$function$;
