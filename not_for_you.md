# not_for_you.md

A working log for WorkOS. Small decisions, dead ends and the reasoning that did not earn a
place in DEVDOC. Written for me, in six months, wondering why something is the way it is.

---

## The one that mattered: lending admin rights to anyone signed in

`DELETE /file?url=...` sat below the auth gate, so it was authenticated. It was not authorized.

It took a url, checked that the origin matched the storage host and that the filename was
safe, and then deleted the file. Nothing asked whose file it was.

What makes that worse than it sounds is the next few lines: the handler mints a JWT with
`is_admin: true`, signed with the **storage box's** secret, and sends it along. So the app was
lending its administrative capability on that box to any account that could log in, for any
filename. And the box is shared - the function's own header says the sibling `portfolio` and
`placements` projects upload to it too.

The data to do it properly was already there. `attachments` has `workspace_id`, `url` and
`uploaded_by`. The check is: find the rows pointing at this url, require the caller to be a
member of one of those workspaces. Four lines.

Two details I thought about longer than the fix itself:

- **404, not 403, for a url nothing claims.** A 403 would confirm the file exists, which turns
  the endpoint into a way to probe the contents of a shared box. A 404 says nothing either way.
- **The client already deletes the blob before the metadata row**, and there is a comment
  explaining why: if the blob delete fails the row survives and the file is still findable.
  That ordering is right, and it happens to be *required* now - the row is what authorizes the
  blob delete, so it has to still exist when the call is made.

`/file-text` looks like the same shape and is not: it only fetches a url that Caddy already
serves publicly, so it hands the caller nothing they could not have fetched themselves. Its
origin check is done properly too, with a comment saying why it compares `origin` rather than
using `startsWith` - `https://mystorage.dileepadari.dev.evil.com` would pass the latter.

## Testing a Deno handler without standing up the function

The decision lives in a 1335-line file with a top-level `Deno.serve` and env reads that run on
import, so importing it in a test starts a server.

The codebase already had the answer: `cherry/routes.ts` takes a `CherryDeps` object and is
therefore importable. I did the same thing on a smaller scale - `file-access.ts` exports the
decision, taking `attachmentWorkspaces` and `isMember` as functions, so a test can supply both
halves as plain tables.

Then I found that `deno test` **had never run in CI**. `services/gateway/assistant/assistant_test.ts`
existed, with a "Run: deno test assistant/" line in its header, and nothing ran it. Eleven
tests, passing, executed by hand at some point months ago. That is the same category as the
bugs this pass keeps finding, just pointed at the tooling: a check that checks nothing because
nobody invokes it.

Both suites are in CI now. So is `deno check` on the workos function, which was the only edge
function nothing type-checked - the gateway and moneyos were both covered.

## Four lockfiles npm has never read

`apps/workos/package-lock.json` was tracked. So are the other three apps'.

npm resolves a workspace from the **root** lockfile. Worse, `npm install` run inside
`apps/workos` walks up and rewrites the root one, leaving the child untouched. So a child
lockfile here cannot be maintained even deliberately.

I found this by accident - the ASCII sweep flagged a heart emoji in a funding field inside
`apps/workos/package-lock.json` - and then wrote a check to see how far it had drifted:

```
workos: dependencies.react is "^19.2.0" in package.json but "^18.3.1" in its lockfile
workos: devDependencies.vite is "^7.3.6" in package.json but "^5.4.19" in its lockfile
workos: devDependencies.vitest is "^5.0.0" in package.json but "^3.2.4" in its lockfile
workos: devDependencies.tailwindcss is "^4.1.14" in package.json but "^3.4.17" in its lockfile
```

A React **18** lockfile against React **19** source. Anyone cloning the mirror and running
`npm ci` gets a hard error; `npm install` quietly gives them a different app.

I deleted it rather than regenerating it, because regenerating only resets the clock on a file
that cannot be kept in step. The check stays, scoped to workos, and the other three apps fail
it today - run `node ops/check-app-lockfiles.mjs` with no arguments to see.

**My first version of that check was itself useless.** I wrote it as "regenerate the lockfile
and diff", copying the README-pair pattern, and it reported all four apps in sync. They were
not: `npm install --package-lock-only` inside the app had walked up to the root, changed
nothing locally, and the diff was empty. The check passed because it had done nothing. Second
time that exact shape has caught me.

## The README said the opposite of the truth

> It has no workspace dependencies

Five files import `@completeos/auth-client` and `@completeos/ui`. Neither was declared in
`apps/workos/package.json`. They resolved anyway, because npm hoists workspace packages into
the root `node_modules` and the bundler finds them there.

So the build worked by accident, and the mirror repo advertised itself as standalone while
being exactly as unbuildable as the standalone portfolio repo already was - the CompleteOS
notes describe that breakage in detail, and nobody noticed workos had joined it.

Both fixed: the packages are declared the way the other three apps declare them, and the README
now says plainly that it does not build on its own.

## The 2.4MB entry chunk

Every one of fifteen pages was eagerly imported in `App.tsx`, so the BlockNote editor - 793KB
on its own - was in the chunk a signed-out visitor had to parse before seeing the login form.

`lazy()` on everything except `Auth`, which is what that visitor is about to see anyway:

