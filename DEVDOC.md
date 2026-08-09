# WorkOS - Developer Documentation

Technical reference for the WorkOS codebase: architecture, auth model, data model, API surface, and setup/deployment. For what the app does from a user's point of view, see [README.md](./README.md).

## Table of contents

- [Tech stack](#tech-stack)
- [Architecture overview](#architecture-overview)
- [Auth model (no Supabase Auth)](#auth-model-no-supabase-auth)
- [The `workos` Edge Function (API gateway)](#the-workos-edge-function-api-gateway)
- [Data model](#data-model)
- [File storage (Oracle, not Supabase Storage)](#file-storage-oracle-not-supabase-storage)
- [Attachments](#attachments)
- [Secrets vault](#secrets-vault)
- [Theming system](#theming-system)
- [Frontend structure](#frontend-structure)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Deployment](#deployment)
- [Known constraints / gotchas](#known-constraints--gotchas)

## Tech stack

React 18 + TypeScript + Vite, Tailwind CSS v3 + shadcn/ui, TanStack Query, BlockNote (rich text), dnd-kit (task board), recharts (charts), date-fns. The backend is Supabase Postgres reached through a single custom Deno Edge Function - no `@supabase/supabase-js` client and no Supabase Auth in the browser (see below for why).

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
| GET/POST | `/secrets`, PATCH/DELETE `/secrets/:id`, POST `/secrets/:id/reveal` | Encrypted secrets vault |

### The `/data` generic gateway

Most content (projects, tasks, notes, resources, milestones, meetings, events, links, daily_log, calendar_integrations, synced_events, saved_views, attachments, workspace_settings) is not one-endpoint-per-table - it all goes through `POST /data` with `{ table, operation, workspace_id, ...filters/payload }`. The `CONTENT_TABLES` config object in `index.ts` declares per-table behavior:

- `projectScoped` - row belongs to a project; guests are scoped to only the projects they're a member of
- `selfIsProject` - special-cased for the `projects` table itself
- `personalOnly` - guests can't access this table at all (e.g. `daily_log`)
- `noCreatedBy` - table doesn't have a `created_by` column (e.g. `attachments` uses `uploaded_by`)
- `orderColumn` - non-default primary key for update/delete (e.g. `workspace_settings` is keyed by `workspace_id`)

When adding a new content table: add it to `CONTENT_TABLES`, add matching RLS deny-all policy in a migration, and add a typed wrapper in `src/lib/api.ts` if you want a nicer call site than raw `api.select/insert/update/upsert/remove`.

**Not everything belongs on this gateway.** `/data` returns whole rows, so any table with a column that must never appear in a list response needs its own routes instead - that's exactly why `secrets` has them.

`dynamicTable(table)` (top of `index.ts`) is the deliberately loosely-typed handle used by the `/data` paths: addressing a table by a runtime string leaves supabase-js with no per-table types to infer, and its generic builder chain otherwise exceeds the compiler's instantiation-depth limit (TS2589). Every named-table query in the file keeps full inference - don't reach for `dynamicTable` outside the generic gateway.

## Data model

Core multi-tenancy tables (added in the `20260729000001_stage1_multitenant_custom_auth.sql` migration onward):

- `users` - replaces `auth.users`
- `workspaces`, `workspace_members` (role: `owner` / `admin` / `member` / `guest`), `workspace_invites`, `workspace_settings` (theme/branding)
- `project_members` (role: `viewer` / `commenter` / `editor`) - only meaningful for guests; non-guest workspace members implicitly see all projects
- `comments`, `comment_mentions`, `reactions`, `activity_log`, `notifications` - generic, keyed by `(entity_type, entity_id)` so they work against tasks, notes, projects, meetings, etc.
- `attachments` - metadata for files uploaded via `/upload` (the Oracle storage server itself has no metadata store)
- `saved_views` - named filter/sort combos for the Tasks page
- `secrets` - the encrypted credentials vault (see [Secrets vault](#secrets-vault))

Content tables (`projects`, `tasks`, `notes`, `resources`, `milestones`, `meetings`, `events`, `links`, `daily_log`, `calendar_integrations`, `synced_events`) predate the multi-tenant rebuild and were extended with `workspace_id` + `created_by`. Rich content lives in paired `content_json` (BlockNote `Block[]`) / `content_text` (plain-text mirror, used for search/previews) columns.

Full schema history is in `supabase/migrations/`, applied via `npx supabase db push`.

## File storage (Oracle, not Supabase Storage)

Uploads do **not** go through Supabase Storage. They go to the same Oracle VM the sibling `portfolio` project uses. Two different hosts are involved, which is the main thing to understand here:

| Role | Host | Set by |
|---|---|---|
| Upload endpoint | `https://supabase.dileepadari.dev` | `ORACLE_UPLOAD_BASE_URL` |
| Public read (Caddy static) | `https://mystorage.dileepadari.dev` | `ORACLE_PUBLIC_BASE_URL` |

`handleUpload` in the Edge Function:

1. Signs a short-lived admin JWT (`{ is_admin: true }`, 60s) using `SELFHOST_JWT_SECRET` - a **different** secret from `WORKOS_JWT_SECRET`, specific to the self-hosted Oracle box. If `ORACLE_UPLOAD_API_KEY` is also set it sends `x-upload-key` too, so both the current self-hosted-Supabase contract and the older standalone upload service work.
2. POSTs the raw bytes to `{ORACLE_UPLOAD_BASE_URL}{ORACLE_UPLOAD_PATH}` (default `/functions/v1/upload`) with `x-app-name`, `x-file-name` and `x-file-type` (`images` | `documents`).
3. Builds the public URL with `publicUrlFor()` and returns that.

**The upload response's `url` field is never trusted for its host.** That endpoint returns a URL on the wrong domain - a known bug on the storage box, worked around the same way in `portfolio`'s `admin` function. `publicUrlFor()` therefore always takes the host from `ORACLE_PUBLIC_BASE_URL`, and takes only the *path* from the response (the server is the only thing that knows which folder the file landed in), falling back to the documented `{ORACLE_STORAGE_FOLDER}/{ORACLE_APP_NAME}/{fileName}` convention if the response URL is missing or unparseable. If you ever "simplify" this back to `return result.url`, every uploaded file will 404.

Filenames must match `^[a-zA-Z0-9._-]+$` - no slashes, because the storage server does `Deno.writeFile(\`${dir}/${fileName}\`)` with no sanitization of its own. `storageFileName()` in `src/lib/api.ts` is the single place that builds them.

## Attachments

The storage server has no tenancy or metadata concept, so `public.attachments` is what actually scopes a file to a workspace and an entity. Rows are keyed by `(entity_type, entity_id)`, which is why the same table serves projects, tasks, notes, meetings, links and individual comments.

- `attachments` in `src/lib/api.ts` is the only place that pairs an upload with its metadata row (`attachments.upload`). `BlockEditor`'s `uploadFile` calls it too, so a file pasted into the editor and one added through the Files panel land in the same list.
- `AttachmentsPanel` (`src/components/AttachmentsPanel.tsx`) is the shared UI: drag-and-drop or browse, list, download, remove. `readOnly` renders nothing at all when there are no files, so it can sit under every comment in a thread without adding noise. `compact` tightens it for dialogs.
- `UploadUrlButton` is the variant for forms whose main field is a URL (resources, saved links) - it uploads and hands back the stored file so the row points at a permanent URL.

**Draft ids.** Files usually need somewhere to belong *before* the row they hang off exists. Most forms solve this by generating a uuid client-side and inserting it as the row's own `id` (`Notes`, `Tasks`, `Resources`, meetings), so files uploaded against the draft already belong to the right entity once saved. Comments can't: the server mints the comment id. `CommentsPanel` therefore stages files against the composer's draft id and calls `attachments.reassign(...)` after posting to re-point them. If you add another server-id-generating entity, follow that pattern.

## Secrets vault

`public.secrets` stores credentials per workspace. Values are **encrypted, not hashed** - a hash is one-way and could never be shown again, and the feature is "masked until I click reveal", so it has to be reversible.

- **Cipher**: AES-GCM (authenticated - a tampered ciphertext fails to decrypt rather than returning garbage), with a 256-bit key derived as `SHA-256(WORKOS_SECRETS_KEY)`. Stored as `v1.<base64url iv>.<base64url ciphertext>`; the `v1.` prefix is there so the format can change later without guessing.
- **Key separation**: `WORKOS_SECRETS_KEY` is deliberately *not* `WORKOS_JWT_SECRET`. Rotating the signing key only invalidates sessions; rotating the secrets key makes every stored value unreadable. **There is no key-rotation path yet** - changing it orphans existing rows, and reveal returns an explicit error saying so rather than a raw crypto failure.
- **Never on `/data`**: secrets have dedicated routes so list responses can select an explicit column list that omits `value_encrypted` entirely. Decryption happens only in `POST /secrets/:id/reveal`, one entry at a time.
- **Guests are refused** by `requireSecretsAccess`, regardless of project membership.
- **Client side**: the `Secret` type has no `value` field at all, so a plaintext value can't accidentally be rendered from a list. `Secrets.tsx` holds revealed values in a keyed map and clears them on hide, on a 30s timer (`REVEAL_TIMEOUT_MS`), on unmount and on workspace switch.

Not yet done: reveals aren't written to `activity_log`. Worth adding if this grows into a real shared vault.

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
  pages/             One file per route (see src/App.tsx for the route table)
  components/
    ui/              shadcn primitives - generated, edit sparingly
    tasks/           Task-specific views (board/list/filter bar/bulk actions/assignee picker)
    editor/          BlockEditor.tsx - the shared BlockNote wrapper used everywhere rich text appears
    skeletons/       Loading placeholders, shaped per page
    AttachmentsPanel.tsx / UploadUrlButton.tsx   Shared file-upload UI
  contexts/          AuthContext, WorkspaceContext, ThemeContext, SearchContext
  lib/
    api.ts           The only place that calls fetch() against the Edge Function
    authToken.ts     JWT storage/decoding
    taskMeta.ts      Task status/priority labels + colors + sort order
    secretMeta.ts    Secret categories, labels, colors, masking constants
    fileMeta.ts      File type classification + human-readable sizes
    blockContent.ts  BlockNote <-> plain text / legacy-content helpers
tests/               Mirrors src/ - see Testing below
supabase/
  functions/workos/  The one Edge Function (see above)
  migrations/        Schema history
```

The `*Meta.ts` files are single sources of truth for their label/colour/order maps - don't reimplement them in a page component. Four separate divergent copies of the task-status logic is exactly the inconsistency the original rebuild was meant to fix.

Only `src/components/ui` primitives that are actually imported are kept in the repo; unused shadcn components were removed along with the Radix packages behind them. Add one back with the shadcn CLI when you need it, and add its dependency at the same time.

## Testing

Vitest + Testing Library, jsdom environment. Tests live in `tests/`, outside `src/`, mirroring its structure - so the production tree stays free of test files, and `tests/setup.ts` is the one setup module.

```
tests/
  setup.ts                          jest-dom matchers + matchMedia stub
  lib/{api,blockContent,fileMeta,secretMeta,taskMeta}.test.ts
  components/AttachmentsPanel.test.tsx
```

Tests import through the `@/` alias, never relative paths into `src/`. `tsconfig.test.json` exists so `npm run typecheck` covers `tests/` too - `tsconfig.app.json` only includes `src`.

`tests/lib/api.test.ts` stubs `fetch` and asserts on the *request* the client makes (headers, method, body), which is what pins the contract with the Edge Function: that uploads send the right `x-file-type`, that `secrets.update` omits `value` so a metadata edit can't wipe a stored secret, and that a 401 clears the stored token.

## Continuous integration

`.github/workflows/ci.yml`, on push to `main` and every PR:

- **frontend** - `npm ci`, then lint, typecheck (app + tests), test, and a production build. The build step catches what the typechecker doesn't: unresolvable imports and broken asset references.
- **edge-function** - `deno check supabase/functions/workos/index.ts`. The function is Deno, excluded from `tsconfig` and ESLint, so without this job it would have no CI coverage at all. `supabase/functions/deno.json` exists so Deno resolves `npm:` specifiers from the registry instead of walking up to the frontend's `node_modules`.

Lint runs with zero errors and is expected to stay that way. Two files (`src/integrations/calendar/sync.ts`, `src/pages/CalendarPage.tsx`) have a scoped `no-explicit-any: warn` override - known, deliberately visible debt in the hand-rolled ICS parser. `any` remains an **error** everywhere else, so new code can't quietly add more.

## Environment variables

### Frontend (Vite / Vercel)

Only one is actually read by client code (`src/lib/api.ts`) - there is no Supabase JS client, so no anon/publishable key is needed on the frontend at all:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Base URL for the Edge Function (`{url}/functions/v1/workos`) |

### Backend / local tooling only - never put these in Vercel

| Variable | Purpose | Default |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Used by the Edge Function to bypass RLS | injected by Supabase |
| `SUPABASE_URL` | Project URL, used by the function itself | injected by Supabase |
| `WORKOS_JWT_SECRET` | Signs/verifies this app's own user JWTs | - (required) |
| `WORKOS_SECRETS_KEY` | Encrypts the secrets vault at rest. **Changing it orphans every stored secret** | - (vault disabled if unset) |
| `SELFHOST_JWT_SECRET` | Signs the short-lived admin JWT sent to the Oracle upload endpoint | - |
| `ORACLE_UPLOAD_API_KEY` | `x-upload-key` header, for the older standalone upload service | `""` |
| `ORACLE_UPLOAD_BASE_URL` | Upload host | `https://supabase.dileepadari.dev` |
| `ORACLE_UPLOAD_PATH` | Path on the upload host | `/functions/v1/upload` |
| `ORACLE_PUBLIC_BASE_URL` | Public read host (Caddy) | `https://mystorage.dileepadari.dev` |
| `ORACLE_APP_NAME` | Storage namespace; must be in the storage server's own allowlist | `workos` |
| `ORACLE_STORAGE_FOLDER` | Folder used when rebuilding a public URL | `images` |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth (`supabase login`) | - |
| `SUPABASE_DB_PASSWORD` | Supabase CLI `db push` | - |
| `ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` | Used once by `scripts/create-user.mjs` to seed the first account | - |

Everything the function reads at runtime is an Edge Function **secret**, set with:

```sh
npx supabase secrets set \
  WORKOS_JWT_SECRET="$(openssl rand -hex 32)" \
  WORKOS_SECRETS_KEY="$(openssl rand -hex 32)" \
  SELFHOST_JWT_SECRET=... \
  ORACLE_APP_NAME=workos
```

Generate `WORKOS_SECRETS_KEY` once and **back it up somewhere you can recover it** - it is the only thing that can decrypt the vault.

They live on Supabase's infrastructure and are read via `Deno.env.get()` inside `index.ts` - not part of the frontend build.

## Local development

```sh
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL
npm run dev            # http://localhost:8080
```

`.npmrc` sets `legacy-peer-deps=true`: `@blocknote/shadcn` declares a peer on Tailwind v4 while this project is on v3 (the `src/components/ui` primitives and `tailwind.config.ts` are v3-shaped). It works fine at runtime; without the flag, `npm install` fails with `ERESOLVE`.

Useful scripts:

```sh
npm run lint         # eslint - must stay at 0 errors
npm run typecheck    # tsc over src/ and tests/
npm run test         # vitest run
npm run test:watch   # vitest, watching
npm run build        # production build
npm run create-user  # bootstrap the first account (env vars only - see the script header)
```

`emoji-mart` is a declared dependency even though nothing imports it directly - it's a required peer of `@emoji-mart/react`, and `legacy-peer-deps` means npm won't install it automatically. Don't "clean it up".

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
- **Upload and public-read are different hosts.** Never return the upload endpoint's own `url` to the client; see [File storage](#file-storage-oracle-not-supabase-storage).
- **`WORKOS_SECRETS_KEY` has no rotation path.** Changing it makes every existing vault entry undecryptable. Adding rotation means re-encrypting every row under the new key in a migration, which nothing does today.
- **The frontend bundle is ~2.5 MB** (733 kB gzipped), dominated by BlockNote and recharts. Not code-split yet; if that becomes a problem, route-level `React.lazy` is the obvious first move.
