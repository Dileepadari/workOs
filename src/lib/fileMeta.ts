// Presentation helpers for uploaded files. Kept out of the component so the
// size/type formatting rules are unit-testable on their own.

export type FileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'archive' | 'code' | 'video' | 'audio' | 'file';

const EXTENSION_KINDS: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', avif: 'image', bmp: 'image',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', txt: 'doc', md: 'doc',
  xls: 'sheet', xlsx: 'sheet', ods: 'sheet', csv: 'sheet',
  zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive',
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', go: 'code', rs: 'code', java: 'code', json: 'code', sql: 'code', sh: 'code',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio',
};

/** Classifies a file for iconography, preferring the MIME type and falling
 *  back to the extension (storage doesn't always give us a useful type). */
export function fileKind(mimeType: string | null | undefined, fileName = ''): FileKind {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';

  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  return EXTENSION_KINDS[extension] ?? 'file';
}

export function isImage(mimeType: string | null | undefined, fileName = ''): boolean {
  return fileKind(mimeType, fileName) === 'image';
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable size. Returns '' for unknown sizes so callers can omit the
 *  field entirely rather than rendering a misleading "0 B". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  // Whole numbers for bytes, one decimal above that - "1.4 MB" not "1.44 MB".
  const rounded = exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[exponent]}`;
}
