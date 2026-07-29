# WorkOS

A team work manager - projects, tasks, notes, resources, calendar, and async collaboration in one place, with a Notion-style block editor for everything you write.

> Looking for architecture, data model, and setup details? See **[DEVDOC.md](./DEVDOC.md)**.

## Features

### Dashboard
- Live clock/date hero, quick-add task bar, and at-a-glance stat tiles (projects, open tasks, links, notes, events)
- Recent projects grid with per-project progress bars
- Week workload chart, upcoming events, overdue/blocked task call-outs, today's agenda, and next-7-days preview

### Projects
- Full CRUD with status (active / on hold / archived), type, tags, color, repo link, and start/target dates
- Per-project tabs: Overview (status note, stats, activity feed), Tasks, Milestones, Resources, Discussions, Meetings, Access
- Grid or list browsing with search, status/type filters, and sorting

### Tasks
- List, board (drag-and-drop, via dnd-kit), and calendar views
- Status (To Do / In Progress / Blocked / Done / Dropped) and priority (Low / Medium / High / Urgent) with color-coded, accessible badges
- Filters (status, priority, project, assignee), sort options, bulk actions, and saved views
- Real assignee picker sourced from workspace members

### Notes & Resources
- Notes: a searchable, card-based library of rich documents
- Resources: a link vault with categories, tags, short keys (quick-jump codes), click tracking, and CSV export

### Calendar
- Month/Week/Agenda views aggregating tasks, milestones, meetings, and manually-added events
- Google Calendar / Outlook sync via ICS feed URL (custom RFC5545/RRULE parser, duplicate-safe)
- Import/export .ics

### Daily Log & Weekly Review
- Daily Log: energy level, wins, blockers, freeform notes, and a week-at-a-glance strip with entry indicators, plus today's schedule pulled from tasks/milestones
- Weekly Review: completed/new/overdue stats, a daily-completions bar chart, projects touched, and next week's lineup

### Focus Mode
- Pomodoro-style timer with configurable focus/break durations, sound + browser notifications, session stats, and an "up next" task queue tied to your real task list

### Collaboration
- Per-entity comments (BlockNote rich text) with @mentions, emoji reactions, and pinning - on projects, tasks, notes, and meetings
- Activity feed and a notification center (mentions, task reassignment, etc.)
- Real-time-feeling updates via polling/refetch - no external realtime dependency

### Team & Workspaces
- Multi-workspace with a switcher; each workspace has its own members, branding, and settings
- Roles: owner / admin / member / guest at the workspace level; viewer / commenter / editor at the project level for guests
- Email invites with expiring accept links

### Customization
- 9 built-in color palettes (Common/ADK brand, Monokai, GitHub, Material, Original, Dracula, Nord, Solarized, Catppuccin) plus a custom brand-color picker - shared per-workspace
- Personal light/dark mode and font choice
- Tag manager: rename, merge, and delete tags across all content in one place

### Search & Quick Capture
- Global ⌘K / Ctrl+K command palette searching projects, tasks, links, notes, and meetings
- Floating quick-capture button for adding a task, note, link, or daily-log win from anywhere

### Data ownership
- Full workspace export (JSON) and a links-only CSV export, from Settings

## Tech stack

React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, TanStack Query, BlockNote (rich text), dnd-kit, recharts. Backend is Supabase Postgres reached through a single custom Edge Function - see [DEVDOC.md](./DEVDOC.md) for why there's no Supabase Auth or client SDK involved.

## Getting started

```sh
npm install
npm run dev
```

Requires a `.env` with `VITE_SUPABASE_URL` pointed at your Supabase project. See [DEVDOC.md](./DEVDOC.md) for the full environment variable list, backend setup, and deployment notes.

