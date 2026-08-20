// Helpers for the BlockNote content_json/content_text columns (Stage 4).
// Kept dependency-light: rather than pulling in BlockNote's HTML/markdown
// importers just to migrate a handful of "<p>text</p>"-wrapped legacy
// strings, we hand-roll the trivial single-paragraph-block shape those
// need - it's the same shape the Stage 4 migration backfilled server-side.

export interface PlainTextBlock {
  type: 'paragraph';
  content: { type: 'text'; text: string; styles: Record<string, unknown> }[];
}

const EMPTY_DOCUMENT: PlainTextBlock[] = [{ type: 'paragraph', content: [] }];

/** Wraps a legacy plain-text/HTML string into a single-paragraph BlockNote
 *  document - same convention the Stage 4 migration used server-side. */
export function legacyTextToBlocks(text: string | null | undefined): PlainTextBlock[] {
  const stripped = (text ?? '').replace(/<[^>]*>/g, '');
  if (!stripped.trim()) return EMPTY_DOCUMENT;
  return [{ type: 'paragraph', content: [{ type: 'text', text: stripped, styles: {} }] }];
}

/** Extracts a plain-text mirror from any BlockNote document (recursively,
 *  since list items/headings/etc. can nest content), for search indexing
 *  and previews. */
/**
 * The plain-text mirror, used by search and by Cherry's context.
 *
 * Block boundaries become newlines rather than spaces. Joining everything with
 * a space ran every line of a pasted code block into one unreadable strip and
 * glued the end of one paragraph to the start of the next, which made search
 * hits land in the middle of nonsense.
 */
export function blocksToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  const lines: string[] = [];

  const inline = (nodes: unknown[]): string => {
    const parts: string[] = [];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const n = node as Record<string, unknown>;
      if (typeof n.text === 'string') parts.push(n.text);
      if (Array.isArray(n.content)) parts.push(inline(n.content as unknown[]));
    }
    return parts.join('');
  };

  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const n = node as Record<string, unknown>;
      if (Array.isArray(n.content)) {
        const text = inline(n.content as unknown[]);
        // A code block's own newlines are already in its text content, so it
        // is emitted whole rather than flattened per line.
        if (text) lines.push(text);
      } else if (typeof n.text === 'string' && n.text) {
        lines.push(n.text);
      }
      if (Array.isArray(n.children)) walk(n.children as unknown[]);
    }
  };

  walk(blocks);
  return lines.join('\n').trim();
}

export function emptyDocument(): PlainTextBlock[] {
  return EMPTY_DOCUMENT;
}
