import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Zap, AlertCircle, Trophy, Trash2 } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface DailyLog {
  id: string; date: string; notes_html: string | null;
  energy_level: number | null; wins: string[]; blockers: string[];
}

const energyEmojis = ['', '😩', '😴', '😐', '😊', '🔥'];

export default function DailyLogPage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ notes: '', energy: 4, wins: '', blockers: '' });
  const [newWin, setNewWin] = useState('');
  const [newBlocker, setNewBlocker] = useState('');
  const [deleteWinConfirm, setDeleteWinConfirm] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [deleteBlockerConfirm, setDeleteBlockerConfirm] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });

  const fetchLog = async (date: string) => {
    setLoading(true);
    const { data } = await supabase.from('daily_log').select('*').eq('date', date).maybeSingle();
    setLog(data);
    if (data) {
      setForm({
        notes: data.notes_html ?? '',
        energy: data.energy_level ?? 4,
        wins: '',
        blockers: '',
      });
    } else {
      setForm({ notes: '', energy: 4, wins: '', blockers: '' });
    }
    setLoading(false);
  };

  useEffect(() => { if (user) fetchLog(currentDate); }, [user, currentDate]);

  const saveLog = async () => {
    setSaving(true);
    const payload = {
      date: currentDate,
      notes_html: form.notes || null,
      energy_level: form.energy,
      wins: log?.wins ?? [],
      blockers: log?.blockers ?? [],
      user_id: user!.id,
    };
    if (log) {
      await supabase.from('daily_log').update(payload).eq('id', log.id);
    } else {
      await supabase.from('daily_log').insert(payload);
    }
    await fetchLog(currentDate);
    setSaving(false);
  };

  const addWin = async () => {
    if (!newWin.trim()) return;
    const wins = [...(log?.wins ?? []), newWin.trim()];
    if (log) {
      await supabase.from('daily_log').update({ wins }).eq('id', log.id);
    } else {
      await supabase.from('daily_log').insert({ date: currentDate, wins, user_id: user!.id, energy_level: form.energy });
    }
    setNewWin('');
    fetchLog(currentDate);
  };

  const addBlocker = async () => {
    if (!newBlocker.trim()) return;
    const blockers = [...(log?.blockers ?? []), newBlocker.trim()];
    if (log) {
      await supabase.from('daily_log').update({ blockers }).eq('id', log.id);
    } else {
      await supabase.from('daily_log').insert({ date: currentDate, blockers, user_id: user!.id, energy_level: form.energy });
    }
    setNewBlocker('');
    fetchLog(currentDate);
  };

  const deleteWin = async (index: number) => {
    if (!log) return;
    const wins = log.wins.filter((_, i) => i !== index);
    await supabase.from('daily_log').update({ wins }).eq('id', log.id);
    setDeleteWinConfirm({ open: false, index: null });
    fetchLog(currentDate);
  };

  const deleteBlocker = async (index: number) => {
    if (!log) return;
    const blockers = log.blockers.filter((_, i) => i !== index);
    await supabase.from('daily_log').update({ blockers }).eq('id', log.id);
    setDeleteBlockerConfirm({ open: false, index: null });
    fetchLog(currentDate);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Daily Log" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(format(subDays(new Date(currentDate), 1), 'yyyy-MM-dd'))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[120px] text-center">
            {format(new Date(currentDate), 'EEEE, MMM d')}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(format(addDays(new Date(currentDate), 1), 'yyyy-MM-dd'))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(format(new Date(), 'yyyy-MM-dd'))}>Today</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : (
        <div className="space-y-4">
          {/* Energy Level */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4 text-warning" />Energy Level</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(level => (
                  <button
                    key={level}
                    onClick={() => setForm({ ...form, energy: level })}
                    className={`flex h-12 w-12 items-center justify-center rounded-lg text-xl transition-colors ${
                      form.energy === level ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {energyEmojis[level]}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Wins */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Trophy className="h-4 w-4 text-success" />Wins</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(log?.wins ?? []).map((win, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-foreground group">
                    <span className="text-success">✓</span> 
                    <span className="flex-1">{win}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => setDeleteWinConfirm({ open: true, index: i })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <form onSubmit={e => { e.preventDefault(); addWin(); }} className="flex gap-2">
                  <Input value={newWin} onChange={e => setNewWin(e.target.value)} placeholder="Add a win..." className="flex-1" />
                  <Button type="submit" variant="secondary" size="sm" disabled={!newWin.trim()}><Plus className="h-4 w-4" /></Button>
                </form>
              </CardContent>
            </Card>

            {/* Blockers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><AlertCircle className="h-4 w-4 text-destructive" />Blockers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(log?.blockers ?? []).map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-foreground group">
                    <span className="text-destructive">•</span> 
                    <span className="flex-1">{b}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => setDeleteBlockerConfirm({ open: true, index: i })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <form onSubmit={e => { e.preventDefault(); addBlocker(); }} className="flex gap-2">
                  <Input value={newBlocker} onChange={e => setNewBlocker(e.target.value)} placeholder="Add a blocker..." className="flex-1" />
                  <Button type="submit" variant="secondary" size="sm" disabled={!newBlocker.trim()}><Plus className="h-4 w-4" /></Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={6}
                placeholder="What happened today? Reflections, learnings, thoughts..."
              />
              <Button onClick={saveLog} disabled={saving}>{saving ? 'Saving...' : 'Save Entry'}</Button>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={deleteWinConfirm.open}
        onOpenChange={(open) => setDeleteWinConfirm({ ...deleteWinConfirm, open })}
        title="Delete Win"
        description="Are you sure you want to delete this win?"
        onConfirm={() => deleteWin(deleteWinConfirm.index ?? 0)}
        variant="destructive"
      />

      <ConfirmDialog
        open={deleteBlockerConfirm.open}
        onOpenChange={(open) => setDeleteBlockerConfirm({ ...deleteBlockerConfirm, open })}
        title="Delete Blocker"
        description="Are you sure you want to delete this blocker?"
        onConfirm={() => deleteBlocker(deleteBlockerConfirm.index ?? 0)}
        variant="destructive"
      />
    </div>
  );
}
