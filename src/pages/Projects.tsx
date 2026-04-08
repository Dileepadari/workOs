import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, Search, X, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Project {
  id: string; name: string; description: string | null; status: 'active' | 'archived' | 'on_hold';
  color: string; created_at: string; updated_at: string; slug: string | null;
  type: string | null; tags: string[] | null; start_date: string | null; target_end_date: string | null;
  repo_url: string | null; collab_password_hash: string | null;
}

const statusColors: Record<string, string> = {
  active: 'bg-success/20 text-success',
  on_hold: 'bg-warning/20 text-warning',
  archived: 'bg-muted text-muted-foreground',
};

const projectTypes = ['academic', 'open_source', 'personal', 'internship', 'freelance', 'community', 'research'];

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, { done: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; projectId: string | null }>({ open: false, projectId: null });
  const [form, setForm] = useState({
    name: '', description: '', status: 'active' as Project['status'], color: '#2D6A6A',
    type: 'personal', tags: '', slug: '', start_date: '', target_end_date: '',
    repo_url: '', collab_password: '',
  });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated');

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
    setProjects(data ?? []);

    // Get task counts
    const { data: tasks } = await supabase.from('tasks').select('id, project_id, status');
    const counts: Record<string, { done: number; total: number }> = {};
    (tasks ?? []).forEach(t => {
      if (!t.project_id) return;
      if (!counts[t.project_id]) counts[t.project_id] = { done: 0, total: 0 };
      counts[t.project_id].total++;
      if (t.status === 'done') counts[t.project_id].done++;
    });
    setTaskCounts(counts);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchProjects(); }, [user]);

  const resetForm = () => {
    setForm({ name: '', description: '', status: 'active', color: '#2D6A6A', type: 'personal', tags: '', slug: '', start_date: '', target_end_date: '', repo_url: '', collab_password: '' });
    setEditingProject(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const payload = {
      name: form.name, description: form.description || null, status: form.status, color: form.color,
      type: form.type, tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      slug, start_date: form.start_date || null, target_end_date: form.target_end_date || null,
      repo_url: form.repo_url || null,
      collab_password_hash: form.collab_password || null, // simple storage for now
    };
    if (editingProject) {
      await supabase.from('projects').update(payload).eq('id', editingProject.id);
    } else {
      await supabase.from('projects').insert({ ...payload, user_id: user!.id });
    }
    setDialogOpen(false);
    resetForm();
    fetchProjects();
  };

  const handleEdit = (p: Project) => {
    setEditingProject(p);
    setForm({
      name: p.name, description: p.description ?? '', status: p.status, color: p.color,
      type: p.type ?? 'personal', tags: (p.tags ?? []).join(', '), slug: p.slug ?? '',
      start_date: p.start_date ?? '', target_end_date: p.target_end_date ?? '',
      repo_url: p.repo_url ?? '', collab_password: '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ open: true, projectId: id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.projectId) return;
    await supabase.from('projects').delete().eq('id', deleteConfirm.projectId);
    setDeleteConfirm({ open: false, projectId: null });
    fetchProjects();
  };

  // Filter & sort
  const allTags = [...new Set(projects.flatMap(p => p.tags ?? []))];

  let filtered = projects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchType = typeFilter === 'all' || p.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  if (sortBy === 'alpha') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'completion') filtered.sort((a, b) => {
    const pa = taskCounts[a.id] ? (taskCounts[a.id].done / taskCounts[a.id].total) : 0;
    const pb = taskCounts[b.id] ? (taskCounts[b.id].done / taskCounts[b.id].total) : 0;
    return pb - pa;
  });

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-6">
      <PageHeader title="Projects" />

      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{projects.length} projects</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />New Project</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingProject ? 'Edit Project' : 'New Project'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Project['status'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {projectTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 cursor-pointer" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="gsoc, react, 2026" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Target End Date</Label>
                  <Input type="date" value={form.target_end_date} onChange={(e) => setForm({ ...form, target_end_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Repository URL</Label>
                <Input value={form.repo_url} onChange={(e) => setForm({ ...form, repo_url: e.target.value })} placeholder="https://github.com/..." />
              </div>
              <div className="space-y-2">
                <Label>Collaborator Password</Label>
                <Input type="password" value={form.collab_password} onChange={(e) => setForm({ ...form, collab_password: e.target.value })} placeholder="Leave blank for no collaborator access" />
                <p className="text-[10px] text-muted-foreground">Set a password to allow collaborators view-only access via /collab/slug</p>
              </div>
              <Button type="submit" className="w-full">{editingProject ? 'Save Changes' : 'Create Project'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..." className="pl-9 h-9 text-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {projectTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><ArrowUpDown className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Last Updated</SelectItem>
                <SelectItem value="alpha">Alphabetical</SelectItem>
                <SelectItem value="completion">% Completion</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active filter pills */}
        {(search || statusFilter !== 'all' || typeFilter !== 'all') && (
          <div className="flex gap-2 flex-wrap">
            {search && <Badge variant="secondary" className="text-xs gap-1 cursor-pointer hover:opacity-75"><X className="h-3 w-3" onClick={() => setSearch('')} />{search}</Badge>}
            {statusFilter !== 'all' && <Badge variant="secondary" className="text-xs gap-1 capitalize cursor-pointer hover:opacity-75"><X className="h-3 w-3" onClick={() => setStatusFilter('all')} />{statusFilter}</Badge>}
            {typeFilter !== 'all' && <Badge variant="secondary" className="text-xs gap-1 capitalize cursor-pointer hover:opacity-75"><X className="h-3 w-3" onClick={() => setTypeFilter('all')} />{typeFilter}</Badge>}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-2 text-sm text-muted-foreground">{projects.length === 0 ? 'No projects yet' : 'No matching projects'}</p>
            {projects.length === 0 && (
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Create your first project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const tc = taskCounts[p.id] ?? { done: 0, total: 0 };
            return (
              <Link key={p.id} to={`/projects/${p.slug || p.id}`}>
                <Card className="group transition-colors hover:bg-muted/50 h-full">
                  <CardContent className="p-4 sm:p-6">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <h3 className="font-semibold text-foreground truncate text-base">{p.name}</h3>
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 shrink-0" onClick={e => e.preventDefault()}>
                        <Button variant="ghost" size="sm" className="h-8 w-8" onClick={(e) => { e.preventDefault(); handleEdit(p); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.preventDefault(); handleDelete(p.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {p.description && <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{p.description}</p>}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {p.type && <Badge variant="outline" className="text-xs capitalize">{p.type.replace('_', ' ')}</Badge>}
                      {(p.tags ?? []).slice(0, 3).map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
                    </div>
                    {tc.total > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${tc.total > 0 ? (tc.done / tc.total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{tc.done}/{tc.total}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <Badge className={`capitalize ${statusColors[p.status]}`}>{p.status.replace('_', ' ')}</Badge>
                      <span className="text-muted-foreground">{format(new Date(p.updated_at), 'MMM d')}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete project?"
        description="This action cannot be undone. The project and all associated tasks will be permanently deleted."
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
