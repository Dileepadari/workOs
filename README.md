# WorkOS

A team work manager - projects, tasks, notes, resources, secrets, calendar and async collaboration in one place, with a Notion-style block editor for everything you write.

---

## What you can do

### Dashboard
Your day at a glance: a live clock, a quick-add task bar, and stat tiles for projects, open tasks, links, notes and events. Below that, recent projects with progress bars, a week workload chart, upcoming events, overdue and blocked call-outs, today's agenda, and a next-7-days preview.

### Projects
Create a project with a status (active / on hold / archived), type, tags, colour, repo link and start/target dates. Each project opens into tabs:

- **Overview** - description, an editable "what am I working on right now" status note, live stats and an activity feed
- **Tasks** - grouped by status, with inline status advance, edit and delete
- **Milestones** - dated checkpoints with a "next milestone" call-out
- **Resources** - links and files that belong to the project
- **Files** - documents, specs and designs for the project as a whole; drag and drop to upload
- **Discussions** - threaded comments with @mentions, reactions and file attachments
- **Meetings** - scheduled meetings with a rich agenda and attached files
- **Access** - who can see this project

Browse projects as a grid or list, with search, status/type filters and sorting.

### Tasks
List, board (drag and drop) and calendar views. Every task has a status (To Do / In Progress / Blocked / Done / Dropped), a priority (Low → Urgent), an optional due date and time, a project, an assignee, a rich description and file attachments.

Filter by status, priority, project or assignee; sort by due date, priority, newest or your own manual order; select several at once for bulk changes; and save any filter/sort combination as a named view you can jump back to.

### Notes & Resources
- **Notes** - a searchable card library of rich documents. Click any note to read it in full, with its attachments, without entering edit mode.
- **Resources** - a link vault with categories, tags, short keys (quick-jump codes) and click tracking. Click a card to see the full description, every tag and any attached files. You can paste a URL or upload a file directly, and export the whole vault as CSV.

### Secrets
A workspace vault for API keys, passwords, tokens, SSH keys and database credentials.

Values are **encrypted**, stored masked, and shown only when you click the eye icon - one entry at a time, fetched on demand, and automatically re-hidden after 30 seconds. Copy a value to the clipboard without ever displaying it. Each entry can carry an account name, URL, tags and notes, and everything but the value itself is searchable. Guests never have access.

### Calendar
Month, week and agenda views that pull together tasks, milestones, meetings and manually-added events. Sync from Google Calendar or Outlook via an ICS feed URL, and import/export `.ics` files.

### Daily Log & Weekly Review
- **Daily Log** - energy level, wins, blockers and freeform notes, with a week-at-a-glance strip and today's schedule pulled from your real tasks and milestones
- **Weekly Review** - completed/new/overdue counts, a daily-completions chart, projects touched, and next week's lineup

### Focus Mode
A Pomodoro timer with configurable focus and break lengths, a chime, browser notifications, session stats, and an "up next" queue tied to your actual task list.

### Files everywhere
Anywhere you can write, you can attach. Drag and drop or browse to upload documents onto projects, tasks, notes, meetings, resources and individual comments. Files show with a type icon, a size, and one-click download, and images preview inline.

### Collaboration
Comments on projects, tasks, notes and meetings, written in the same rich editor as everything else, with @mentions, emoji reactions, pinning and attached documents. An activity feed and a notification centre keep you current on mentions and reassignments.

### Team & workspaces
Switch between workspaces, each with its own members, branding and settings. Roles are owner / admin / member / guest at the workspace level, and viewer / commenter / editor per project for guests. Invite teammates by email with expiring links.

### Make it yours
Nine built-in colour palettes (Common/ADK brand, Monokai, GitHub, Material, Original, Dracula, Nord, Solarized, Catppuccin) plus a custom brand-colour picker, shared across the workspace. Light/dark mode and font choice are personal to you. A tag manager lets you rename, merge and delete tags across all your content at once.

### Find anything
Press <kbd>⌘K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere for a command palette that searches projects, tasks, links, notes and meetings. A floating quick-capture button adds a task, note, link or daily-log win from any page.

### Your data stays yours
Export your whole workspace as JSON, or just your links as CSV, from Settings.

---

## Getting started

```sh
npm install
cp .env.example .env    # point VITE_SUPABASE_URL at your backend
npm run dev
```

Then open <http://localhost:8080> and sign in.

> **Building or deploying WorkOS?** Architecture, data model, API surface, environment variables and deployment steps are in **[DEVDOC.md](./DEVDOC.md)**.
