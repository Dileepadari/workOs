// Single client for the `workos` Edge Function — every read/write in the
// app goes through this instead of calling supabase.from(...) directly,
// since there is no Supabase-issued session for Postgres RLS to key off of
// (see supabase/functions/workos/index.ts for why). Mirrors the shape of the
// sibling `portfolio` project's src/lib/adminApi.ts, extended for
// multi-user workspaces.

import { getToken, clearToken } from './authToken';

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

  // The storage function requires a flat filename — letters/digits/./_/-
  // only, no slashes — so this always sanitizes rather than trusting the
  // caller's original file.name.
  upload: async (file: File, opts: { fileName?: string } = {}): Promise<string> => {
    const safeOriginal = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = opts.fileName || `${crypto.randomUUID()}-${safeOriginal}`;
    const buffer = await file.arrayBuffer();
    const token = getToken();
    const res = await fetch(`${FUNCTIONS_BASE}/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-file-name': fileName,
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