```
before: index.js  2,423.97 kB  (gzip 687.70 kB)
after:  index.js    613.90 kB  (gzip 191.96 kB)
```

Then I went to add the bundle tripwire portfolio already has, and found it would break:

```sh
bytes=$(stat -c%s dist/assets/index-*.js)
```

Code splitting produces three `assets/index-*.js`, so the glob hands `stat` three files and
`-gt` gets three numbers. It would have errored rather than failed honestly. The check reads
the entry out of `dist/index.html` now, which is where the truth is, and portfolio gets the
same treatment.

## Documentation that had drifted with the platform

The app moved from a directly-addressed Supabase project to the shared gateway, and from
Tailwind 3 to 4. The docs did not follow:

- `.env.example` named `VITE_SUPABASE_URL`. **Nothing reads it.** The app reads
  `VITE_GATEWAY_URL`, and falls back to the hosted `https://api.dileepadari.dev` when unset -
  so following the setup instructions set a variable with no effect and left you pointed at
  production without a word. That is the worst of the three, because it fails silently and in
  the wrong direction.
- DEVDOC said `.npmrc` exists because `@blocknote/shadcn` peers Tailwind v4 "while this project
  is on v3". The project is on v4, and `.npmrc` says it is about `react-day-picker` peering
  `date-fns`.
- DEVDOC and `components.json` both pointed at `tailwind.config.ts`, which the v4 migration
  deleted. v4 is CSS-first; the theme is in `src/index.css`.

## Decisions I am not relitigating

- **react-router 7 for workos alone.** The open-redirect advisory covers 6.0.0 - 7.17.0 and the
  app was on 6.30.6. I checked reachability first: every `navigate()` and `<Link to>` target is
  a literal or a template with a fixed prefix and a uuid, and `entity_id` is a `uuid` column, so
  a backslash payload cannot survive the insert. Not exploitable here. Upgraded anyway because
  the app uses only the declarative API - `Link`, `Navigate`, `NavLink`, `Outlet`, `useLocation`,
  `useNavigate`, `useParams` - which makes v7 a drop-in. moneyos and lifebook are still on 6 and
  share the hoisted copy; that is their call, not this pass's.
- **The coverage floor is 8%.** Honest, measured across all of `src` with shadcn excluded, not
  flattered by measuring only the files the tests import. It is not a quality bar and the DEVDOC
  says so. It exists because Vitest exits 0 when it collects nothing.
- **`src/components/ui/**` is left exactly as generated.** It is vendored shadcn - there is a
  `components.json` registry - so no module headers, and the sweep should keep skipping it.
- **A token with no `exp` is accepted forever.** `verifyJwt` only checks expiry when `exp` is a
  number. Every issuance sets one, so reaching this needs the signing secret, at which point it
  is the least of the problems. Worth knowing if a second issuer is ever added.

## The screenshots, and the bug they found

Captured against the live deployment, in a throwaway "Northwind Demo" workspace built through
the app's own API, so nothing real is in the gallery. Emptied afterwards - 39 rows across nine
tables, all of them mine.

The harness is an iframe injected into the live page rather than a file served from a proxy.
A proxy origin cannot carry the session: the access token lives in memory behind a refresh
cookie, not in localStorage, so a seeded harness on `localhost:4100` would have captured the
login screen on every route. Same-origin, the frame inherits both.

**The Tasks page white-screened the moment any task had a due date.**

```
RangeError: Invalid time value
    at Tasks-CajMOcEi.js
```

`due_date` is declared `DATE` in the migrations and the deployed database hands back a full
timestamp. `TaskCard` did:

```ts
const due = new Date(`${task.due_date}T00:00:00`);
```

which built `2026-10-03T00:00:00.000ZT00:00:00`, an invalid date - and `format()` throws on
one, which unmounts the whole page. Not a rendering glitch: a blank screen.

Two quieter versions of the same assumption were next to it. Calendar sync built
`` `${due_date}T${due_time}` `` and produced Invalid Date for every task with a time. And the
edit form fed the raw timestamp to an `<input type="date">`, which ignores it - so opening a
task showed an empty due date and saving cleared it.

All three go through `dueDay()` now. It exists because the schema and the database disagree,
and the client cannot fix that from here.

**It had never been hit because the real workspace has no tasks at all.** Creating three
projects and eleven tasks was what found it. That is the whole argument for Phase 7: the app
had passed lint, typecheck, 84 tests and a production build with this in it.

### Smaller things the live run turned up

- **There is no way to delete a workspace.** No `DELETE /workspaces/:id` route exists, so the
  emptied demo workspace shell is still there. You can create workspaces forever and never
  remove one.
- **The gateway collapses a constraint violation into `502 "The database refused that change."`**
  Accurate and useless: `resources` and `meetings` both require `project_id`, and `meetings` has
  no `duration_minutes`, but finding that out meant reading the migrations. The column name
  would cost nothing to pass through.
- **The floating assistant covers content on a phone.** Measured rather than eyeballed: a
  `fixed bottom-3 right-4` button occupying x 278-374, y 700-832 in a 390px viewport - a quarter
  of the width, sitting over the first project card. It comes from `@completeos/ui` and is
  shared by all four apps, so it is not this pass's to change.
- No horizontal page scroll at 390px: `scrollWidth` is exactly 390.
