// Who may delete a blob from the shared storage box.
//
// The delete path mints an `is_admin: true` token for a box shared with two
// sibling projects, so these cover the case that matters: a signed-in user who
// has nothing to do with the file.
//
// Run: deno test supabase/functions/workos/
//
// @module workos/file-access_test

import { assertEquals } from 'jsr:@std/assert@^1';
import { canDeleteStoredFile, type FileAccessDeps } from './file-access.ts';

const URL_A = 'https://mystorage.dileepadari.dev/images/spec.pdf';

/** Deps backed by plain tables, so each test states the whole world it needs. */
const deps = (
  attachments: Record<string, string[]>,
  members: Record<string, string[]>,
): FileAccessDeps => ({
  attachmentWorkspaces: (url) => Promise.resolve(attachments[url] ?? []),
  isMember: (userId, workspaceId) => Promise.resolve((members[userId] ?? []).includes(workspaceId)),
});

Deno.test('a member of the owning workspace may delete the file', async () => {
  const access = await canDeleteStoredFile(
    URL_A,
    'user-1',
    deps({ [URL_A]: ['ws-1'] }, { 'user-1': ['ws-1'] }),
  );
  assertEquals(access, { ok: true });
});

Deno.test('a signed-in stranger may not', async () => {
  // Authentication alone used to be the whole check here, so any account could
  // delete any file on the box by url.
  const access = await canDeleteStoredFile(
    URL_A,
    'user-2',
    deps({ [URL_A]: ['ws-1'] }, { 'user-2': ['ws-9'] }),
  );
  assertEquals(access, { ok: false, status: 403, error: 'Not a member of the workspace that owns that file' });
});

Deno.test('a url this app holds no attachment for is refused', async () => {
  // 404 rather than 403 on purpose: a 403 here would confirm the file exists,
  // turning the endpoint into a probe for the shared box's contents.
  const access = await canDeleteStoredFile(URL_A, 'user-1', deps({}, { 'user-1': ['ws-1'] }));
  assertEquals(access, { ok: false, status: 404, error: 'No attachment found for that url' });
});

Deno.test('membership of any one owning workspace is enough', async () => {
  // The same file can be attached in several workspaces; the caller only has
  // to belong to one of them.
  const access = await canDeleteStoredFile(
    URL_A,
    'user-3',
    deps({ [URL_A]: ['ws-1', 'ws-2'] }, { 'user-3': ['ws-2'] }),
  );
  assertEquals(access, { ok: true });
});

Deno.test('duplicate attachment rows are collapsed before the membership checks', async () => {
  let lookups = 0;
  const access = await canDeleteStoredFile(URL_A, 'user-4', {
    attachmentWorkspaces: () => Promise.resolve(['ws-1', 'ws-1', 'ws-1']),
    isMember: () => {
      lookups += 1;
      return Promise.resolve(false);
    },
  });
  assertEquals(access.ok, false);
  assertEquals(lookups, 1);
});

Deno.test('a user in no workspace at all is refused', async () => {
  const access = await canDeleteStoredFile(URL_A, 'user-5', deps({ [URL_A]: ['ws-1'] }, {}));
  assertEquals(access, { ok: false, status: 403, error: 'Not a member of the workspace that owns that file' });
});
