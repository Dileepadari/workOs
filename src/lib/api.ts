// Single client for the `workos` Edge Function - every read/write in the
// app goes through this instead of calling supabase.from(...) directly,
// since there is no Supabase-issued session for Postgres RLS to key off of
// (see supabase/functions/workos/index.ts for why). Mirrors the shape of the
// sibling `portfolio` project's src/lib/adminApi.ts, extended for
// multi-user workspaces.

import { getToken, clearToken, decodeToken } from './authToken';
import type { CherryApplyResult, CherryProposal, CherryTurn, CherryUndoToken } from './cherry';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workos`;

async function call(path: string, init: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('Your session has expired. Please log in again.');
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
}

async function dataCall(
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete',
  table: string,
  workspaceId: string,
  extra: Record<string, unknown> = {},
) {
  const body = await call('/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, operation, workspace_id: workspaceId, ...extra }),
  });
  return body.data;
}

/** Current user id from the stored JWT, for tables that want an explicit
 *  actor column the /data gateway doesn't stamp (e.g. attachments.uploaded_by). */
function currentUserId(): string | null {
  const token = getToken();
  return token ? (decodeToken(token)?.sub ?? null) : null;
}

/**
 * Builds the flat filename the storage server requires: letters, digits,
 * '.', '_' and '-' only, no slashes. Storage has no folder/tenancy concept,
 * so workspace/entity are folded into the name itself for traceability -
 * the `attachments` table is the real source of truth for that structure.
 */
export function storageFileName(file: File, scope?: { workspaceId: string; entityType: string; entityId: string }): string {
  const safeOriginal = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = scope ? `${scope.workspaceId}-${scope.entityType}-${scope.entityId}-` : '';
  return `${prefix}${crypto.randomUUID()}-${safeOriginal}`;
}

export const auth = {
  signup: (username: string, password: string, display_name?: string, email?: string) =>
    call('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, display_name, email }),
    }),

  login: (username: string, password: string) =>
    call('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
};

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  role: 'owner' | 'admin' | 'member' | 'guest';
}

export interface WorkspaceSettings {
  workspace_id: string;
  theme_preset: string;
  custom_primary_hex: string | null;
  custom_accent_hex: string | null;
  logo_url: string | null;
  updated_at: string;
}

export const workspaces = {
  list: async (): Promise<Workspace[]> => (await call('/workspaces')).workspaces,

  create: async (name: string): Promise<Workspace> => (await call('/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })).workspace,

  rename: async (workspaceId: string, name: string): Promise<Workspace> => (await call(`/workspaces/${workspaceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })).workspace,

  members: async (workspaceId: string) => (await call(`/workspaces/${workspaceId}/members`)).members,

  settings: {
    get: async (workspaceId: string): Promise<WorkspaceSettings | null> => {
      const rows = await dataCall('select', 'workspace_settings', workspaceId);
      return (rows as WorkspaceSettings[])[0] ?? null;
    },
    update: (workspaceId: string, payload: Partial<WorkspaceSettings>) =>
      dataCall('update', 'workspace_settings', workspaceId, { id: workspaceId, payload, idColumn: 'workspace_id' }),
  },

  invites: {
    list: async (workspaceId: string) => (await call(`/workspaces/${workspaceId}/invites`)).invites,

    create: async (
      workspaceId: string,
      opts: { email: string; role: string; scoped_project_id?: string; scoped_project_role?: string },
    ) => (await call(`/workspaces/${workspaceId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    })).invite,
  },
};

export const invites = {
  accept: (token: string, body: { username?: string; password?: string; display_name?: string } = {}) =>
    call(`/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

export interface Comment {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  created_by: string;
  content_json: unknown;
  content_text: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reaction {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  emoji: string;
}

export interface Notification {
  id: string;
  type: 'mention' | 'assignment' | 'comment_reply' | 'invite';
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  project_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const comments = {
  list: async (workspaceId: string, entityType: string, entityId: string): Promise<Comment[]> =>
    (await call(`/comments?workspace_id=${workspaceId}&entity_type=${entityType}&entity_id=${entityId}`)).data,

  create: async (workspaceId: string, entityType: string, entityId: string, content_json: unknown, content_text: string, projectId?: string): Promise<Comment> =>
    (await call('/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, entity_type: entityType, entity_id: entityId, content_json, content_text, project_id: projectId }),
    })).data,

  update: async (commentId: string, payload: { content_json?: unknown; content_text?: string; is_pinned?: boolean }): Promise<Comment> =>
    (await call(`/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).data,

  remove: async (commentId: string): Promise<void> => {
    await call(`/comments/${commentId}`, { method: 'DELETE' });
  },
};

export const reactions = {
  list: async (workspaceId: string, entityType: string): Promise<Reaction[]> =>
    (await call(`/reactions?workspace_id=${workspaceId}&entity_type=${entityType}`)).data,

  toggle: async (workspaceId: string, entityType: string, entityId: string, emoji: string): Promise<{ reacted: boolean }> =>
    call('/reactions/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, entity_type: entityType, entity_id: entityId, emoji }),
    }),
};

export const notifications = {
  list: async (workspaceId: string): Promise<Notification[]> => (await call(`/notifications?workspace_id=${workspaceId}`)).data,

  markRead: async (notificationId: string): Promise<void> => {
    await call(`/notifications/${notificationId}/read`, { method: 'POST' });
  },

  markAllRead: async (workspaceId: string): Promise<void> => {
    await call('/notifications/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
  },
};

export const activity = {
  list: async (workspaceId: string, projectId?: string): Promise<ActivityEntry[]> =>
    (await call(`/activity?workspace_id=${workspaceId}${projectId ? `&project_id=${projectId}` : ''}`)).data,
};

export const api = {
  select: <T = unknown>(table: string, workspaceId: string, filters?: Record<string, unknown>): Promise<T[]> =>
    dataCall('select', table, workspaceId, { filters }),

  insert: <T = unknown>(table: string, workspaceId: string, payload: unknown): Promise<T> =>
    dataCall('insert', table, workspaceId, { payload }),

  update: <T = unknown>(
    table: string,
    workspaceId: string,
    id: string,
    payload: unknown,
    idColumn = 'id',
  ): Promise<T> => dataCall('update', table, workspaceId, { id, payload, idColumn }),

  upsert: <T = unknown>(table: string, workspaceId: string, payload: unknown, idColumn = 'id'): Promise<T> =>
    dataCall('upsert', table, workspaceId, { payload, idColumn }),

  remove: async (table: string, workspaceId: string, id: string, idColumn = 'id'): Promise<void> => {
    await dataCall('delete', table, workspaceId, { id, idColumn });
  },

  // The storage function requires a flat filename - letters/digits/./_/-
  // only, no slashes - so this always sanitizes rather than trusting the
  // caller's original file.name.
  upload: async (file: File, opts: { fileName?: string } = {}): Promise<string> => {
    const fileName = opts.fileName || storageFileName(file);
    const buffer = await file.arrayBuffer();
    const token = getToken();
    const res = await fetch(`${FUNCTIONS_BASE}/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-file-name': fileName,
        'x-file-type': file.type.startsWith('image/') ? 'images' : 'documents',
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });

    if (res.status === 401) {
      clearToken();
      throw new Error('Your session has expired. Please log in again.');
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
    return body.url as string;
  },
};

/**
 * A vault entry. Note there is no `value` field: list responses never carry
 * the secret itself - it's fetched one at a time via `secrets.reveal`, which
 * is the only route that decrypts.
 */
export interface Secret {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  category: string;
  username: string | null;
  url: string | null;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SecretInput {
  name: string;
  value?: string;
  description?: string | null;
  category?: string;
  username?: string | null;
  url?: string | null;
  tags?: string[];
}

export const secrets = {
  list: async (workspaceId: string): Promise<Secret[]> =>
    (await call(`/secrets?workspace_id=${workspaceId}`)).data,

  create: async (workspaceId: string, input: SecretInput & { value: string }): Promise<Secret> =>
    (await call('/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, ...input }),
    })).data,

  /** Omit `value` to edit the label/metadata without retyping the secret. */
  update: async (secretId: string, input: SecretInput): Promise<Secret> =>
    (await call(`/secrets/${secretId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })).data,

  remove: async (secretId: string): Promise<void> => {
    await call(`/secrets/${secretId}`, { method: 'DELETE' });
  },

  /** Decrypts server-side and returns the plaintext for this one entry. */
  reveal: async (secretId: string): Promise<string> =>
    (await call(`/secrets/${secretId}/reveal`, { method: 'POST' })).value,
};

export const files = {
  /**
   * Reads a stored file's contents as text, for the in-app code/text viewer.
   * Goes through the Edge Function because the storage host serves no CORS
   * headers, so the browser can't fetch() it directly.
   */
  text: async (url: string): Promise<string> =>
    (await call(`/file-text?url=${encodeURIComponent(url)}`)).text,

  /** Deletes the stored blob itself. Throws if storage refuses. */
  remove: async (url: string): Promise<void> => {
    await call(`/file?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
  },
};

export interface Attachment {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  url: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface AttachmentScope {
  workspaceId: string;
  entityType: string;
  entityId: string;
}

/**
 * Files attached to any entity (project, task, note, comment, meeting...).
 * The bytes go to Oracle storage via `api.upload`; this table is what scopes
 * them to a workspace/entity, since storage itself has no tenancy concept.
 */
export const attachments = {
  list: (scope: AttachmentScope): Promise<Attachment[]> =>
    api.select<Attachment>('attachments', scope.workspaceId, {
      entity_type: scope.entityType,
      entity_id: scope.entityId,
    }),

  /** Uploads the bytes, then records the metadata row. */
  upload: async (file: File, scope: AttachmentScope): Promise<Attachment> => {
    const url = await api.upload(file, { fileName: storageFileName(file, scope) });
    return api.insert<Attachment>('attachments', scope.workspaceId, {
      entity_type: scope.entityType,
      entity_id: scope.entityId,
      url,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: currentUserId(),
    });
  },

  /**
   * Removes an attachment completely - the stored file *and* its metadata row.
   *
   * Storage first, on purpose: if the blob delete fails, the row survives, so
   * the file is still listed and can be retried. Doing it the other way round
   * would leave a file nothing references and nothing can find again.
   */
  remove: async (workspaceId: string, file: Attachment): Promise<void> => {
    await files.remove(file.url);
    await api.remove('attachments', workspaceId, file.id);
  },

  /**
   * Re-points attachments from a client-side draft id onto the real row id.
   * Needed where the server mints the id (comments) - everywhere else the
   * draft uuid is inserted as the row's own id, so nothing to move.
   */
  reassign: async (scope: AttachmentScope, toEntityId: string): Promise<void> => {
    if (scope.entityId === toEntityId) return;
    const rows = await attachments.list(scope);
    await Promise.all(
      rows.map((row) => api.update('attachments', scope.workspaceId, row.id, { entity_id: toEntityId })),
    );
  },
};

// ------------------------------------------------------------------ Cherry --

/**
 * The assistant. `parse` proposes and never writes; `apply` writes only the
 * actions whose ids are passed in, so there is no way to accidentally confirm
 * everything. Answering a question re-posts to `parse` with the pending
 * proposal and no message, which the server merges without calling a model.
 */
export const cherry = {
  status: (): Promise<{ provider: string; model: string | null; reason: string }> =>
    call('/cherry/status'),

  test: (provider?: string): Promise<{ ok: boolean; provider: string; model?: string; error?: string }> =>
    call('/cherry/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    }),

  parse: (input: {
    workspace_id: string;
    message?: string;
    history?: CherryTurn[];
    pending_proposal?: CherryProposal | null;
    answers?: Record<string, unknown>;
    resolutions?: Record<string, string>;
    skips?: string[];
    scope?: { project_id?: string | null };
  }): Promise<{ proposal: CherryProposal; provider: string; degraded_from: string | null; provider_error: string | null }> =>
    call('/cherry/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),

  apply: (input: {
    workspace_id: string;
    proposal: CherryProposal;
    confirmed_action_ids: string[];
    typed_confirmations?: Record<string, string>;
  }): Promise<CherryApplyResult> =>
    call('/cherry/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),

  undo: (workspaceId: string, undo: CherryUndoToken): Promise<{ reverted: number; failed: string[] }> =>
    call('/cherry/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, undo }),
    }),
};

// ------------------------------------------------------------- preferences --

export interface Preferences {
  theme: string | null;
  font: string | null;
  focus_minutes: number | null;
  break_minutes: number | null;
  focus_sound: boolean | null;
  notify_mentions: boolean | null;
  notify_assignments: boolean | null;
  onboarding_done: boolean | null;
  cherry_provider: string | null;
  cherry_avatar: string | null;
  cherry_voice: boolean | null;
  /** The keys themselves are never sent to the browser - only whether they
   *  exist and their last four characters. */
  has_anthropic_key: boolean;
  has_gemini_key: boolean;
  anthropic_key_hint: string | null;
  gemini_key_hint: string | null;
}

/** Everything personal, stored per user rather than per browser. */
export const preferences = {
  get: (): Promise<{ preferences: Preferences }> => call('/preferences'),

  /** Pass `anthropic_key`/`gemini_key` to set one, or an empty string to clear
   *  it. They travel once, on the way to being encrypted at rest. */
  update: (patch: Partial<Preferences> & { anthropic_key?: string; gemini_key?: string }):
    Promise<{ preferences: Preferences }> =>
    call('/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
};
