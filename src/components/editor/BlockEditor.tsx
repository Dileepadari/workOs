import { useMemo } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import type { PartialBlock } from '@blocknote/core';
import { attachments } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { blocksToPlainText, emptyDocument } from '@/lib/blockContent';

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
    // Files dropped/pasted into the editor land in the same `attachments`
    // table as ones added through the Files panel, so both show up in one
    // place per entity.
    uploadFile: async (file: File) => (await attachments.upload(file, { workspaceId, entityType, entityId })).url,
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
