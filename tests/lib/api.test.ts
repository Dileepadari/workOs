import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storageFileName, api, attachments, secrets } from '@/lib/api';
import { setToken, getToken } from '@/lib/authToken';

/** A token that decodes to { sub: 'user-1' } and is far from expiring. */
function makeToken(sub = 'user-1'): string {
  const payload = { sub, username: 'tester', iat: 0, exp: Math.floor(Date.now() / 1000) + 3600 };
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${encode(payload)}.signature`;
}

/** Queues JSON responses in call order and records every request made. */
function mockFetch(responses: Array<{ ok?: boolean; status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const next = responses[Math.min(index++, responses.length - 1)];
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.body,
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  setToken(makeToken());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('storageFileName', () => {
  it('replaces every character the storage server rejects', () => {
    const file = new File(['x'], 'my report (final) #2.pdf');
    const name = storageFileName(file);
    expect(name).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(name).toContain('my_report__final___2.pdf');
  });

  it('keeps names unique so two uploads of the same file do not collide', () => {
    const file = new File(['x'], 'notes.txt');
    expect(storageFileName(file)).not.toBe(storageFileName(file));
  });

  it('folds the scope into the flat name, since storage has no folders', () => {
    const file = new File(['x'], 'spec.pdf');
    const name = storageFileName(file, { workspaceId: 'ws1', entityType: 'project', entityId: 'p1' });
    expect(name.startsWith('ws1-project-p1-')).toBe(true);
    expect(name).toMatch(/^[a-zA-Z0-9._-]+$/);
  });
});

describe('api.upload', () => {
  it('sends the file name and routes images and documents by type', async () => {
    const calls = mockFetch([{ body: { url: 'https://mystorage.dileepadari.dev/images/workos/a.png' } }]);
    await api.upload(new File(['x'], 'a.png', { type: 'image/png' }));
    expect((calls[0].init.headers as Record<string, string>)['x-file-type']).toBe('images');

    const docCalls = mockFetch([{ body: { url: 'https://mystorage.dileepadari.dev/images/workos/a.pdf' } }]);
    await api.upload(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect((docCalls[0].init.headers as Record<string, string>)['x-file-type']).toBe('documents');
  });

  it('returns the URL the server decided on, not one built client-side', async () => {
    mockFetch([{ body: { url: 'https://mystorage.dileepadari.dev/images/workos/x.png' } }]);
    await expect(api.upload(new File(['x'], 'x.png'))).resolves.toBe(
      'https://mystorage.dileepadari.dev/images/workos/x.png',
    );
  });

  it('surfaces the server error message on failure', async () => {
    mockFetch([{ ok: false, status: 502, body: { error: 'Upload to storage failed' } }]);
    await expect(api.upload(new File(['x'], 'x.png'))).rejects.toThrow('Upload to storage failed');
  });

  it('clears the stored token when the session has expired', async () => {
    mockFetch([{ ok: false, status: 401, body: {} }]);
    await expect(api.upload(new File(['x'], 'x.png'))).rejects.toThrow(/session has expired/i);
    expect(getToken()).toBeNull();
  });
});

describe('attachments.upload', () => {
  it('uploads the bytes, then records metadata against the entity', async () => {
    const calls = mockFetch([
      { body: { url: 'https://mystorage.dileepadari.dev/images/workos/spec.pdf' } },
      { body: { data: { id: 'att-1' } } },
    ]);

    await attachments.upload(new File(['abc'], 'spec.pdf', { type: 'application/pdf' }), {
      workspaceId: 'ws1', entityType: 'project', entityId: 'p1',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toMatch(/\/upload$/);

    const insert = JSON.parse(calls[1].init.body as string);
    expect(insert).toMatchObject({
      table: 'attachments',
      operation: 'insert',
      workspace_id: 'ws1',
      payload: {
        entity_type: 'project',
        entity_id: 'p1',
        url: 'https://mystorage.dileepadari.dev/images/workos/spec.pdf',
        file_name: 'spec.pdf',
        mime_type: 'application/pdf',
        uploaded_by: 'user-1',
      },
    });
  });
});

describe('attachments.remove', () => {
  const file = {
    id: 'att-1',
    url: 'https://mystorage.dileepadari.dev/images/workos/spec.pdf',
  } as Parameters<typeof attachments.remove>[1];

  it('deletes the stored blob first, then the metadata row', async () => {
    const calls = mockFetch([{ body: { success: true } }, { body: { success: true } }]);

    await attachments.remove('ws1', file);

    expect(calls).toHaveLength(2);
    // Storage first...
    expect(calls[0].url).toContain('/file?url=');
    expect(calls[0].url).toContain(encodeURIComponent(file.url));
    expect(calls[0].init.method).toBe('DELETE');
    // ...row second.
    const rowDelete = JSON.parse(calls[1].init.body as string);
    expect(rowDelete).toMatchObject({ table: 'attachments', operation: 'delete', id: 'att-1' });
  });

  it('keeps the metadata row when storage refuses, so the file stays retryable', async () => {
    const calls = mockFetch([{ ok: false, status: 502, body: { error: 'Storage delete failed (404)' } }]);

    await expect(attachments.remove('ws1', file)).rejects.toThrow('Storage delete failed');
    // The row delete must not have been attempted.
    expect(calls).toHaveLength(1);
  });
});

describe('attachments.reassign', () => {
  it('is a no-op when the draft id already matches the real id', async () => {
    const calls = mockFetch([{ body: { data: [] } }]);
    await attachments.reassign({ workspaceId: 'ws1', entityType: 'comment', entityId: 'same' }, 'same');
    expect(calls).toHaveLength(0);
  });

  it('re-points every staged file onto the real entity id', async () => {
    const calls = mockFetch([
      { body: { data: [{ id: 'a1' }, { id: 'a2' }] } },
      { body: { data: {} } },
      { body: { data: {} } },
    ]);

    await attachments.reassign({ workspaceId: 'ws1', entityType: 'comment', entityId: 'draft' }, 'comment-9');

    const updates = calls.slice(1).map((c) => JSON.parse(c.init.body as string));
    expect(updates).toHaveLength(2);
    for (const update of updates) {
      expect(update.operation).toBe('update');
      expect(update.payload).toEqual({ entity_id: 'comment-9' });
    }
    expect(updates.map((u) => u.id).sort()).toEqual(['a1', 'a2']);
  });
});

describe('secrets', () => {
  it('lists without ever asking for the value', async () => {
    const calls = mockFetch([{ body: { data: [] } }]);
    await secrets.list('ws1');
    expect(calls[0].url).toContain('/secrets?workspace_id=ws1');
    expect(calls[0].init.method ?? 'GET').toBe('GET');
  });

  it('sends the plaintext value only on create, for the server to encrypt', async () => {
    const calls = mockFetch([{ body: { data: { id: 's1' } } }]);
    await secrets.create('ws1', { name: 'Stripe', value: 'sk_live_123' });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ workspace_id: 'ws1', name: 'Stripe', value: 'sk_live_123' });
  });

  it('omits the value on update so metadata edits keep the stored secret', async () => {
    const calls = mockFetch([{ body: { data: { id: 's1' } } }]);
    await secrets.update('s1', { name: 'Renamed' });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({ name: 'Renamed' });
    expect('value' in body).toBe(false);
  });

  it('reveals through a dedicated POST that returns the decrypted value', async () => {
    const calls = mockFetch([{ body: { value: 'sk_live_123' } }]);
    await expect(secrets.reveal('s1')).resolves.toBe('sk_live_123');
    expect(calls[0].url).toContain('/secrets/s1/reveal');
    expect(calls[0].init.method).toBe('POST');
  });

  it('propagates an authorization failure rather than silently returning nothing', async () => {
    mockFetch([{ ok: false, status: 403, body: { error: 'Guests cannot access the secrets vault' } }]);
    await expect(secrets.list('ws1')).rejects.toThrow('Guests cannot access the secrets vault');
  });
});
