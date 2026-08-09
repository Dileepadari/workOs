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
  it('joins the text of a flat document', () => {
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ];
    expect(blocksToPlainText(blocks)).toBe('one two');
  });

  it('walks nested content and children, since lists and headings nest', () => {
    const blocks = [{
      type: 'bulletListItem',
      content: [{ type: 'text', text: 'parent' }],
      children: [{ type: 'bulletListItem', content: [{ type: 'text', text: 'child' }] }],
    }];
    expect(blocksToPlainText(blocks)).toBe('parent child');
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
