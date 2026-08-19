import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit2, Merge, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { preventAccidentalDialogClose } from '@/lib/utils';
import { TagManagerSkeleton } from '@/components/skeletons/pages';

interface TagInfo { name: string; count: number; tables: string[]; }
interface TaggedRow { id: string; tags: string[] | null; }

// Only projects/links/resources carry real `tags` columns. `tasks` has no
// tags column, and `bookmarks` was dropped in the multi-tenant rebuild
// (dead table, zero rows) - both are stale references from the old
// single-user build and are intentionally left out here.
const TAG_TABLES = ['projects', 'links', 'resources'] as const;

export default function TagManager() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const { toast } = useToast();
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameDialog, setRenameDialog] = useState(false);
  const [mergeDialog, setMergeDialog] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');
  const [newName, setNewName] = useState('');
  const [mergeInto, setMergeInto] = useState('');

  const fetchTags = async () => {
    if (!wsId) return;
    const tagMap = new Map<string, { count: number; tables: Set<string> }>();

    for (const table of TAG_TABLES) {
      const rows = await api.select<TaggedRow>(table, wsId);
      rows.forEach(row => {
        (row.tags ?? []).forEach(tag => {
          if (!tagMap.has(tag)) tagMap.set(tag, { count: 0, tables: new Set() });
          const entry = tagMap.get(tag)!;
          entry.count++;
          entry.tables.add(table);
        });
      });
    }

    setTags(Array.from(tagMap.entries()).map(([name, { count, tables }]) => ({ name, count, tables: Array.from(tables) })).sort((a, b) => b.count - a.count));
    setLoading(false);
  };

  useEffect(() => { if (user && wsId) fetchTags(); }, [user, wsId]);

  const renameTag = async () => {
    if (!newName.trim() || !selectedTag || !wsId) return;
    for (const table of TAG_TABLES) {
      const rows = await api.select<TaggedRow>(table, wsId);
      for (const row of rows.filter(r => (r.tags ?? []).includes(selectedTag))) {
        const updated = (row.tags ?? []).map(t => t === selectedTag ? newName.trim() : t);
        await api.update(table, wsId, row.id, { tags: updated });
      }
    }
    setRenameDialog(false);
    setSelectedTag('');
    setNewName('');
    toast({ title: 'Tag renamed' });
    fetchTags();
  };

  const mergeTags = async () => {
    if (!mergeInto.trim() || !selectedTag || !wsId) return;
    for (const table of TAG_TABLES) {
      const rows = await api.select<TaggedRow>(table, wsId);
      for (const row of rows.filter(r => (r.tags ?? []).includes(selectedTag))) {
        let updated = (row.tags ?? []).map(t => t === selectedTag ? mergeInto.trim() : t);
        updated = [...new Set(updated)];
        await api.update(table, wsId, row.id, { tags: updated });
      }
    }
    setMergeDialog(false);
    setSelectedTag('');
    setMergeInto('');
    toast({ title: 'Tags merged' });
    fetchTags();
  };

  const deleteTag = async (tag: string) => {
    if (!wsId) return;
    for (const table of TAG_TABLES) {
      const rows = await api.select<TaggedRow>(table, wsId);
      for (const row of rows.filter(r => (r.tags ?? []).includes(tag))) {
        const updated = (row.tags ?? []).filter(t => t !== tag);
        await api.update(table, wsId, row.id, { tags: updated });
      }
    }
    toast({ title: 'Tag deleted' });
    fetchTags();
  };

  if (loading) return <TagManagerSkeleton />;

  return (
    <div className="animate-fade-in space-y-6 max-w-[800px]">
      <PageHeader title="Tag Manager" subtitle={`${tags.length} tags across all your content`} />


      {tags.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No tags found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tags.map(tag => (
            <Card key={tag.name} className="group">
              <CardContent className="flex items-center gap-4 p-4">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">{tag.name}</span>
                  <div className="flex gap-1 mt-1">
                    {tag.tables.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">{tag.count} uses</Badge>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedTag(tag.name); setNewName(tag.name); setRenameDialog(true); }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedTag(tag.name); setMergeDialog(true); }}>
                    <Merge className="h-3.5 w-3.5" />
                  </Button>
                  {tag.count === 0 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTag(tag.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={renameDialog} onOpenChange={setRenameDialog}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm" {...preventAccidentalDialogClose}>
          <DialogHeader><DialogTitle>Rename Tag</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Renaming "{selectedTag}" across all records.</p>
            <div className="space-y-2">
              <Label>New Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <Button onClick={renameTag} className="w-full">Rename</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeDialog} onOpenChange={setMergeDialog}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm" {...preventAccidentalDialogClose}>
          <DialogHeader><DialogTitle>Merge Tag</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Merge "{selectedTag}" into another tag.</p>
            <div className="space-y-2">
              <Label>Merge Into</Label>
              <Input value={mergeInto} onChange={e => setMergeInto(e.target.value)} placeholder="Target tag name" />
            </div>
            <Button onClick={mergeTags} className="w-full">Merge</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
