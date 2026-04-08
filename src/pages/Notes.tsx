import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Note {
  id: string;
  title: string;
  content: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function Notes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; noteId: string | null }>({ open: false, noteId: null });
  const [form, setForm] = useState({ title: '', content: '' });

  const fetchNotes = async () => {
    const { data } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchNotes(); }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await supabase.from('notes').update({ title: form.title, content: form.content }).eq('id', editing.id);
    } else {
      await supabase.from('notes').insert({ title: form.title, content: form.content, user_id: user!.id });
    }
    setDialogOpen(false);
    setForm({ title: '', content: '' });
    setEditing(null);
    fetchNotes();
  };

  const handleEdit = (n: Note) => {
    setEditing(n);
    setForm({ title: n.title, content: n.content ?? '' });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ open: true, noteId: id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.noteId) return;
    await supabase.from('notes').delete().eq('id', deleteConfirm.noteId);
    setDeleteConfirm({ open: false, noteId: null });
    fetchNotes();
  };

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-6">
      <PageHeader title="Notes" />

      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{notes.length} notes</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setForm({ title: '', content: '' }); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />New Note</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editing ? 'Edit Note' : 'New Note'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Content</Label>
                <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={8} className="text-sm resize-none" />
              </div>
              <Button type="submit" className="w-full">{editing ? 'Save' : 'Create Note'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : notes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-2 text-sm text-muted-foreground">No notes yet</p>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Create your first note
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <Card key={n.id} className="group transition-colors hover:bg-muted/50 flex flex-col">
              <CardContent className="p-4 sm:p-6 flex flex-col flex-1">
                <div className="mb-3 flex items-start justify-between">
                  <h3 className="font-semibold text-foreground text-base flex-1 line-clamp-2">{n.title}</h3>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => handleEdit(n)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(n.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {n.content && <p className="mb-4 text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap flex-1">{n.content}</p>}
                <p className="text-xs text-muted-foreground">{format(new Date(n.updated_at), 'MMM d, yyyy')}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
