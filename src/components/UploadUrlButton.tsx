// "Upload a file instead of pasting a URL" - for forms whose main field is a
// link (resources, saved links). Uploads through the same Oracle storage
// proxy as AttachmentsPanel and hands the caller back the stored file, so the
// resulting row points at a real, permanent URL.

import { useRef, useState } from 'react';
import { attachments as attachmentsApi, type Attachment, type AttachmentScope } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload } from 'lucide-react';

interface Props extends AttachmentScope {
  onUploaded: (file: Attachment) => void;
  label?: string;
  className?: string;
}

export function UploadUrlButton({ workspaceId, entityType, entityId, onUploaded, label = 'Upload', className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      onUploaded(await attachmentsApi.upload(file, { workspaceId, entityType, entityId }));
      toast({ title: `Uploaded ${file.name}` });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} className={className} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
        {busy ? 'Uploading...' : label}
      </Button>
    </>
  );
}
