import { useEffect, useState } from 'react';
import { api, notifications as notificationsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Bell, AlertTriangle, Calendar, Flag, X, AtSign, UserPlus, MessageSquare, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isBefore, startOfToday, addHours, isWithinInterval } from 'date-fns';
import { useNavigate } from 'react-router-dom';

type ReminderType = 'overdue' | 'meeting' | 'milestone';
type RealType = 'mention' | 'assignment' | 'comment_reply' | 'invite';

interface ReminderItem {
  kind: 'reminder';
  id: string;
  type: ReminderType;
  title: string;
  subtitle?: string;
}

interface RealItem {
  kind: 'real';
  id: string;
  type: RealType;
  title: string;
  subtitle?: string;
  link: string | null;
  read: boolean;
}

type Item = ReminderItem | RealItem;

const REMINDER_ICONS: Record<ReminderType, React.ReactNode> = {
  overdue: <AlertTriangle className="h-4 w-4 text-destructive" />,
  meeting: <Calendar className="h-4 w-4 text-primary" />,
  milestone: <Flag className="h-4 w-4 text-warning" />,
};

const REAL_ICONS: Record<RealType, React.ReactNode> = {
  mention: <AtSign className="h-4 w-4 text-primary" />,
  assignment: <UserPlus className="h-4 w-4 text-primary" />,
  comment_reply: <MessageSquare className="h-4 w-4 text-primary" />,
  invite: <Mail className="h-4 w-4 text-primary" />,
};

export function NotificationCenter() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [realItems, setRealItems] = useState<RealItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !currentWorkspace) return;
    const wsId = currentWorkspace.id;

    const fetchReminders = async () => {
      const today = startOfToday();
      const twoHoursFromNow = addHours(new Date(), 2);
      const items: ReminderItem[] = [];

      const [allTasks, allMeetings, allMilestones] = await Promise.all([
        api.select<{ id: string; title: string; due_date: string | null; project_id: string | null; status: string }>('tasks', wsId),
        api.select<{ id: string; title: string; scheduled_at: string; project_id: string | null }>('meetings', wsId),
        api.select<{ id: string; title: string; date: string; project_id: string | null; is_completed: boolean }>('milestones', wsId),
      ]);

      const tasks = allTasks.filter(t => t.status !== 'done' && t.due_date != null);
      const meetings = allMeetings.filter(m => new Date(m.scheduled_at).getTime() >= Date.now());
      const milestones = allMilestones.filter(m => !m.is_completed);

      tasks.forEach(t => {
        if (t.due_date && isBefore(new Date(t.due_date), today)) {
          items.push({ kind: 'reminder', id: `overdue-${t.id}`, type: 'overdue', title: t.title, subtitle: `Due ${format(new Date(t.due_date), 'MMM d')}` });
        }
      });
      meetings.forEach(m => {
        const mDate = new Date(m.scheduled_at);
        if (isWithinInterval(mDate, { start: new Date(), end: twoHoursFromNow })) {
          items.push({ kind: 'reminder', id: `meeting-${m.id}`, type: 'meeting', title: m.title, subtitle: `In ${Math.round((mDate.getTime() - Date.now()) / 60000)} min` });
        }
      });
      milestones.forEach(m => {
        const mDate = new Date(m.date);
        if (isWithinInterval(mDate, { start: today, end: addHours(today, 72) })) {
          items.push({ kind: 'reminder', id: `ms-${m.id}`, type: 'milestone', title: m.title, subtitle: format(mDate, 'MMM d') });
        }
      });

      setReminders(items);
    };

    const fetchReal = async () => {
      const rows = await notificationsApi.list(wsId);
      setRealItems(rows.map(r => ({ kind: 'real', id: r.id, type: r.type, title: r.title, subtitle: r.body ?? undefined, link: r.link, read: r.read_at != null })));
    };

    const fetchAll = () => { fetchReminders(); fetchReal(); };
    fetchAll();
    const interval = setInterval(fetchAll, 20000); // real notifications poll more often - no live realtime channel in this auth model
    return () => clearInterval(interval);
  }, [user, currentWorkspace]);

  const activeReminders = reminders.filter(n => !dismissed.has(n.id));
  const unreadReal = realItems.filter(n => !n.read);
  const allItems: Item[] = [...unreadReal, ...activeReminders];
  const overdueCount = activeReminders.filter(n => n.type === 'overdue').length;

  const handleRealClick = async (item: RealItem) => {
    if (!item.read) {
      setRealItems(prev => prev.map(r => (r.id === item.id ? { ...r, read: true } : r)));
      await notificationsApi.markRead(item.id);
    }
    if (item.link) navigate(item.link);
  };

  const dismissReminder = (id: string) => setDismissed(prev => new Set([...prev, id]));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {allItems.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
              {allItems.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          {overdueCount > 0 && (
            <p className="text-xs text-destructive">{overdueCount} overdue task{overdueCount > 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {allItems.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">All caught up!</p>
          ) : (
            allItems.map(item => (
              <div
                key={item.id}
                className={`flex items-start gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/30 ${item.kind === 'real' ? 'cursor-pointer' : ''}`}
                onClick={item.kind === 'real' ? () => handleRealClick(item) : undefined}
              >
                <div className="mt-0.5">{item.kind === 'real' ? REAL_ICONS[item.type] : REMINDER_ICONS[item.type]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{item.title}</p>
                  {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
                </div>
                {item.kind === 'reminder' && (
                  <button onClick={() => dismissReminder(item.id)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
