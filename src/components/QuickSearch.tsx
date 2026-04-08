import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, CheckSquare, Link2, FileText, Search, Flag, Calendar, Video } from 'lucide-react';

interface SearchResult {
  type: 'project' | 'task' | 'link' | 'note' | 'milestone' | 'meeting' | 'resource';
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
}

const typeIcons: Record<string, any> = {
  project: FolderKanban,
  task: CheckSquare,
  link: Link2,
  note: FileText,
  milestone: Flag,
  meeting: Calendar,
  resource: FileText,
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function QuickSearch({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !user) { setResults([]); return; }
    const pattern = `%${q}%`;
    const [projects, tasks, links, notes, milestones, meetings, resources] = await Promise.all([
      supabase.from('projects').select('id, name, slug, type').ilike('name', pattern).limit(5),
      supabase.from('tasks').select('id, title, status').ilike('title', pattern).limit(5),
      supabase.from('links').select('id, title, url, short_key, tags, description').or(`title.ilike.${pattern},url.ilike.${pattern},short_key.ilike.${pattern},description.ilike.${pattern}`).limit(5),
      supabase.from('notes').select('id, title').ilike('title', pattern).limit(5),
      supabase.from('milestones').select('id, title, date').ilike('title', pattern).limit(5),
      supabase.from('meetings').select('id, title, scheduled_at').ilike('title', pattern).limit(5),
      supabase.from('resources').select('id, title, url, type').ilike('title', pattern).limit(5),
    ]);
    const r: SearchResult[] = [
      ...(projects.data ?? []).map(p => ({ type: 'project' as const, id: p.slug || p.id, title: p.name, subtitle: p.type })),
      ...(tasks.data ?? []).map(t => ({ type: 'task' as const, id: t.id, title: t.title, subtitle: t.status })),
      ...(links.data ?? []).map(l => ({ type: 'link' as const, id: l.id, title: l.title, subtitle: l.url, url: l.url })),
      ...(notes.data ?? []).map(n => ({ type: 'note' as const, id: n.id, title: n.title })),
      ...(milestones.data ?? []).map(m => ({ type: 'milestone' as const, id: m.id, title: m.title, subtitle: m.date })),
      ...(meetings.data ?? []).map(m => ({ type: 'meeting' as const, id: m.id, title: m.title, subtitle: m.scheduled_at })),
      ...(resources.data ?? []).map(r => ({ type: 'resource' as const, id: r.id, title: r.title, subtitle: r.type, url: r.url })),
    ];

    // Also search links by tags
    if (q.length >= 2) {
      const { data: tagLinks } = await supabase.from('links').select('id, title, url, short_key').contains('tags', [q]).limit(3);
      (tagLinks ?? []).forEach(l => {
        if (!r.find(x => x.id === l.id)) {
          r.push({ type: 'link', id: l.id, title: l.title, subtitle: l.url, url: l.url });
        }
      });
    }

    setResults(r);
    setSelectedIndex(0);
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); }
  }, [open]);

  const handleSelect = (result: SearchResult) => {
    onClose();
    if (result.type === 'project') navigate(`/projects/${result.id}`);
    else if (result.type === 'task') navigate('/tasks');
    else if (result.type === 'link' && result.url) window.open(result.url, '_blank');
    else if (result.type === 'resource' && result.url) window.open(result.url, '_blank');
    else if (result.type === 'note') navigate('/notes');
    else if (result.type === 'milestone') navigate('/calendar');
    else if (result.type === 'meeting') navigate('/calendar');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[selectedIndex]) { handleSelect(results[selectedIndex]); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-lg">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search everything... projects, tasks, links, notes, meetings"
            className="border-0 p-0 h-auto focus-visible:ring-0 text-sm"
            autoFocus
          />
          <kbd className="hidden sm:inline-block rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">ESC</kbd>
        </div>
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-2">
            {results.map((r, i) => {
              const Icon = typeIcons[r.type] || FileText;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => handleSelect(r)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{r.title}</p>
                    {r.subtitle && <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs capitalize shrink-0">{r.type}</Badge>
                </button>
              );
            })}
          </div>
        )}
        {query && results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
