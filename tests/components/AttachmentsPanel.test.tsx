import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { attachments } from '@/lib/api';
import type { Attachment } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  attachments: {
    list: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
    reassign: vi.fn(),
  },
}));

const mocked = vi.mocked(attachments);

const scope = { workspaceId: 'ws1', entityType: 'project', entityId: 'p1' };

function attachment(over: Partial<Attachment> = {}): Attachment {
  return {
    id: 'a1',
    workspace_id: 'ws1',
    entity_type: 'project',
    entity_id: 'p1',
    url: 'https://mystorage.dileepadari.dev/images/workos/spec.pdf',
    file_name: 'spec.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    uploaded_by: 'user-1',
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.list.mockResolvedValue([]);
});

describe('AttachmentsPanel', () => {
  it('lists existing files with a human-readable size and a working link', async () => {
    mocked.list.mockResolvedValue([attachment()]);
    render(<AttachmentsPanel {...scope} />);

    const link = await screen.findByRole('link', { name: 'spec.pdf' });
    expect(link).toHaveAttribute('href', 'https://mystorage.dileepadari.dev/images/workos/spec.pdf');
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is attached yet', async () => {
    render(<AttachmentsPanel {...scope} />);
    expect(await screen.findByText('No files attached yet')).toBeInTheDocument();
  });

  it('uploads a chosen file against the entity, then refreshes the list', async () => {
    const file = new File(['data'], 'notes.txt', { type: 'text/plain' });
    mocked.upload.mockResolvedValue(attachment({ id: 'a2', file_name: 'notes.txt' }));
    render(<AttachmentsPanel {...scope} />);
    await screen.findByText('No files attached yet');

    mocked.list.mockResolvedValue([attachment({ id: 'a2', file_name: 'notes.txt' })]);
    // The input is intentionally hidden behind a styled button, so upload
    // directly to it rather than clicking through.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => expect(mocked.upload).toHaveBeenCalledWith(file, scope));
    expect(await screen.findByRole('link', { name: 'notes.txt' })).toBeInTheDocument();
  });

  it('renders nothing at all when read-only with no files, to stay out of comment threads', async () => {
    const { container } = render(<AttachmentsPanel {...scope} readOnly />);
    await waitFor(() => expect(mocked.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('offers no uploader or delete control when read-only', async () => {
    mocked.list.mockResolvedValue([attachment()]);
    render(<AttachmentsPanel {...scope} readOnly />);

    await screen.findByRole('link', { name: 'spec.pdf' });
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('reports the entity contents to the parent, so a composer knows files are staged', async () => {
    const onChange = vi.fn();
    mocked.list.mockResolvedValue([attachment()]);
    render(<AttachmentsPanel {...scope} onChange={onChange} />);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([attachment()]));
  });
});
