import { describe, it, expect } from 'vitest';
import { fileKind, isImage, formatBytes, previewKind, languageLabel } from '@/lib/fileMeta';

describe('previewKind', () => {
  it('routes media to its native player/renderer', () => {
    expect(previewKind('image/png', 'a.png')).toBe('image');
    expect(previewKind('video/mp4', 'a.mp4')).toBe('video');
    expect(previewKind('audio/mpeg', 'a.mp3')).toBe('audio');
    expect(previewKind('application/pdf', 'a.pdf')).toBe('pdf');
  });

  it('treats source and plain-text formats as text', () => {
    for (const name of ['main.ts', 'script.py', 'notes.txt', 'README.md', 'data.csv', 'config.yaml', 'query.sql']) {
      expect(previewKind(null, name)).toBe('text');
    }
    expect(previewKind('text/plain', 'no-extension')).toBe('text');
  });

  it('prefers rendering SVG as an image even though it is also text', () => {
    expect(previewKind(null, 'logo.svg')).toBe('image');
  });

  it('falls back to the extension when the mime type is missing', () => {
    expect(previewKind(null, 'report.pdf')).toBe('pdf');
  });

  it('has no preview for office formats, which would require an external viewer', () => {
    for (const name of ['plan.docx', 'budget.xlsx', 'deck.pptx', 'old.doc']) {
      expect(previewKind(null, name)).toBe('none');
    }
  });

  it('has no preview for unknown binaries', () => {
    expect(previewKind(null, 'archive.zip')).toBe('none');
    expect(previewKind(null, 'mystery.xyz')).toBe('none');
  });
});

describe('languageLabel', () => {
  it('labels the code viewer by extension', () => {
    expect(languageLabel('main.tsx')).toBe('TSX');
    expect(languageLabel('run.sh')).toBe('SH');
  });

  it('falls back for a file with no extension', () => {
    expect(languageLabel('Makefile')).toBe('MAKEFILE');
    expect(languageLabel('')).toBe('TEXT');
  });
});

describe('fileKind', () => {
  it('prefers the MIME type when it is specific enough', () => {
    expect(fileKind('image/png', 'whatever.bin')).toBe('image');
    expect(fileKind('video/mp4', 'clip.bin')).toBe('video');
    expect(fileKind('audio/mpeg', 'song.bin')).toBe('audio');
    expect(fileKind('application/pdf', 'notes.bin')).toBe('pdf');
  });

  it('falls back to the extension when the MIME type is missing or generic', () => {
    expect(fileKind(null, 'report.pdf')).toBe('pdf');
    expect(fileKind('application/octet-stream', 'budget.xlsx')).toBe('sheet');
    expect(fileKind(undefined, 'main.tsx')).toBe('code');
    expect(fileKind('', 'bundle.tar')).toBe('archive');
  });

  it('is case-insensitive about extensions', () => {
    expect(fileKind(null, 'SCAN.PDF')).toBe('pdf');
    expect(fileKind(null, 'Photo.JPEG')).toBe('image');
  });

  it('returns the generic kind for anything unrecognized', () => {
    expect(fileKind(null, 'mystery.xyz')).toBe('file');
    expect(fileKind(null, 'no-extension')).toBe('file');
    expect(fileKind(null, '')).toBe('file');
  });
});

describe('isImage', () => {
  it('is true only for image kinds', () => {
    expect(isImage('image/webp', 'a.webp')).toBe(true);
    expect(isImage(null, 'a.svg')).toBe(true);
    expect(isImage('application/pdf', 'a.pdf')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats each unit at the expected precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('rounds bytes to whole numbers and larger units to one decimal', () => {
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
  });

  it('returns an empty string for unknown sizes so callers can omit the field', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(Number.NaN)).toBe('');
    expect(formatBytes(-1)).toBe('');
  });

  it('clamps at the largest known unit rather than producing nonsense', () => {
    expect(formatBytes(1024 ** 6)).toContain('TB');
  });
});
