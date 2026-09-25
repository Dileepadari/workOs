# Comment style

**A comment explains why, never what.**

The code already says what it does. A comment repeating it costs a line, ages
into a lie, and teaches the next reader to skip comments.

## What belongs in one

- **A decision and the alternative it beat.** Why this and not the obvious thing.
- **A constraint from outside the file.** A platform quirk, a protocol rule, a
  limit in a dependency, another service's behaviour.
- **A trap.** Something that looks safe to change and is not.
- **A threat model.** What a guard defends against, so nobody relaxes it.

```ts
/** Monday. Passed explicitly everywhere - date-fns defaults to Sunday, which
 *  quietly put every "this week" boundary a day out. */
export const WEEK_OPTS = { weekStartsOn: 1 as const };
```

That comment outlives any rewrite of the line under it, because it is about
the library's behaviour rather than this syntax.

## What does not

```ts
// Set the state
setOpen(true);

// Map over the tasks
tasks.map(...)
```

Noise. So is commented-out code: the history has it.

## Module headers

Every file the project owns opens with a header saying what the module is for
and one thing that is not obvious from reading it, then `@module <path>`.

```ts
// Which workspace the user is looking at, and the list they may choose from.
//
// Nearly every API call is scoped by workspace_id, so this is the single place
// that id comes from.
//
// @module contexts/WorkspaceContext
```

`src/components/ui/**` is vendored shadcn/ui and is left exactly as generated,
headers included, so it can be regenerated without a merge.

## The edge function

`supabase/functions/workos/index.ts` is the whole API surface **and the whole
authorization boundary**: every membership and role check happens there,
against the service-role key, with RLS deny-all underneath as a second line
rather than the first. A route that forgets a check is a cross-workspace leak,
not a bug in a screen.

So every handler that takes a `workspace_id` says, in a comment or in obvious
code, what it checked before it trusted it. Anything that reaches outside the
app - the storage box, a model provider - says what it is lending and to whom.

## Tests

A test's name says what it checks. Its comment says **what broke**, so whoever
deletes the assertion knows what they are giving up:

```ts
// Before completed_at existed this used updated_at, so editing an old
// finished task counted it as finished again today.
```

## Punctuation

Plain ASCII everywhere: files, UI strings, commit messages. No em dashes, no
emoji, no arrow glyphs. Use `-`, `>`, or rewrite the sentence.
