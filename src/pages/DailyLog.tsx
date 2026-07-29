import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Zap, AlertCircle, Trophy, Trash2, ListTodo, Flag, CheckCircle2 } from 'lucide-react';
import { format, addDays, subDays, isSameDay, startOfWeek } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { legacyTextToBlocks } from '@/lib/blockContent';
import { PRIORITY_COLORS } from '@/lib/taskMeta';

interface DailyLog {
  id: string; date: string; notes_html: string | null;
  content_json: unknown; content_text: string | null;
  energy_level: number | null; wins: string[]; blockers: string[];
}

interface TodayItem {
  id: string;
  title: string;
  type: 'task' | 'milestone';
  time?: string;
  priority?: string;
}

interface TaskRow { id: string; title: string; due_date: string | null; due_time: string | null; priority: string; status: string; }
interface MilestoneRow { id: string; title: string; date: string; is_completed: boolean; }

const ENERGY_OPACITY = ['', 'opacity-30', 'opacity-50', 'opacity-70', 'opacity-90', 'opacity-100'];
const ENERGY_LABELS = ['', 'Drained', 'Low', 'Okay', 'Good', 'Energized'];

export default function DailyLogPage() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [currentDate, setCurrentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ energy: 4, wins: '', blockers: '' });
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());
  const [pendingContent, setPendingContent] = useState<{ blocks: unknown[]; text: string } | null>(null);
  const [newWin, setNewWin] = useState('');
  const [newBlocker, setNewBlocker] = useState('');
  const [deleteWinConfirm, setDeleteWinConfirm] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [deleteBlockerConfirm, setDeleteBlockerConfirm] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
  const [weekLogDates, setWeekLogDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !wsId) return;
    api.select<{ date: string }>('daily_log', wsId).then(rows => setWeekLogDates(new Set(rows.map(r => r.date))));
  }, [user, wsId, currentDate]);

  const fetchLog = async (date: string) => {
    if (!wsId) return;
    setLoading(true);
    const [logRows, taskRows, milestoneRows] = await Promise.all([
      api.select<DailyLog>('daily_log', wsId, { date }),
      api.select<TaskRow>('tasks', wsId, { due_date: date }),
      api.select<MilestoneRow>('milestones', wsId, { date }),
    ]);

    const data = logRows[0] ?? null;
    setLog(data);
    if (data) {
      setForm({ energy: data.energy_level ?? 4, wins: '', blockers: '' });
      setDraftId(data.id);
    } else {
      setForm({ energy: 4, wins: '', blockers: '' });
      setDraftId(crypto.randomUUID());
    }
    setPendingContent(null);

    const items: TodayItem[] = [];
    taskRows.forEach(t => {
      items.push({ id: t.id, title: t.title, type: 'task', time: t.due_time || undefined, priority: t.priority });
    });
    milestoneRows.forEach(m => {
      items.push({ id: m.id, title: m.title, type: 'milestone' });
    });
    setTodayItems(items);
    setLoading(false);
  };

  useEffect(() => { if (user && wsId) fetchLog(currentDate); }, [user, wsId, currentDate]);

  const saveLog = async () => {
    if (!wsId) return;
    setSaving(true);
    const content_json = pendingContent?.blocks ?? (log?.content_json ?? legacyTextToBlocks(log?.notes_html));
    const content_text = pendingContent?.text ?? log?.content_text ?? '';
    const payload = {
      date: currentDate,
      content_json, content_text,
      energy_level: form.energy,
      wins: log?.wins ?? [],
      blockers: log?.blockers ?? [],
    };
    if (log) {
      await api.update('daily_log', wsId, log.id, payload);
    } else {
      await api.insert('daily_log', wsId, { id: draftId, ...payload });
    }
    await fetchLog(currentDate);
    setSaving(false);
  };

  const addWin = async () => {
    if (!newWin.trim() || !wsId) return;
    const wins = [...(log?.wins ?? []), newWin.trim()];
    if (log) {
      await api.update('daily_log', wsId, log.id, { wins });
    } else {
      await api.insert('daily_log', wsId, { date: currentDate, wins, energy_level: form.energy });
    }
    setNewWin('');
    fetchLog(currentDate);
  };

  const addBlocker = async () => {
    if (!newBlocker.trim() || !wsId) return;
    const blockers = [...(log?.blockers ?? []), newBlocker.trim()];
    if (log) {
      await api.update('daily_log', wsId, log.id, { blockers });
    } else {
      await api.insert('daily_log', wsId, { date: currentDate, blockers, energy_level: form.energy });
    }
    setNewBlocker('');
    fetchLog(currentDate);
  };

  const deleteWin = async (index: number) => {
    if (!log || !wsId) return;
    const wins = log.wins.filter((_, i) => i !== index);
    await api.update('daily_log', wsId, log.id, { wins });
    setDeleteWinConfirm({ open: false, index: null });
    fetchLog(currentDate);
  };

  const deleteBlocker = async (index: number) => {
    if (!log || !wsId) return;
    const blockers = log.blockers.filter((_, i) => i !== index);
    await api.update('daily_log', wsId, log.id, { blockers });
    setDeleteBlockerConfirm({ open: false, index: null });
    fetchLog(currentDate);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Daily Log" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(format(subDays(new Date(currentDate), 1), 'yyyy-MM-dd'))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[140px] text-center">
            {format(new Date(currentDate), 'EEEE, MMM d')}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(format(addDays(new Date(currentDate), 1), 'yyyy-MM-dd'))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(format(new Date(), 'yyyy-MM-dd'))}>Today</Button>
        </div>

        {/* Week strip - quick nav across the current week with entry indicators */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(currentDate)), i)).map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const isSelected = dayStr === currentDate;
            const hasEntry = weekLogDates.has(dayStr);
            const isToday = isSameDay(day, new Date());
            return (
              <button
                key={dayStr}
                onClick={() => setCurrentDate(dayStr)}
                className={`flex h-14 w-11 flex-col items-center justify-center gap-1 rounded-lg text-xs transition-colors ${
                  isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className="font-medium">{format(day, 'EEEEE')}</span>
                <span className="text-sm font-semibold">{format(day, 'd')}</span>
                <span className={`h-1 w-1 rounded-full ${hasEntry ? (isSelected ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-4 lg:col-span-2">
            {/* Today's Schedule - auto-populated from tasks/milestones */}
            {todayItems.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm"><ListTodo className="h-4 w-4 text-primary" />Today's Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {todayItems.map((item, index) => (
                    <div key={item.id} className="animate-fade-in flex items-center gap-3 text-sm rounded-md p-2 bg-muted/30" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }} title={item.type === 'task' ? 'Task' : 'Milestone'}>
                      {item.type === 'task' ? (
                        <ListTodo className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <Flag className="h-3.5 w-3.5 text-warning shrink-0" />
                      )}
                      <span className="text-foreground flex-1">{item.title}</span>
                      {item.time && (
                        <span className="text-xs text-muted-foreground">{item.time}</span>
                      )}
                      {item.priority && (
                        <Badge className={`text-xs capitalize ${PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] ?? ''}`}>{item.priority}</Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {wsId && draftId && (
                  <BlockEditor
                    key={draftId}
                    content={log?.content_json ?? legacyTextToBlocks(log?.notes_html)}
                    onChange={(blocks, text) => setPendingContent({ blocks, text })}
                    workspaceId={wsId}
                    entityType="daily_log"
                    entityId={draftId}
                    className="min-h-[340px] rounded-md border border-border"
                  />
                )}
                <Button onClick={saveLog} disabled={saving}>{saving ? 'Saving...' : 'Save Entry'}</Button>
              </CardContent>
            </Card>
          </div>

          {/* Side column */}
          <div className="space-y-4">
            {/* Energy Level */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4 text-warning" />Energy Level</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between gap-2">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setForm({ ...form, energy: level })}
                      title={ENERGY_LABELS[level]}
                      className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                        form.energy === level ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      <Zap className={`h-5 w-5 text-warning ${ENERGY_OPACITY[level]}`} fill="currentColor" />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">{ENERGY_LABELS[form.energy]}</p>
              </CardContent>
            </Card>

            {/* Wins */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Trophy className="h-4 w-4 text-success" />Wins</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(log?.wins ?? []).map((win, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-foreground group">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span className="flex-1">{win}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => setDeleteWinConfirm({ open: true, index: i })}>
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
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => setDeleteBlockerConfirm({ open: true, index: i })}>
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
