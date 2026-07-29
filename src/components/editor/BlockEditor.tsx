import { useMemo } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import type { PartialBlock } from '@blocknote/core';
import { api } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { blocksToPlainText, emptyDocument } from '@/lib/blockContent';
import { getToken, decodeToken } from '@/lib/authToken';

interface Props {
  content: unknown;
  onChange: (blocks: unknown[], plainText: string) => void;
  editable?: boolean;
  /** Identifies where uploaded files/attachment rows belong. */
  workspaceId: string;
  entityType: string;
  entityId: string;
  className?: string;
}

export function BlockEditor({ content, onChange, editable = true, workspaceId, entityType, entityId, className }: Props) {
  const { theme } = useTheme();

  const initialContent = useMemo(() => {
    const blocks = content as PartialBlock[] | null | undefined;
    return blocks && Array.isArray(blocks) && blocks.length > 0 ? blocks : (emptyDocument() as PartialBlock[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only used for the editor's one-time init

  const editor = useCreateBlockNote({
    initialContent,
    uploadFile: async (file: File) => {
      // The storage function requires a single flat filename (no slashes) —
      // fold workspace/entity into the name itself for traceability instead
      // of a directory path; the `attachments` table is the real source of
      // truth for that structure.
      const safeOriginal = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${workspaceId}-${entityType}-${entityId}-${crypto.randomUUID()}-${safeOriginal}`;
      const url = await api.upload(file, { fileName });
      const token = getToken();
      const payload = token ? decodeToken(token) : null;
      if (payload) {
        api.insert('attachments', workspaceId, {
          entity_type: entityType,
          entity_id: entityId,
          url,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: payload.sub,
        }).catch(() => {});
      }
      return url;
    },
  });

  return (
    <div className={className}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
        onChange={() => onChange(editor.document, blocksToPlainText(editor.document))}
      />
    </div>
  );
}
