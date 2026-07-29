// Helpers for the BlockNote content_json/content_text columns (Stage 4).
// Kept dependency-light: rather than pulling in BlockNote's HTML/markdown
// importers just to migrate a handful of "<p>text</p>"-wrapped legacy
// strings, we hand-roll the trivial single-paragraph-block shape those
// need — it's the same shape the Stage 4 migration backfilled server-side.

export interface PlainTextBlock {
  type: 'paragraph';
  content: { type: 'text'; text: string; styles: Record<string, unknown> }[];
}

const EMPTY_DOCUMENT: PlainTextBlock[] = [{ type: 'paragraph', content: [] }];

/** Wraps a legacy plain-text/HTML string into a single-paragraph BlockNote
 *  document — same convention the Stage 4 migration used server-side. */
export function legacyTextToBlocks(text: string | null | undefined): PlainTextBlock[] {
  const stripped = (text ?? '').replace(/<[^>]*>/g, '');
  if (!stripped.trim()) return EMPTY_DOCUMENT;
  return [{ type: 'paragraph', content: [{ type: 'text', text: stripped, styles: {} }] }];
}

/** Extracts a plain-text mirror from any BlockNote document (recursively,
 *  since list items/headings/etc. can nest content), for search indexing
 *  and previews. */
export function blocksToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const n = node as Record<string, unknown>;
      if (typeof n.text === 'string') parts.push(n.text);
      if (Array.isArray(n.content)) walk(n.content as unknown[]);
      if (Array.isArray(n.children)) walk(n.children as unknown[]);
    }
  };
  walk(blocks);
  return parts.join(' ').trim();
}

export function emptyDocument(): PlainTextBlock[] {
  return EMPTY_DOCUMENT;
}
