import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ExternalLink, Search, Link2, Copy, Edit2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface LinkItem {
  id: string; url: string; short_key: string | null; title: string;
  tags: string[]; description: string | null; category: string;
  click_count: number; created_at: string;
}

const categoryColors: Record<string, string> = {
  development: 'bg-primary/20 text-primary',
  reference: 'bg-warning/20 text-warning',
  reading: 'bg-success/20 text-success',
  tools: 'bg-muted text-muted-foreground',
  course: 'bg-destructive/20 text-destructive',
  social: 'bg-accent/20 text-accent-foreground',
  other: 'bg-secondary text-secondary-foreground',
};

export default function LinkVault() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; linkId: string | null }>({ open: false, linkId: null });
  const [form, setForm] = useState({ url: '', title: '', short_key: '', tags: '', description: '', category: 'other' });

  const fetchLinks = async () => {
    const { data } = await supabase.from('links').select('*').order('created_at', { ascending: false });
    setLinks(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchLinks(); }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLink) {
      await supabase.from('links').update({
        url: form.url, title: form.title, short_key: form.short_key || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        description: form.description || null, category: form.category,
      }).eq('id', editingLink.id);
      toast({ title: 'Link updated' });
    } else {
      await supabase.from('links').insert({
        url: form.url, title: form.title, short_key: form.short_key || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        description: form.description || null, category: form.category,
        user_id: user!.id,
      });
      toast({ title: 'Link saved' });
    }
    setDialogOpen(false);
    setForm({ url: '', title: '', short_key: '', tags: '', description: '', category: 'other' });
    setEditingLink(null);
    fetchLinks();
  };

  const handleEdit = (link: LinkItem) => {
    setEditingLink(link);
    setForm({ url: link.url, title: link.title, short_key: link.short_key ?? '', tags: (link.tags ?? []).join(', '), description: link.description ?? '', category: link.category });
    setDialogOpen(true);
  };

  const handleOpen = async (link: LinkItem) => {
    await supabase.from('links').update({ click_count: link.click_count + 1 }).eq('id', link.id);
    window.open(link.url, '_blank');
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, click_count: l.click_count + 1 } : l));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ open: true, linkId: id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.linkId) return;
    await supabase.from('links').delete().eq('id', deleteConfirm.linkId);
    setDeleteConfirm({ open: false, linkId: null });
    fetchLinks();
    toast({ title: 'Link deleted' });
  };

  const filtered = links.filter(l => {
    const q = search.toLowerCase();
    const matchesSearch = !q || l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
      || (l.short_key?.toLowerCase().includes(q)) || l.tags.some(t => t.toLowerCase().includes(q))
      || (l.description?.toLowerCase().includes(q));
    const matchesCat = categoryFilter === 'all' || l.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  // Short key exact match - auto-focus
  const exactMatch = search && links.find(l => l.short_key?.toLowerCase() === search.toLowerCase());

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-6">
      <PageHeader title="Link Vault" />

      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{links.length} links saved</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Save Link</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editingLink ? 'Edit Link' : 'Save a Link'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">URL</Label>
                <Input type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} required placeholder="https://" className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Title</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Short Key</Label>
                  <Input value={form.short_key} onChange={e => setForm({ ...form, short_key: e.target.value })} placeholder="e.g. gsoc26" className="h-9 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Category</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['development', 'reference', 'reading', 'tools', 'course', 'social', 'other'].map(c => (
                        <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tags (comma-separated)</Label>
                <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="react, docs" className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Description</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="h-9 text-sm" />
              </div>
              <Button type="submit" className="w-full">{editingLink ? 'Update Link' : 'Save Link'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search links, short keys, tags... (type a short key for instant open)"
          className="pl-9 h-9 text-sm"
          autoFocus
        />
      </div>

      {/* Exact short key match banner */}
      {exactMatch && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4 sm:p-6">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Link2 className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{exactMatch.title}</p>
                <p className="text-xs text-muted-foreground truncate">{exactMatch.url}</p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleOpen(exactMatch)} className="ml-2 shrink-0">Open <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button>
          </CardContent>
        </Card>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'development', 'reference', 'reading', 'tools', 'course', 'other'].map(c => (
          <Button key={c} variant={categoryFilter === c ? 'default' : 'outline'} size="sm" onClick={() => setCategoryFilter(c)} className="capitalize text-xs h-9">
            {c}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-sm text-muted-foreground">No links found</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => (
            <Card key={l.id} className="group transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6">
                <img src={`https://www.google.com/s2/favicons?domain=${new URL(l.url).hostname}&sz=32`} alt="" className="h-5 w-5 rounded shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <button onClick={() => handleOpen(l)} className="text-sm sm:text-base font-semibold text-foreground hover:text-primary truncate">{l.title}</button>
                    {l.short_key && <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{l.short_key}</code>}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">{l.url}</p>
                  {l.tags.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {l.tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
                    </div>
                  )}
                </div>
                <Badge className={`text-xs capitalize shrink-0 ${categoryColors[l.category] || ''}`}>{l.category}</Badge>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{l.click_count}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => handleCopy(l.url)} title="Copy URL"><Copy className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => handleOpen(l)} title="Open link"><ExternalLink className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => handleEdit(l)} title="Edit"><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(l.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete Link"
        description="Are you sure you want to delete this link? This action cannot be undone."
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
