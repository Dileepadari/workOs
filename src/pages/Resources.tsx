import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, ExternalLink, Search, Link2, Copy, Edit2, Bookmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  description: string | null;
  tags: string[];
  created_at: string;
}

const linkCategories = ['development', 'reference', 'reading', 'tools', 'course', 'social', 'other'];

const categoryColors: Record<string, string> = {
  development: 'bg-primary/20 text-primary',
  reference: 'bg-warning/20 text-warning',
  reading: 'bg-success/20 text-success',
  tools: 'bg-muted text-muted-foreground',
  course: 'bg-destructive/20 text-destructive',
  social: 'bg-accent/20 text-accent-foreground',
  other: 'bg-secondary text-secondary-foreground',
};

export default function Resources() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Links state
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [linkSearch, setLinkSearch] = useState('');
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('links');

  // Dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<BookmarkItem | null>(null);

  // Delete confirmation state
  const [deleteLinkConfirm, setDeleteLinkConfirm] = useState<{ open: boolean; linkId: string | null }>({ open: false, linkId: null });
  const [deleteBookmarkConfirm, setDeleteBookmarkConfirm] = useState<{ open: boolean; bookmarkId: string | null }>({ open: false, bookmarkId: null });

  // Form state
  const [linkForm, setLinkForm] = useState({ url: '', title: '', short_key: '', tags: '', description: '', category: 'other' });
  const [bookmarkForm, setBookmarkForm] = useState({ title: '', url: '', description: '', tags: '' });

  // Fetch data
  const fetchData = async () => {
    const [linksRes, bookmarksRes] = await Promise.all([
      supabase.from('links').select('*').order('created_at', { ascending: false }),
      supabase.from('bookmarks').select('*').order('created_at', { ascending: false }),
    ]);
    setLinks(linksRes.data ?? []);
    setBookmarks(bookmarksRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  // Link operations
  const handleSubmitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLink) {
      await supabase.from('links').update({
        url: linkForm.url,
        title: linkForm.title,
        short_key: linkForm.short_key || null,
        tags: linkForm.tags ? linkForm.tags.split(',').map(t => t.trim()) : [],
        description: linkForm.description || null,
        category: linkForm.category,
      }).eq('id', editingLink.id);
      toast({ title: 'Link updated' });
    } else {
      await supabase.from('links').insert({
        url: linkForm.url,
        title: linkForm.title,
        short_key: linkForm.short_key || null,
        tags: linkForm.tags ? linkForm.tags.split(',').map(t => t.trim()) : [],
        description: linkForm.description || null,
        category: linkForm.category,
        user_id: user!.id,
      });
      toast({ title: 'Link saved' });
    }
    setLinkDialogOpen(false);
    setLinkForm({ url: '', title: '', short_key: '', tags: '', description: '', category: 'other' });
    setEditingLink(null);
    fetchData();
  };

  const handleEditLink = (link: LinkItem) => {
    setEditingLink(link);
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
    if (!deleteLinkConfirm.linkId) return;
    await supabase.from('links').delete().eq('id', deleteLinkConfirm.linkId);
    setDeleteLinkConfirm({ open: false, linkId: null });
    toast({ title: 'Link deleted' });
    fetchData();
  };

  const handleOpenLink = async (link: LinkItem) => {
    await supabase.from('links').update({ click_count: link.click_count + 1 }).eq('id', link.id);
    window.open(link.url, '_blank');
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, click_count: l.click_count + 1 } : l));
  };

  const handleCopyLink = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  // Bookmark operations
  const handleSubmitBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBookmark) {
      await supabase.from('bookmarks').update({
        title: bookmarkForm.title,
        url: bookmarkForm.url,
        description: bookmarkForm.description || null,
        tags: bookmarkForm.tags ? bookmarkForm.tags.split(',').map(t => t.trim()) : [],
      }).eq('id', editingBookmark.id);
      toast({ title: 'Bookmark updated' });
    } else {
      await supabase.from('bookmarks').insert({
        title: bookmarkForm.title,
        url: bookmarkForm.url,
        description: bookmarkForm.description || null,
        tags: bookmarkForm.tags ? bookmarkForm.tags.split(',').map(t => t.trim()) : [],
        user_id: user!.id,
      });
      toast({ title: 'Bookmark saved' });
    }
    setBookmarkDialogOpen(false);
    setBookmarkForm({ title: '', url: '', description: '', tags: '' });
    setEditingBookmark(null);
    fetchData();
  };

  const handleEditBookmark = (bookmark: BookmarkItem) => {
    setEditingBookmark(bookmark);
    setBookmarkForm({
      title: bookmark.title,
      url: bookmark.url,
      description: bookmark.description ?? '',
      tags: (bookmark.tags ?? []).join(', '),
    });
    setBookmarkDialogOpen(true);
  };

  const handleDeleteBookmark = (id: string) => {
    setDeleteBookmarkConfirm({ open: true, bookmarkId: id });
  };

  const confirmDeleteBookmark = async () => {
    if (!deleteBookmarkConfirm.bookmarkId) return;
    await supabase.from('bookmarks').delete().eq('id', deleteBookmarkConfirm.bookmarkId);
    setDeleteBookmarkConfirm({ open: false, bookmarkId: null });
    toast({ title: 'Bookmark deleted' });
    fetchData();
  };

  const handleOpenBookmark = (bookmark: BookmarkItem) => {
    window.open(bookmark.url, '_blank');
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

  const filteredBookmarks = bookmarks.filter(b => {
    const q = bookmarkSearch.toLowerCase();
    return !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
      || b.tags.some(t => t.toLowerCase().includes(q))
      || (b.description?.toLowerCase().includes(q));
  });

  const exactLinkMatch = linkSearch && links.find(l => l.short_key?.toLowerCase() === linkSearch.toLowerCase());

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Resources" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full gap-2">
          <TabsTrigger value="links" className="gap-2 flex-1">
            <Link2 className="h-4 w-4" />
            Links ({links.length})
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="gap-2 flex-1">
            <Bookmark className="h-4 w-4" />
            Bookmarks ({bookmarks.length})
          </TabsTrigger>
        </TabsList>

        {/* Links Tab */}
        <TabsContent value="links" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{links.length} links saved</p>
            <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Save Link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingLink ? 'Edit Link' : 'Save a Link'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitLink} className="space-y-4">
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      type="url"
                      value={linkForm.url}
                      onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
                      required
                      placeholder="https://"
                    />
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
                    <Input
                      value={linkForm.description}
                      onChange={e => setLinkForm({ ...linkForm, description: e.target.value })}
                    />
                  </div>
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
            <div className="space-y-2">
              {filteredLinks.map(l => (
                <Card key={l.id} className="group transition-colors hover:bg-card/80">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${new URL(l.url).hostname}&sz=32`}
                        alt=""
                        className="h-5 w-5 rounded shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <button
                            onClick={() => handleOpenLink(l)}
                            className="text-sm font-medium text-foreground hover:text-primary"
                          >
                            {l.title}
                          </button>
                          {l.short_key && (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground shrink-0">
                              {l.short_key}
                            </code>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mb-2">{l.url}</p>
                        {l.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap mb-2">
                            {l.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          className={`text-xs capitalize ${categoryColors[l.category] || ''}`}
                        >
                          {l.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{l.click_count} opens</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopyLink(l.url)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenLink(l)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEditLink(l)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteLink(l.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Bookmarks Tab */}
        <TabsContent value="bookmarks" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{bookmarks.length} bookmarks saved</p>
            <Dialog open={bookmarkDialogOpen} onOpenChange={setBookmarkDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Save Bookmark
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingBookmark ? 'Edit Bookmark' : 'Save a Bookmark'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitBookmark} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={bookmarkForm.title}
                      onChange={e => setBookmarkForm({ ...bookmarkForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      type="url"
                      value={bookmarkForm.url}
                      onChange={e => setBookmarkForm({ ...bookmarkForm, url: e.target.value })}
                      required
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={bookmarkForm.description}
                      onChange={e => setBookmarkForm({ ...bookmarkForm, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags (comma-separated)</Label>
                    <Input
                      value={bookmarkForm.tags}
                      onChange={e => setBookmarkForm({ ...bookmarkForm, tags: e.target.value })}
                      placeholder="work, reference"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {editingBookmark ? 'Update Bookmark' : 'Save Bookmark'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search Bookmarks */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={bookmarkSearch}
              onChange={e => setBookmarkSearch(e.target.value)}
              placeholder="Search bookmarks, tags..."
              className="pl-9"
            />
          </div>

          {/* Bookmarks Grid */}
          {filteredBookmarks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No bookmarks found
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredBookmarks.map(b => (
                <Card key={b.id} className="group flex flex-col">
                  <CardContent className="flex-1 p-4">
                    <button
                      onClick={() => handleOpenBookmark(b)}
                      className="mb-2 inline-block text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {b.title}
                    </button>
                    {b.description && <p className="mb-3 text-sm text-muted-foreground">{b.description}</p>}
                    {b.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {b.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-1">{b.url}</p>
                  </CardContent>
                  <div className="flex gap-1 border-t border-border p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEditBookmark(b)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDeleteBookmark(b.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmations */}
      <ConfirmDialog
        open={deleteLinkConfirm.open}
        onOpenChange={(open) => setDeleteLinkConfirm({ ...deleteLinkConfirm, open })}
        title="Delete Link"
        description="Are you sure you want to delete this link? This action cannot be undone."
        onConfirm={confirmDeleteLink}
        variant="destructive"
      />

      <ConfirmDialog
        open={deleteBookmarkConfirm.open}
        onOpenChange={(open) => setDeleteBookmarkConfirm({ ...deleteBookmarkConfirm, open })}
        title="Delete Bookmark"
        description="Are you sure you want to delete this bookmark? This action cannot be undone."
        onConfirm={confirmDeleteBookmark}
        variant="destructive"
      />
    </div>
  );
}
