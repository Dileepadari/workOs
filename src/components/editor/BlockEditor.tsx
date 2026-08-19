import { useMemo } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import type { PartialBlock } from '@blocknote/core';
import { attachments } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { blocksToPlainText, emptyDocument } from '@/lib/blockContent';
import { cn } from '@/lib/utils';

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

  /**
   * Paste handling for the things people actually paste into a work tool:
   * READMEs, terminal output and source.
   *
   * Without this a pasted README arrives as one flat paragraph of hashes and
   * asterisks, and a pasted function loses its indentation - both of which
   * make the editor feel like it is fighting you. Plain text is inspected
   * first: if it looks like markdown it is parsed into real blocks, and if it
   * looks like source it becomes a code block with its whitespace intact.
   */
  const handlePaste = async (event: React.ClipboardEvent) => {
    if (!editable) return;
    const clip = event.clipboardData;
    // Anything with real HTML or files on the clipboard is BlockNote's job -
    // it handles rich paste well, and hijacking it would be a downgrade.
    if (clip.types.includes('text/html') || clip.files.length) return;

    const text = clip.getData('text/plain');
    if (!text || text.length < 12) return;

    if (looksLikeMarkdown(text)) {
      event.preventDefault();
      const blocks = await editor.tryParseMarkdownToBlocks(text);
      editor.replaceBlocks(editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block], blocks);
      onChange(editor.document, blocksToPlainText(editor.document));
      return;
    }

    if (looksLikeCode(text)) {
      event.preventDefault();
      const current = editor.getTextCursorPosition().block;
      editor.replaceBlocks([current], [{
        type: 'codeBlock',
        props: { language: guessLanguage(text) },
        content: [{ type: 'text', text, styles: {} }],
      } as PartialBlock]);
      onChange(editor.document, blocksToPlainText(editor.document));
    }
  };

  return (
    // bn-fill makes the editor stretch to whatever height the caller's
    // className asks for (min-h-[240px] etc). Without it BlockNote sizes
    // itself to its content - one line pinned to the top of a tall box, with
    // the rest of the box dead space that doesn't focus the editor on click.
    <div className={cn('bn-fill', className)} onPaste={handlePaste}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
        onChange={() => onChange(editor.document, blocksToPlainText(editor.document))}
      />
    </div>
  );
}

// --------------------------------------------------------------- sniffing --

/** Markdown that is unambiguous enough to be worth converting. A stray "#" or
 *  a hyphen in prose must not turn someone's sentence into a heading. */
function looksLikeMarkdown(text: string): boolean {
  const signals = [
    /^#{1,6}\s+\S/m,        // ATX heading
    /^```/m,                 // fenced code
    /^\s*[-*+]\s+\S/m,      // bullet list
    /^\s*\d+\.\s+\S/m,     // ordered list
    /^\s*>\s+\S/m,          // blockquote
    /\[[^\]]+\]\([^)]+\)/,  // link
    /^\|.+\|$/m,            // table row
  ];
  const hits = signals.filter((re) => re.test(text)).length;
  // Two independent signals, or a fence on its own, which is never accidental.
  return hits >= 2 || /^```/m.test(text);
}

/** Source, roughly. Indentation plus punctuation density is the giveaway;
 *  prose has neither. */
function looksLikeCode(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length < 2) return false;
  const indented = lines.filter((l) => /^(\s{2,}|\t)/.test(l)).length;
  const codey = lines.filter((l) => /[{};=()<>]|^\s*(const|let|var|def|class|function|import|export|if|for|while|return|SELECT|INSERT)\b/.test(l)).length;
  return indented / lines.length > 0.25 || codey / lines.length > 0.5;
}

function guessLanguage(text: string): string {
  if (/^\s*(import|export)\s|=>|const\s|interface\s|:\s*(string|number|boolean)\b/m.test(text)) {
    return /\b(interface|type\s+\w+\s*=|:\s*(string|number|boolean))\b/.test(text) ? 'typescript' : 'javascript';
  }
  if (/^\s*(def|class)\s|\bself\b|^\s*from\s+\w+\s+import/m.test(text)) return 'python';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/im.test(text)) return 'sql';
  if (/^\s*[$#]\s|\b(sudo|npm|git|cd|ls|echo)\b/m.test(text)) return 'bash';
  if (/^\s*[{[]/.test(text.trim()) && /"[^"]+"\s*:/.test(text)) return 'json';
  if (/^\s*</.test(text.trim())) return 'html';
  return 'text';
}
