import { useState, useEffect } from 'react';
import { Plus, CheckSquare, FileText, Link2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { preventAccidentalDialogClose } from '@/lib/utils';

type CaptureType = 'task' | 'note' | 'link' | 'log';

export function QuickCapture() {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [type, setType] = useState<CaptureType>('task');
  const [value, setValue] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        setMenuOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || !currentWorkspace) return;
    const wsId = currentWorkspace.id;

    try {
      if (type === 'task') {
        await api.insert('tasks', wsId, { title: value, status: 'todo', priority: 'medium' });
      } else if (type === 'note') {
        await api.insert('notes', wsId, { title: value });
      } else if (type === 'link') {
        await api.insert('links', wsId, { title: value, url: url || value });
      } else if (type === 'log') {
        const today = new Date().toISOString().split('T')[0];
        const existingRows = await api.select<{ id: string; wins: string[] }>('daily_log', wsId, { date: today });
        const existing = existingRows[0];
        if (existing) {
          await api.update('daily_log', wsId, existing.id, { wins: [...(existing.wins || []), value] });
        } else {
          await api.insert('daily_log', wsId, { date: today, wins: [value] });
        }
      }
      toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} added!` });
      setValue('');
      setUrl('');
      setOpen(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    }
  };

  const items = [
    { type: 'task' as CaptureType, icon: CheckSquare, label: 'New Task' },
    { type: 'note' as CaptureType, icon: FileText, label: 'New Note' },
    { type: 'link' as CaptureType, icon: Link2, label: 'Save Link' },
    { type: 'log' as CaptureType, icon: BookOpen, label: 'Quick Log' },
  ];

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {menuOpen && (
          <div className="mb-2 flex flex-col gap-1.5 animate-fade-in">
            {items.map(item => (
              <Button
                key={item.type}
                size="sm"
                variant="secondary"
                className="shadow-lg"
                onClick={() => { setType(item.type); setOpen(true); setMenuOpen(false); }}
              >
                <item.icon className="mr-2 h-3.5 w-3.5" />{item.label}
              </Button>
            ))}
          </div>
        )}
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Plus className={`h-5 w-5 transition-transform ${menuOpen ? 'rotate-45' : ''}`} />
        </Button>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" {...preventAccidentalDialogClose}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {items.find(i => i.type === type)?.icon && (() => { const Icon = items.find(i => i.type === type)!.icon; return <Icon className="h-4 w-4" />; })()}
              {items.find(i => i.type === type)?.label}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label>{type === 'link' ? 'Title' : type === 'log' ? 'Win' : 'Title'}</Label>
              <Input value={value} onChange={e => setValue(e.target.value)} placeholder={type === 'task' ? 'Task title...' : type === 'note' ? 'Note title...' : type === 'link' ? 'Link title...' : 'What did you accomplish?'} autoFocus required />
            </div>
            {type === 'link' && (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" type="url" />
              </div>
            )}
            <Button type="submit" className="w-full">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
