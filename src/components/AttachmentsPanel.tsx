// Reusable file attachment UI: drop/browse to upload, list what's already
// attached, open or remove. Used anywhere an entity can carry files -
// projects, tasks, notes, meetings, comments, resources.
//
// Bytes go to Oracle storage through the Edge Function's /upload proxy; the
// `attachments` table (see src/lib/api.ts) is what scopes them to an entity.

import { useCallback, useEffect, useRef, useState } from 'react';
import { attachments as attachmentsApi, type Attachment, type AttachmentScope } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FilePreviewDialog } from '@/components/FilePreviewDialog';
import { useToast } from '@/hooks/use-toast';
import { formatBytes, fileKind, isImage } from '@/lib/fileMeta';
import { cn } from '@/lib/utils';
import {
  Paperclip, Upload, Trash2, Download, Loader2,
  FileText, FileImage, FileSpreadsheet, FileArchive, FileCode, FileVideo, FileAudio, File as FileIcon,
} from 'lucide-react';

const KIND_ICONS = {
  image: FileImage,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  archive: FileArchive,
  code: FileCode,
  video: FileVideo,
  audio: FileAudio,
  file: FileIcon,
} as const;

interface Props extends AttachmentScope {
  /** Heading above the list. Pass null to render just the control + list. */
  label?: string | null;
  /** Tighter spacing + smaller dropzone, for use inside dialogs. */
  compact?: boolean;
  /** Hides the uploader, leaving a read-only list (e.g. a posted comment). */
  readOnly?: boolean;
  className?: string;
  /** Fired after any upload/delete so parents can refresh their own counts. */
  onChange?: (files: Attachment[]) => void;
}

export function AttachmentsPanel({
  workspaceId, entityType, entityId,
  label = 'Attachments', compact = false, readOnly = false, className, onChange,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);

  const scope: AttachmentScope = { workspaceId, entityType, entityId };

  const load = useCallback(async () => {
    if (!workspaceId || !entityId) return;
    try {
      const rows = await attachmentsApi.list({ workspaceId, entityType, entityId });
      const sorted = [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      setFiles(sorted);
      onChange?.(sorted);
    } finally {
      setLoading(false);
    }
    // onChange is intentionally excluded - parents commonly pass an inline
    // arrow, which would otherwise re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const uploadFiles = async (selected: FileList | File[]) => {
    const list = Array.from(selected);
    if (list.length === 0) return;

    setUploading((n) => n + list.length);
    // Settled, not all-or-nothing: one rejected file shouldn't discard the
    // ones that did upload.
    const results = await Promise.allSettled(list.map((file) => attachmentsApi.upload(file, scope)));
    setUploading((n) => Math.max(0, n - list.length));

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      const reason = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      toast({
        title: `${failed} of ${list.length} file${list.length === 1 ? '' : 's'} failed to upload`,
        description: reason?.reason instanceof Error ? reason.reason.message : undefined,
        variant: 'destructive',
      });
    } else {
      toast({ title: `Uploaded ${list.length} file${list.length === 1 ? '' : 's'}` });
    }
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await attachmentsApi.remove(workspaceId, deleteTarget);
      toast({ title: 'Attachment deleted' });
    } catch (error) {
      // The row is left in place when storage refuses, so the file stays
      // visible and the delete can be retried rather than silently orphaned.
      toast({
        title: 'Could not delete this file',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setDeleteTarget(null);
      load();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (readOnly) return;
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const busy = uploading > 0;

  // A read-only panel with nothing to show adds no information - stay out of
  // the layout entirely rather than rendering an empty/loading placeholder
  // under every comment in a thread.
  if (readOnly && files.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            {label}
            {files.length > 0 && <span className="text-xs font-normal text-muted-foreground">({files.length})</span>}
          </p>
        </div>
      )}

      {!readOnly && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed text-center transition-colors',
            compact ? 'px-3 py-3' : 'px-4 py-6',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = ''; // let the same file be picked again
            }}
          />
          {busy ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading {uploading} file{uploading === 1 ? '' : 's'}...
            </p>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => inputRef.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />Choose files
              </Button>
              {!compact && <p className="text-[10px] text-muted-foreground">or drag and drop them here</p>}
            </>
          )}
        </div>
      )}

      {loading ? (
        !readOnly && <p className="text-xs text-muted-foreground">Loading attachments...</p>
      ) : files.length === 0 ? (
        !readOnly && <p className="text-xs text-muted-foreground">No files attached yet</p>
      ) : (
        <ul className="space-y-1">
          {files.map((file) => {
            const Icon = KIND_ICONS[fileKind(file.mime_type, file.file_name)];
            const size = formatBytes(file.size_bytes);
            return (
              <li key={file.id} className="group flex items-center gap-2 rounded-md border border-border px-2 py-1.5 transition-colors hover:bg-muted/40">
                <button
                  type="button"
                  onClick={() => setPreviewing(file)}
                  className="shrink-0"
                  aria-label={`Preview ${file.file_name}`}
                >
                  {isImage(file.mime_type, file.file_name) ? (
                    <img src={file.url} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setPreviewing(file)}
                    className="block w-full truncate text-left text-xs font-medium text-foreground hover:text-primary hover:underline"
                    title={`Preview ${file.file_name}`}
                  >
                    {file.file_name}
                  </button>
                  {size && <p className="text-[10px] text-muted-foreground">{size}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" asChild>
                    <a href={file.url} download={file.file_name} target="_blank" rel="noopener noreferrer" aria-label={`Download ${file.file_name}`}>
                      <Download className="h-3 w-3" />
                    </a>
                  </Button>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      aria-label={`Remove ${file.file_name}`}
                      onClick={() => setDeleteTarget(file)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <FilePreviewDialog file={previewing} onOpenChange={(open) => { if (!open) setPreviewing(null); }} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete attachment"
        description={`Permanently delete "${deleteTarget?.file_name}"? The file is removed from storage as well, so anything embedding it (an image pasted into a note, for example) will break. This cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
