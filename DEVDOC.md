# WorkOS - Developer Documentation

Technical reference for the WorkOS codebase: architecture, auth model, data model, API surface, and setup/deployment. For a feature overview, see [README.md](./README.md).

## Table of contents

- [Architecture overview](#architecture-overview)
- [Auth model (no Supabase Auth)](#auth-model-no-supabase-auth)
- [The `workos` Edge Function (API gateway)](#the-workos-edge-function-api-gateway)
- [Data model](#data-model)
- [File storage (Oracle, not Supabase Storage)](#file-storage-oracle-not-supabase-storage)
- [Theming system](#theming-system)
- [Frontend structure](#frontend-structure)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Deployment](#deployment)
- [Known constraints / gotchas](#known-constraints--gotchas)

## Architecture overview

```
┌─────────────────┐        HTTPS/JSON         ┌──────────────────────────┐
│  React SPA      │ ───────────────────────▶  │  workos Edge Function    │
│ (Vercel/static) │ ◀───────────────────────  │  (Supabase, Deno)        │
└─────────────────┘        Bearer JWT         └──────────┬───────────────┘
                                                             │ service-role key
                                                             ▼
                                                  ┌──────────────────────┐
                                                  │  Postgres (Supabase) │
                                                  │  RLS: deny-all       │
                                                  └──────────────────────┘

Uploads:  browser ──▶ workos Edge Function ──▶ supabase.dileepadari.dev (Oracle VM)
Reads:    browser ──▶ mystorage.dileepadari.dev (Caddy static files)
```

The frontend **never talks to Postgres or Supabase Storage directly** - no `@supabase/supabase-js` client is used anywhere in `src/`. Every read/write goes through one Edge Function (`supabase/functions/workos/index.ts`) over plain `fetch`, using a self-issued JWT for auth. This was a deliberate choice (see next section) to make an eventual move to a self-hosted, Auth-less Supabase instance a non-event.

## Auth model (no Supabase Auth)

This app intentionally does **not** use Supabase Auth (GoTrue). The plan is to eventually self-host Supabase on infrastructure that has no Auth service, so relying on it now would mean a painful migration later.

Instead:

- **`public.users`** - a plain table (`id`, `username`, `password_hash` via bcrypt, `display_name`, `avatar_url`) that fully replaces `auth.users`. There is no `auth.*` schema dependency anywhere.
- **Hand-rolled JWT** - HS256 sign/verify implemented from scratch with Web Crypto in the Edge Function (`signJwt` / `verifyJwt` / `base64Url*` in `supabase/functions/workos/index.ts`). Payload is `{ sub, username, iat, exp }`, 7-day TTL, secret in the `WORKOS_JWT_SECRET` Edge Function secret.
- **Client-side token storage** - `src/lib/authToken.ts` stores the JWT (localStorage) and decodes it for the current user id; `src/contexts/AuthContext.tsx` wraps sign-up/sign-in/sign-out around it.
- **Authorization lives in application code, not RLS.** The Edge Function holds the `service_role` key and bypasses RLS entirely. Every request handler independently checks workspace/project membership (`workspace_members` / `project_members`) before touching content tables. RLS is still enabled on every table as defense-in-depth (deny-all for `anon`/`authenticated`), but it is **not** the enforcement mechanism - don't add features that assume RLS is doing authorization.
- **`config.toml`** sets `verify_jwt = false` on the `workos` function, because it verifies its own token, not one issued by Supabase.

This mirrors the pattern used by the sibling `portfolio` project's `admin` Edge Function.

## The `workos` Edge Function (API gateway)

Single file: `supabase/functions/workos/index.ts`. Routes:

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create a user + a personal workspace |
| POST | `/auth/login` | Verify password, issue JWT |
| POST | `/invites/:token/accept` | Accept a workspace invite (existing or new user) |
| GET/POST | `/workspaces` | List / create workspaces |
| PATCH | `/workspaces/:id` | Rename workspace |
| GET | `/workspaces/:id/members` | List members |
| GET/POST | `/workspaces/:id/invites` | List / create invites |
| POST | `/data` | **Generic table gateway** - select/insert/update/upsert/delete against any table in `CONTENT_TABLES` |
| POST | `/upload` | Proxies a file to Oracle storage, returns the public URL |
| GET/POST | `/comments`, PATCH/DELETE `/comments/:id` | Comments on any entity |
| POST | `/reactions/toggle`, GET `/reactions` | Emoji reactions on any entity |
| GET | `/notifications`, POST `/notifications/:id/read`, POST `/notifications/read-all` | Notification center |
| GET | `/activity` | Activity feed |

### The `/data` generic gateway

Most content (projects, tasks, notes, resources, milestones, meetings, events, links, daily_log, calendar_integrations, synced_events, saved_views, attachments, workspace_settings) is not one-endpoint-per-table - it all goes through `POST /data` with `{ table, operation, workspace_id, ...filters/payload }`. The `CONTENT_TABLES` config object in `index.ts` declares per-table behavior:

- `projectScoped` - row belongs to a project; guests are scoped to only the projects they're a member of
- `selfIsProject` - special-cased for the `projects` table itself
- `personalOnly` - guests can't access this table at all (e.g. `daily_log`)
- `noCreatedBy` - table doesn't have a `created_by` column (e.g. `attachments` uses `uploaded_by`)
- `orderColumn` - non-default primary key for update/delete (e.g. `workspace_settings` is keyed by `workspace_id`)

When adding a new content table: add it to `CONTENT_TABLES`, add matching RLS deny-all policy in a migration, and add a typed wrapper in `src/lib/api.ts` if you want a nicer call site than raw `api.select/insert/update/upsert/remove`.

## Data model

Core multi-tenancy tables (added in the `20260729000001_stage1_multitenant_custom_auth.sql` migration onward):

- `users` - replaces `auth.users`
- `workspaces`, `workspace_members` (role: `owner` / `admin` / `member` / `guest`), `workspace_invites`, `workspace_settings` (theme/branding)
- `project_members` (role: `viewer` / `commenter` / `editor`) - only meaningful for guests; non-guest workspace members implicitly see all projects
- `comments`, `comment_mentions`, `reactions`, `activity_log`, `notifications` - generic, keyed by `(entity_type, entity_id)` so they work against tasks, notes, projects, meetings, etc.
- `attachments` - metadata for files uploaded via `/upload` (the Oracle storage server itself has no metadata store)
- `saved_views` - named filter/sort combos for the Tasks page

Content tables (`projects`, `tasks`, `notes`, `resources`, `milestones`, `meetings`, `events`, `links`, `daily_log`, `calendar_integrations`, `synced_events`) predate the multi-tenant rebuild and were extended with `workspace_id` + `created_by`. Rich content lives in paired `content_json` (BlockNote `Block[]`) / `content_text` (plain-text mirror, used for search/previews) columns.

Full schema history is in `supabase/migrations/`, applied via `npx supabase db push`.

## File storage (Oracle, not Supabase Storage)

Uploads do **not** go through Supabase Storage. `handleUpload` in the Edge Function:

1. Signs a short-lived admin JWT (`{ is_admin: true }`) using `SELFHOST_JWT_SECRET` - a **different** secret from `WORKOS_JWT_SECRET`, specific to the self-hosted Oracle box
2. POSTs the file to `https://supabase.dileepadari.dev/functions/v1/upload`
3. Returns the public URL, served statically from `https://mystorage.dileepadari.dev/images/{category}/{fileName}` via Caddy

Filenames must match `^[a-zA-Z0-9._-]+$` (no slashes) - `src/lib/api.ts`'s `upload()` sanitizes `file.name` before sending. The `attachments` table records metadata (uploader, size, mime type) that the storage server itself doesn't track.

## Theming system

`src/contexts/ThemeContext.tsx` is the single theme provider (an earlier version had two competing providers - merged during the design pass).

- **Personal** (localStorage): light/dark mode, font family
- **Workspace-shared** (persisted via `workspace_settings`, visible to the whole team): color palette (`colorPalette` - one of 9 built-in presets or `'custom'`) and, if custom, a primary/accent hex pair
- `applyColors()` writes all the shadcn CSS custom properties (`--primary`, `--border`, `--input`, etc.) as inline styles on `document.documentElement` - palettes are defined once in `colorPalettes` and don't need Tailwind config changes to add new ones
- `hexToHSL()` / `buildCustomPalette()` derive the full palette (including dark-mode variants) from just a primary + accent hex

**Gotcha already fixed once, don't reintroduce it:** `--input` must track the same value as `--border` (`p('border', 'darkBorder')`), not the card/surface color - binding it to surface makes every plain `Input`/`Select` border nearly invisible in light mode.

## Frontend structure

```
src/
  pages/            One file per route (see src/App.tsx for the route table)
  components/
    ui/             shadcn primitives (button, dialog, input, ...) - generated, edit sparingly
    tasks/           Task-specific views (board/list/filter bar/bulk actions/assignee picker)
    editor/          BlockEditor.tsx - the shared BlockNote wrapper used everywhere rich text appears
  contexts/          AuthContext, WorkspaceContext, ThemeContext, SearchContext
  lib/
    api.ts           The only place that calls fetch() against the Edge Function
    authToken.ts      JWT storage/decoding
    taskMeta.ts        Single source of truth for task status/priority labels+colors+sort order
    blockContent.ts    BlockNote <-> plain text / legacy-content helpers
supabase/
  functions/workos/    The one Edge Function (see above)
  migrations/           Schema history
```

`src/lib/taskMeta.ts` is the single source of truth for status/priority labels, colors, and sort order - don't reimplement these maps in a page component; four separate copies of this logic is exactly the inconsistency the original rebuild was meant to fix.

## Environment variables

### Frontend (Vite / Vercel)

Only one is actually read by client code (`src/lib/api.ts`) - there is no Supabase JS client, so no anon/publishable key is needed on the frontend at all:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Base URL for the Edge Function (`{url}/functions/v1/workos`) |

### Backend / local tooling only - never put these in Vercel

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Used by the Edge Function to bypass RLS |
| `WORKOS_JWT_SECRET` | Signs/verifies this app's own JWTs (set via `supabase secrets set`) |
| `SELFHOST_JWT_SECRET` | Signs the admin JWT sent to the Oracle upload endpoint |
| `ORACLE_UPLOAD_API_KEY` | `x-upload-key` header for the Oracle storage server |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth (`supabase login`) |
| `SUPABASE_DB_PASSWORD` | Supabase CLI `db push` |
| `ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` | Used once by `scripts/create-user.mjs` to seed the first account |

`WORKOS_JWT_SECRET`, `SELFHOST_JWT_SECRET`, `ORACLE_UPLOAD_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are Edge Function **secrets**, set with:

```sh
npx supabase secrets set WORKOS_JWT_SECRET=... SELFHOST_JWT_SECRET=... ORACLE_UPLOAD_API_KEY=...
```

They live on Supabase's infrastructure and are read via `Deno.env.get()` inside `index.ts` - not part of the frontend build.

## Local development

```sh
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL at minimum
npm run dev             # http://localhost:8080
```

Useful scripts:

```sh
npm run test            # vitest run
npm run lint             # eslint
npm run build             # production build
node scripts/create-user.mjs   # bootstrap the first account (needs SUPABASE_URL/SERVICE_ROLE_KEY/ADMIN_BOOTSTRAP_* env vars)
```

Backend changes:

```sh
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push                      # apply new migrations
npx supabase functions deploy workos       # deploy the Edge Function
```

## Deployment

- **Frontend**: static Vite build, deployed on Vercel. `vercel.json` has an SPA rewrite (`/:path* → /index.html`) since this is a client-routed app. Only `VITE_SUPABASE_URL` needs to be set in the Vercel project's environment variables.
- **Backend**: Supabase project (Postgres + the `workos` Edge Function). Migrations and function deploys are pushed via the Supabase CLI, not through Vercel.
- **File storage**: an external Oracle VM running its own Caddy + upload service - not part of this repo's deploy pipeline; changes there happen over SSH.

## Known constraints / gotchas

- **No client-side Supabase Realtime.** The browser only ever holds our own JWT, never a Supabase-authenticated session, so RLS-gated `postgres_changes` subscriptions don't apply here. "Live" updates come from TanStack Query polling/refetch-on-focus, not websockets.
- **RLS is not authorization.** It's deny-all everywhere, purely as a defense-in-depth backstop. All real access control is in the Edge Function's handlers - if you add a new table or route, you must add the membership check yourself.
- **BlockNote height/padding parity with shadcn `Input`.** The rules in `src/index.css` under "BLOCKNOTE (Notion-style editor) ALIGNMENT" exist because BlockNote's own placeholder pseudo-element wraps onto its own line when following a block-level `<p>`, silently doubling row height. If you upgrade `@blocknote/*`, re-verify these rules still apply cleanly (inspect `.bn-block-content` / `.bn-editor` computed styles) rather than assuming they still match the new DOM.
- **Filenames for uploads must be flat** (no directory separators) - the Oracle storage server has no folder/tenancy concept, so `workspaceId`/`entityType`/`entityId` are folded into the filename itself instead.
