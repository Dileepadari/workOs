// Workspace secrets vault. Values are encrypted at rest by the Edge Function
// (never hashed - see the 20260809000001_secrets.sql migration for why) and
// are never included in the list response: each one is fetched individually,
// on demand, when you click reveal.

import { useEffect, useRef, useState } from 'react';
import { secrets as secretsApi, type Secret } from '@/lib/api';
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
import { Plus, Trash2, Search, Copy, Edit2, Eye, EyeOff, KeyRound, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { preventAccidentalDialogClose } from '@/lib/utils';
import { CardGridSkeleton } from '@/components/skeletons/primitives';
import {
  SECRET_CATEGORIES, secretCategoryColor, secretCategoryLabel, MASKED_VALUE, REVEAL_TIMEOUT_MS,
} from '@/lib/secretMeta';

const emptyForm = { name: '', value: '', username: '', url: '', category: 'other', tags: '', description: '' };

export default function Secrets() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  const [items, setItems] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Secret | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showFormValue, setShowFormValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Secret | null>(null);

  // Plaintext for the entries currently revealed, keyed by id. Cleared on
  // hide, on a timeout, and whenever the workspace changes.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const wsId = currentWorkspace?.id;

  const clearTimer = (id: string) => {
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  };

  const hide = (id: string) => {
    clearTimer(id);
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Never leave decrypted values sitting in memory across a page leave or a
  // workspace switch.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    setRevealed({});
    Object.keys(timers.current).forEach(clearTimer);
  }, [wsId]);

  const fetchSecrets = async () => {
    if (!wsId) return;
    try {
      setItems(await secretsApi.list(wsId));
    } catch (error) {
      toast({
        title: 'Could not load secrets',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSecrets is redefined every render; re-fetch only when the user/workspace actually changes
  useEffect(() => { if (user && wsId) fetchSecrets(); }, [user, wsId]);

  const reveal = async (secret: Secret) => {
    if (revealed[secret.id]) return hide(secret.id);
    setRevealing(secret.id);
    try {
      const value = await secretsApi.reveal(secret.id);
      setRevealed((prev) => ({ ...prev, [secret.id]: value }));
      clearTimer(secret.id);
      timers.current[secret.id] = setTimeout(() => hide(secret.id), REVEAL_TIMEOUT_MS);
    } catch (error) {
      toast({
        title: 'Could not reveal secret',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setRevealing(null);
    }
  };

  const copyValue = async (secret: Secret) => {
    try {
      const value = revealed[secret.id] ?? (await secretsApi.reveal(secret.id));
      await navigator.clipboard.writeText(value);
      toast({ title: 'Secret copied to clipboard' });
    } catch (error) {
      toast({
        title: 'Could not copy secret',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowFormValue(false);
    setDialogOpen(true);
  };

  const openEdit = (secret: Secret) => {
    setEditing(secret);
    // Value stays blank on edit - it's write-only here. Leaving it empty
    // means "keep the stored one" (see handleUpdateSecret in the function).
    setForm({
      name: secret.name,
      value: '',
      username: secret.username ?? '',
      url: secret.url ?? '',
      category: secret.category,
      tags: (secret.tags ?? []).join(', '),
      description: secret.description ?? '',
    });
    setShowFormValue(false);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId) return;
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      category: form.category,
      username: form.username || null,
      url: form.url || null,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };
    try {
      if (editing) {
        await secretsApi.update(editing.id, { ...payload, ...(form.value ? { value: form.value } : {}) });
        hide(editing.id); // a changed value shouldn't leave the old one on screen
        toast({ title: 'Secret updated' });
      } else {
        await secretsApi.create(wsId, { ...payload, value: form.value });
        toast({ title: 'Secret saved' });
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditing(null);
      fetchSecrets();
    } catch (error) {
      toast({
        title: 'Could not save secret',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await secretsApi.remove(deleteTarget.id);
      hide(deleteTarget.id);
      toast({ title: 'Secret deleted' });
      fetchSecrets();
    } catch (error) {
      toast({
        title: 'Could not delete secret',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const visible = items.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = !q
      || s.name.toLowerCase().includes(q)
      || (s.username?.toLowerCase().includes(q))
      || (s.description?.toLowerCase().includes(q))
      || (s.url?.toLowerCase().includes(q))
      || s.tags.some((t) => t.toLowerCase().includes(q));
    const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-6">
      <PageHeader title="Secrets" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? 'secret' : 'secrets'} · encrypted at rest, shared with this workspace
        </p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />New Secret</Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto" {...preventAccidentalDialogClose}>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Secret' : 'New Secret'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Stripe live key" />
              </div>

              <div className="space-y-2">
                <Label>Value{editing && <span className="ml-1 text-xs font-normal text-muted-foreground">(leave blank to keep the current one)</span>}</Label>
                <div className="flex gap-2">
                  <Input
                    type={showFormValue ? 'text' : 'password'}
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    required={!editing}
                    autoComplete="new-password"
                    placeholder={editing ? 'Unchanged' : ''}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button type="button" variant="outline" size="icon" aria-label={showFormValue ? 'Hide value' : 'Show value'} onClick={() => setShowFormValue((v) => !v)}>
                    {showFormValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Username / account</Label>
                  <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SECRET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{secretCategoryLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
              </div>

              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="production, billing" />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Where is this used? Who owns it?" />
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update Secret' : 'Save Secret'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search secrets, accounts, tags..." className="pl-9" />
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', ...SECRET_CATEGORIES].map((c) => (
          <Button
            key={c}
            variant={categoryFilter === c ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setCategoryFilter(c)}
          >
            {c === 'all' ? 'All' : secretCategoryLabel(c)}
          </Button>
        ))}
      </div>

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <KeyRound className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="mb-2 text-sm text-muted-foreground">
              {items.length === 0 ? 'No secrets stored yet' : 'No secrets match your search'}
            </p>
            {items.length === 0 && (
              <Button variant="outline" size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add your first secret</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s, index) => {
            const isRevealed = s.id in revealed;
            return (
              <Card key={s.id} className="group flex flex-col animate-scale-in hover-lift" style={{ animationDelay: `${Math.min(index * 30, 480)}ms` }}>
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <KeyRound className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground" title={s.name}>{s.name}</p>
                      {s.username && <p className="truncate text-xs text-muted-foreground">{s.username}</p>}
                    </div>
                    <Badge className={`shrink-0 text-[10px] ${secretCategoryColor(s.category)}`}>{secretCategoryLabel(s.category)}</Badge>
                  </div>

                  <div className="flex items-start gap-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    {/* Revealed values wrap (break-all) rather than truncate -
                        a half-shown API key is useless. The mask is a fixed
                        short string, so it never needs to wrap. */}
                    <code className={`min-w-0 flex-1 font-mono text-xs text-foreground ${isRevealed ? 'break-all' : 'truncate'}`}>
                      {isRevealed ? revealed[s.id] : MASKED_VALUE}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      aria-label={isRevealed ? `Hide ${s.name}` : `Reveal ${s.name}`}
                      disabled={revealing === s.id}
                      onClick={() => reveal(s)}
                    >
                      {revealing === s.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Copy ${s.name}`} onClick={() => copyValue(s)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>

                  {s.description && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{s.description}</p>}

                  {s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
                    <span className="text-[10px] text-muted-foreground">Updated {format(new Date(s.updated_at), 'MMM d, yyyy')}</span>
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {s.url && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.name} site`}><ExternalLink className="h-3 w-3" /></a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" aria-label={`Delete ${s.name}`} onClick={() => setDeleteTarget(s)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete secret"
        description={`Permanently delete "${deleteTarget?.name}"? This cannot be undone, and the stored value will be unrecoverable.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
