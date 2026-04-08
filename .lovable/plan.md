## Phase 1: Database Schema Updates
- Add `project_collaborators` table with role-based access (viewer, commenter, editor, admin)
- Add new task statuses: `blocked`, `dropped`
- Add `time` field to tasks (due_time), milestones, meetings
- Add `reactions` table for discussions
- Update RLS policies for collaborator access

## Phase 2: Collaboration System
- Build collaborator invite flow (by email + role)
- Collaborator login → see all shared projects
- Multi-level access control (viewer, commenter, editor, admin)
- Collaborators can post discussions based on role

## Phase 3: Task & Calendar Enhancements
- Task status transitions (todo → in_progress → done, plus blocked/dropped)
- Fix deleted tasks still showing in dashboard
- Calendar event creation modal
- Calendar event detail modal on click
- Add time display to tasks/milestones

## Phase 4: Search, Dashboard & Discussions
- Fix global search to include links, meetings, milestones
- Dashboard compact redesign with more info
- Discussion edit/delete + reactions
- Collapsible task groups by status including blocked/dropped

## Phase 5: Polish
- Responsive checks
- End-to-end verification
