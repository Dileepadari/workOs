
-- Fix: tighten reactions INSERT to require user_identifier = auth.uid()
DROP POLICY IF EXISTS "Authenticated can add reactions" ON public.discussion_reactions;
CREATE POLICY "Authenticated can add reactions"
ON public.discussion_reactions
FOR INSERT
TO authenticated
WITH CHECK (user_identifier = auth.uid()::text);

-- The anon SELECT on project_collaborators is intentional for the collab portal login flow.
-- The authenticated SELECT on project_collaborators is intentional for owner management.
