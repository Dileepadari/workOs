import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, FileText, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { legacyTextToBlocks } from '@/lib/blockContent';
import { preventAccidentalDialogClose } from '@/lib/utils';
import { CardGridSkeleton } from '@/components/skeletons/primitives';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';

interface Note {
  id: string;
  title: string;
  content: string | null;
  content_json: unknown;
  content_text: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function Notes() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  // Read-only view - the card clamps the preview to 4 lines, and the edit
  // dialog used to be the only way to read the rest.
  const [viewing, setViewing] = useState<Note | null>(null);
  const [draftId, setDraftId] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; noteId: string | null }>({ open: false, noteId: null });
  const [title, setTitle] = useState('');
  const [pendingContent, setPendingContent] = useState<{ blocks: unknown[]; text: string } | null>(null);

  const wsId = currentWorkspace?.id;

  const fetchNotes = async () => {
    if (!wsId) return;
    const data = await api.select<Note>('notes', wsId);
    setNotes([...data].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)));
    setLoading(false);
  };

  useEffect(() => { if (user && wsId) fetchNotes(); }, [user, wsId]);

  const openNewNote = () => {
    setEditing(null);
    setTitle('');
    setDraftId(crypto.randomUUID());
    setPendingContent(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId) return;
    const content_json = pendingContent?.blocks ?? (editing?.content_json ?? legacyTextToBlocks(editing?.content));
    const content_text = pendingContent?.text ?? editing?.content_text ?? '';
    if (editing) {
      await api.update('notes', wsId, editing.id, { title, content_json, content_text });
    } else {
      await api.insert('notes', wsId, { id: draftId, title, content_json, content_text });
    }
    setDialogOpen(false);
    fetchNotes();
  };

  const handleEdit = (n: Note) => {
    setEditing(n);
    setTitle(n.title);
    setDraftId(n.id);
    setPendingContent(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => setDeleteConfirm({ open: true, noteId: id });

  const confirmDelete = async () => {
    if (!deleteConfirm.noteId || !wsId) return;
    await api.remove('notes', wsId, deleteConfirm.noteId);
    setDeleteConfirm({ open: false, noteId: null });
    fetchNotes();
  };

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-6">
      <PageHeader title="Notes" />

      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditing(null); setPendingContent(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNewNote}><Plus className="mr-2 h-4 w-4" />New Note</Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" {...preventAccidentalDialogClose}>
            <DialogHeader><DialogTitle>{editing ? 'Edit Note' : 'New Note'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Content</Label>
                {wsId && draftId && (
                  <BlockEditor
                    key={draftId}
                    content={editing?.content_json ?? legacyTextToBlocks(editing?.content)}
                    onChange={(blocks, text) => setPendingContent({ blocks, text })}
                    workspaceId={wsId}
                    entityType="notes"
                    entityId={draftId}
                    className="min-h-[240px] rounded-md border border-border"
                  />
                )}
              </div>
              {wsId && draftId && (
                <AttachmentsPanel workspaceId={wsId} entityType="notes" entityId={draftId} label="Files" compact />
              )}
              <Button type="submit" className="w-full">{editing ? 'Save' : 'Create Note'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <CardGridSkeleton count={8} />
      ) : notes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-2 text-sm text-muted-foreground">No notes yet</p>
            <Button variant="outline" size="sm" onClick={openNewNote}>
              <Plus className="mr-2 h-4 w-4" />Create your first note
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((n, index) => (
            <Card key={n.id} className="group flex flex-col transition-colors hover:bg-muted/50 animate-scale-in hover-lift" style={{ animationDelay: `${Math.min(index * 30, 480)}ms` }}>
              <CardContent className="flex flex-1 flex-col p-4 sm:p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10">
                      <FileText className="h-3.5 w-3.5 text-accent" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewing(n)}
                      className="line-clamp-2 flex-1 text-left text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {n.title}
                    </button>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button variant="ghost" size="sm" className="h-7 w-7" aria-label="View note" onClick={() => setViewing(n)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7" onClick={() => handleEdit(n)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(n.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                {(n.content_text || n.content) && (
                  <button
                    type="button"
                    onClick={() => setViewing(n)}
                    title="Read full note"
                    className="mb-3 flex-1 line-clamp-4 whitespace-pre-wrap text-left text-xs text-muted-foreground hover:text-foreground"
                  >
                    {n.content_text || n.content}
                  </button>
                )}
                <p className="text-xs text-muted-foreground">Updated {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Full note, rendered rather than clamped - read without entering edit mode. */}
      <Dialog open={viewing !== null} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-left">{viewing.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-[11px] text-muted-foreground">
                  Updated {formatDistanceToNow(new Date(viewing.updated_at), { addSuffix: true })}
                </p>
                {wsId && (
                  <BlockEditor
                    key={`view-${viewing.id}`}
                    content={viewing.content_json ?? legacyTextToBlocks(viewing.content)}
                    onChange={() => {}}
                    editable={false}
                    workspaceId={wsId}
                    entityType="notes"
                    entityId={viewing.id}
                  />
                )}
                {wsId && (
                  <AttachmentsPanel workspaceId={wsId} entityType="notes" entityId={viewing.id} label="Files" readOnly />
                )}
                <div className="flex gap-2 border-t border-border pt-3">
                  <Button size="sm" onClick={() => { const note = viewing; setViewing(null); handleEdit(note); }}>
                    <Edit2 className="mr-1 h-3 w-3" />Edit
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete note?"
        description="This action cannot be undone. The note will be permanently deleted."
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
