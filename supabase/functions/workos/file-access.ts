// Who may delete a blob from the shared storage box.
//
// Split out of index.ts so the decision can be tested without standing up the
// function, and because it is the only part of the file routes that is a
// security decision rather than plumbing.
//
// The box is shared with the sibling portfolio and placements projects and the
// delete path mints an `is_admin: true` token for it, so "is signed in" is not
// a sufficient answer here the way it is for the read proxy.
//
// @module workos/file-access

/** Just enough of the world for the decision, so a test can supply both halves. */
export interface FileAccessDeps {
  /** Workspaces holding an attachment row that points at this exact url. */
  attachmentWorkspaces: (url: string) => Promise<string[]>;
  /** Whether the user is a member of that workspace, in any role. */
  isMember: (userId: string, workspaceId: string) => Promise<boolean>;
}

export type FileAccess = { ok: true } | { ok: false; status: number; error: string };

/**
 * Permits the delete only when the caller shares a workspace with the file.
 *
 * A url this app holds no attachment row for is reported as 404 rather than
 * 403, so the endpoint cannot be used to probe which files exist on the box.
 */
export async function canDeleteStoredFile(
  url: string,
  userId: string,
  deps: FileAccessDeps,
): Promise<FileAccess> {
  const workspaceIds = [...new Set(await deps.attachmentWorkspaces(url))];

  if (workspaceIds.length === 0) {
    return { ok: false, status: 404, error: "No attachment found for that url" };
  }

  for (const workspaceId of workspaceIds) {
    if (await deps.isMember(userId, workspaceId)) return { ok: true };
  }

  return { ok: false, status: 403, error: "Not a member of the workspace that owns that file" };
}
