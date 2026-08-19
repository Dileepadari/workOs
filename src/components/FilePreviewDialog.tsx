// In-app viewer for attachments: photos, video, audio, PDFs and text/code.
//
// Media (<img>/<video>/<audio>/<iframe>) loads straight from the storage
// host - those aren't CORS-gated. Text and code can't be fetched directly
// (the storage host sends no CORS headers), so they come through the Edge
// Function's /file-text proxy instead.
//
// Office formats (.docx/.xlsx/.pptx) deliberately have no preview: rendering
// them in-browser would mean handing the file's URL to Google's or
// Microsoft's viewer, and these are private work documents on a private host.
// They get a download prompt instead.

import { useEffect, useState } from 'react';
import { files as filesApi, type Attachment } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { previewKind, languageLabel, formatBytes } from '@/lib/fileMeta';
import { Download, ExternalLink, Loader2, FileQuestion } from 'lucide-react';

interface Props {
  file: Attachment | null;
  onOpenChange: (open: boolean) => void;
}

function TextViewer({ file }: { file: Attachment }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    filesApi.text(file.url)
      .then((value) => { if (!cancelled) setText(value); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not read this file'); });
    return () => { cancelled = true; };
  }, [file.url]);

  if (error) return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
  if (text === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading...
      </p>
    );
  }

  const lines = text.split('\n');
  return (
    <div className="overflow-auto rounded-md border border-border bg-muted/30">
      {/* Line numbers in a separate, non-selectable column so copying the
          code doesn't drag the numbers along with it. */}
      <pre className="flex min-w-max text-xs leading-5">
        <code className="select-none border-r border-border px-2 py-3 text-right font-mono text-muted-foreground">
          {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </code>
        <code className="px-3 py-3 font-mono text-foreground">
          {lines.map((line, i) => <div key={i}>{line || ' '}</div>)}
        </code>
      </pre>
    </div>
  );
}

export function FilePreviewDialog({ file, onOpenChange }: Props) {
  const kind = file ? previewKind(file.mime_type, file.file_name) : 'none';
  const size = file ? formatBytes(file.size_bytes) : '';

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      {/* aria-describedby={undefined} tells Radix there is deliberately no
          description - the file itself is the content. Without it, it logs a
          missing-description warning. */}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl" aria-describedby={undefined}>
        {file && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-left text-base">
                <span className="break-all">{file.file_name}</span>
                {kind === 'text' && <Badge variant="secondary" className="text-xs">{languageLabel(file.file_name)}</Badge>}
                {size && <span className="text-xs font-normal text-muted-foreground">{size}</span>}
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-0">
              {kind === 'image' && (
                <img src={file.url} alt={file.file_name} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md object-contain" />
              )}

              {kind === 'video' && (
                <video src={file.url} controls className="mx-auto max-h-[70vh] w-full rounded-md" />
              )}

              {kind === 'audio' && (
                <audio src={file.url} controls className="w-full" />
              )}

              {kind === 'pdf' && (
                <iframe src={file.url} title={file.file_name} className="h-[70vh] w-full rounded-md border border-border" />
              )}

              {kind === 'text' && <TextViewer file={file} />}

              {kind === 'none' && (
                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-10 text-center">
                  <FileQuestion className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-foreground">No in-browser preview for this file type</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Office documents can only be previewed by sending the file to an external viewer, which
                    this app deliberately doesn't do. Download it to open in your own editor.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-border pt-3">
              <Button size="sm" asChild>
                <a href={file.url} download={file.file_name} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1.5 h-3.5 w-3.5" />Download
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={file.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open in new tab
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
