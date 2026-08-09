import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ExternalLink, Search, Link2, Copy, Edit2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { preventAccidentalDialogClose } from '@/lib/utils';
import { ResourcesSkeleton } from '@/components/skeletons/pages';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { UploadUrlButton } from '@/components/UploadUrlButton';

interface LinkItem {
  id: string;
  url: string;
  short_key: string | null;
  title: string;
  tags: string[];
  description: string | null;
  category: string;
  click_count: number;
  created_at: string;
}

const linkCategories = ['development', 'reference', 'reading', 'tools', 'course', 'social', 'other'];

const categoryColors: Record<string, string> = {
  development: 'bg-primary/10 text-primary',
  reference: 'bg-warning/10 text-warning',
  reading: 'bg-success/10 text-success',
  tools: 'bg-muted text-muted-foreground',
  course: 'bg-destructive/10 text-destructive',
  social: 'bg-accent/10 text-accent',
  other: 'bg-secondary text-secondary-foreground',
};

export default function Resources() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  // Links state
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [linkSearch, setLinkSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [draftId, setDraftId] = useState('');
  // Read-only detail view - the card truncates long descriptions, and opening
  // the edit form just to read one was the only way to see the rest.
  const [viewingLink, setViewingLink] = useState<LinkItem | null>(null);

  // Delete confirmation state
  const [deleteLinkConfirm, setDeleteLinkConfirm] = useState<{ open: boolean; linkId: string | null }>({ open: false, linkId: null });

  // Form state
  const [linkForm, setLinkForm] = useState({ url: '', title: '', short_key: '', tags: '', description: '', category: 'other' });

  const wsId = currentWorkspace?.id;

  // Fetch data
  const fetchData = async () => {
    if (!wsId) return;
    const linksRes = await api.select<LinkItem>('links', wsId);
    setLinks([...linksRes].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
    setLoading(false);
  };

  useEffect(() => {
    if (user && wsId) fetchData();
  }, [user, wsId]);

  // Link operations
  const handleSubmitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId) return;
    if (editingLink) {
      await api.update('links', wsId, editingLink.id, {
        url: linkForm.url,
        title: linkForm.title,
        short_key: linkForm.short_key || null,
        tags: linkForm.tags ? linkForm.tags.split(',').map(t => t.trim()) : [],
        description: linkForm.description || null,
        category: linkForm.category,
      });
      toast({ title: 'Link updated' });
    } else {
      await api.insert('links', wsId, {
        id: draftId,
        url: linkForm.url,
        title: linkForm.title,
        short_key: linkForm.short_key || null,
        tags: linkForm.tags ? linkForm.tags.split(',').map(t => t.trim()) : [],
        description: linkForm.description || null,
        category: linkForm.category,
      });
      toast({ title: 'Link saved' });
    }
    setLinkDialogOpen(false);
    setLinkForm({ url: '', title: '', short_key: '', tags: '', description: '', category: 'other' });
    setEditingLink(null);
    fetchData();
  };

  const openNewLink = () => {
    setEditingLink(null);
    setLinkForm({ url: '', title: '', short_key: '', tags: '', description: '', category: 'other' });
    // Inserted as the row's own id, so files uploaded before saving already
    // belong to the right link.
    setDraftId(crypto.randomUUID());
    setLinkDialogOpen(true);
  };

  const handleEditLink = (link: LinkItem) => {
    setEditingLink(link);
    setDraftId(link.id);
    setLinkForm({
      url: link.url,
      title: link.title,
      short_key: link.short_key ?? '',
      tags: (link.tags ?? []).join(', '),
      description: link.description ?? '',
      category: link.category,
    });
    setLinkDialogOpen(true);
  };

  const handleDeleteLink = (id: string) => {
    setDeleteLinkConfirm({ open: true, linkId: id });
  };

  const confirmDeleteLink = async () => {
    if (!deleteLinkConfirm.linkId || !wsId) return;
    await api.remove('links', wsId, deleteLinkConfirm.linkId);
    setDeleteLinkConfirm({ open: false, linkId: null });
    toast({ title: 'Link deleted' });
    fetchData();
  };

  const handleOpenLink = async (link: LinkItem) => {
    if (!wsId) return;
    await api.update('links', wsId, link.id, { click_count: link.click_count + 1 });
    window.open(link.url, '_blank');
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, click_count: l.click_count + 1 } : l));
  };

  const handleCopyLink = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  // Filter links
  const filteredLinks = links.filter(l => {
    const q = linkSearch.toLowerCase();
    const matchesSearch = !q || l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
      || (l.short_key?.toLowerCase().includes(q)) || l.tags.some(t => t.toLowerCase().includes(q))
      || (l.description?.toLowerCase().includes(q));
    const matchesCat = categoryFilter === 'all' || l.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const exactLinkMatch = linkSearch && links.find(l => l.short_key?.toLowerCase() === linkSearch.toLowerCase());

  if (loading) {
    return <ResourcesSkeleton />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Resources" />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{links.length} {links.length === 1 ? 'link' : 'links'} saved</p>
          <Dialog open={linkDialogOpen} onOpenChange={(o) => { setLinkDialogOpen(o); if (!o) setEditingLink(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openNewLink}>
                <Plus className="mr-2 h-4 w-4" />
                Save Link
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto" {...preventAccidentalDialogClose}>
              <DialogHeader>
                <DialogTitle>{editingLink ? 'Edit Link' : 'Save a Link'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmitLink} className="space-y-4">
                <div className="space-y-2">
                  <Label>URL</Label>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      value={linkForm.url}
                      onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
                      required
                      placeholder="https://"
                      className="flex-1"
                    />
                    {wsId && draftId && (
                      <UploadUrlButton
                        workspaceId={wsId}
                        entityType="links"
                        entityId={draftId}
                        onUploaded={(file) => setLinkForm(prev => ({
                          ...prev,
                          url: file.url,
                          title: prev.title || file.file_name,
                        }))}
                      />
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Paste a link, or upload a file to store and link it.</p>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={linkForm.title}
                    onChange={e => setLinkForm({ ...linkForm, title: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Short Key</Label>
                    <Input
                      value={linkForm.short_key}
                      onChange={e => setLinkForm({ ...linkForm, short_key: e.target.value })}
                      placeholder="e.g. gsoc26"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={linkForm.category} onValueChange={v => setLinkForm({ ...linkForm, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {linkCategories.map(c => (
                          <SelectItem key={c} value={c} className="capitalize">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input
                    value={linkForm.tags}
                    onChange={e => setLinkForm({ ...linkForm, tags: e.target.value })}
                    placeholder="react, docs"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={linkForm.description}
                    onChange={e => setLinkForm({ ...linkForm, description: e.target.value })}
                    rows={4}
                    placeholder="What is this, and why did you save it?"
                  />
                </div>
                {wsId && draftId && (
                  <AttachmentsPanel workspaceId={wsId} entityType="links" entityId={draftId} label="Files" compact />
                )}
                <Button type="submit" className="w-full">
                  {editingLink ? 'Update Link' : 'Save Link'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search Links */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={linkSearch}
            onChange={e => setLinkSearch(e.target.value)}
            placeholder="Search links, short keys, tags..."
            className="pl-9"
          />
        </div>

        {/* Link short key match */}
        {exactLinkMatch && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Link2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{exactLinkMatch.title}</p>
                  <p className="text-xs text-muted-foreground">{exactLinkMatch.url}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => handleOpenLink(exactLinkMatch)}>
                Open <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {['all', ...linkCategories].map(c => (
            <Button
              key={c}
              variant={categoryFilter === c ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setCategoryFilter(c)}
              className="capitalize"
            >
              {c}
            </Button>
          ))}
        </div>

        {/* Links Grid */}
        {filteredLinks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No links found
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredLinks.map((l, index) => (
              <Card key={l.id} className="group relative flex flex-col transition-colors hover:bg-card/80 animate-scale-in hover-lift" style={{ animationDelay: `${Math.min(index * 30, 480)}ms` }}>
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="mb-2 flex items-start gap-3">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(l.url).hostname}&sz=32`}
                      alt=""
                      className="h-6 w-6 rounded shrink-0 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => handleOpenLink(l)}
                        className="block truncate text-left text-sm font-medium text-foreground hover:text-primary"
                      >
                        {l.title}
                      </button>
                      <p className="truncate text-xs text-muted-foreground">{new URL(l.url).hostname}</p>
                    </div>
                    <Badge className={`shrink-0 text-xs capitalize ${categoryColors[l.category] || ''}`}>{l.category}</Badge>
                  </div>

                  {l.description && (
                    <button
                      type="button"
                      onClick={() => setViewingLink(l)}
                      title="Show full description"
                      className="mb-2 line-clamp-2 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      {l.description}
                    </button>
                  )}

                  {l.tags.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {l.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-border pt-2.5">
                    <div className="flex items-center gap-2">
                      {l.short_key && (
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{l.short_key}</code>
                      )}
                      <span className="text-[10px] text-muted-foreground">{l.click_count} opens</span>
                    </div>
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="View details" onClick={() => setViewingLink(l)}><Eye className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyLink(l.url)}><Copy className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenLink(l)}><ExternalLink className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditLink(l)}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteLink(l.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Read-only detail view: full description, every tag, and any files. */}
      <Dialog open={viewingLink !== null} onOpenChange={(o) => { if (!o) setViewingLink(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {viewingLink && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-left">{viewingLink.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`text-xs capitalize ${categoryColors[viewingLink.category] || ''}`}>{viewingLink.category}</Badge>
                  {viewingLink.short_key && (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{viewingLink.short_key}</code>
                  )}
                  <span className="text-xs text-muted-foreground">{viewingLink.click_count} opens</span>
                  <span className="text-xs text-muted-foreground">· saved {format(new Date(viewingLink.created_at), 'MMM d, yyyy')}</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">URL</Label>
                  <a
                    href={viewingLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-sm text-primary hover:underline"
                  >
                    {viewingLink.url}
                  </a>
                </div>

                {viewingLink.description && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{viewingLink.description}</p>
                  </div>
                )}

                {viewingLink.tags.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tags</Label>
                    <div className="flex flex-wrap gap-1">
                      {viewingLink.tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
                    </div>
                  </div>
                )}

                {wsId && (
                  <AttachmentsPanel workspaceId={wsId} entityType="links" entityId={viewingLink.id} label="Files" readOnly />
                )}

                <div className="flex gap-2 border-t border-border pt-3">
                  <Button size="sm" onClick={() => { handleOpenLink(viewingLink); setViewingLink(null); }}>
                    Open <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleCopyLink(viewingLink.url)}>
                    <Copy className="mr-1 h-3 w-3" />Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { const link = viewingLink; setViewingLink(null); handleEditLink(link); }}>
                    <Edit2 className="mr-1 h-3 w-3" />Edit
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteLinkConfirm.open}
        onOpenChange={(open) => setDeleteLinkConfirm({ ...deleteLinkConfirm, open })}
        title="Delete Link"
        description="Are you sure you want to delete this link? This action cannot be undone."
        onConfirm={confirmDeleteLink}
        variant="destructive"
      />
    </div>
  );
}
