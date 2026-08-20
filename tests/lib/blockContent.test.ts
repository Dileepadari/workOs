import { describe, it, expect } from 'vitest';
import { legacyTextToBlocks, blocksToPlainText, emptyDocument } from '@/lib/blockContent';

describe('legacyTextToBlocks', () => {
  it('wraps plain text into a single paragraph block', () => {
    expect(legacyTextToBlocks('hello')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello', styles: {} }] },
    ]);
  });

  it('strips legacy HTML tags rather than embedding them as literal text', () => {
    const [block] = legacyTextToBlocks('<p>hi <b>there</b></p>');
    expect(block.content[0].text).toBe('hi there');
  });

  it('returns an empty document for nullish or whitespace-only input', () => {
    expect(legacyTextToBlocks(null)).toEqual(emptyDocument());
    expect(legacyTextToBlocks(undefined)).toEqual(emptyDocument());
    expect(legacyTextToBlocks('   ')).toEqual(emptyDocument());
    expect(legacyTextToBlocks('<p></p>')).toEqual(emptyDocument());
  });
});

describe('blocksToPlainText', () => {
  it('separates blocks with newlines, so paragraphs do not run together', () => {
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ];
    expect(blocksToPlainText(blocks)).toBe('one\ntwo');
  });

  it('walks nested content and children, since lists and headings nest', () => {
    const blocks = [{
      type: 'bulletListItem',
      content: [{ type: 'text', text: 'parent' }],
      children: [{ type: 'bulletListItem', content: [{ type: 'text', text: 'child' }] }],
    }];
    expect(blocksToPlainText(blocks)).toBe('parent\nchild');
  });

  it('keeps a code block on its own lines rather than flattening it', () => {
    // Space-joining used to turn every pasted snippet into one unreadable
    // strip, which made search hits land in the middle of nonsense and gave
    // Cherry a mangled version of the note to read.
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Run this:' }] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'const a = 1;\nconst b = 2;' }] },
    ];
    expect(blocksToPlainText(blocks)).toBe('Run this:\nconst a = 1;\nconst b = 2;');
  });

  it('keeps inline runs within one block together without a break', () => {
    const blocks = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'bold' }, { type: 'text', text: ' and normal' }],
    }];
    expect(blocksToPlainText(blocks)).toBe('bold and normal');
  });

  it('returns an empty string for anything that is not a block array', () => {
    expect(blocksToPlainText(null)).toBe('');
    expect(blocksToPlainText(undefined)).toBe('');
    expect(blocksToPlainText('not blocks')).toBe('');
    expect(blocksToPlainText({})).toBe('');
    expect(blocksToPlainText([])).toBe('');
  });

  it('ignores non-object nodes instead of throwing', () => {
    expect(blocksToPlainText([null, 'x', 42, { content: [{ text: 'kept' }] }])).toBe('kept');
  });
});

describe('round-trip', () => {
  it('recovers the original text through blocks and back', () => {
    expect(blocksToPlainText(legacyTextToBlocks('some note body'))).toBe('some note body');
  });
});
