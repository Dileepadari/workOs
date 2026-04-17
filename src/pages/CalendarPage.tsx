import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ChevronLeft, ChevronRight, CheckSquare, Flag, Calendar as CalIcon, Video, Plus, Pencil, Trash2, Clock, Sparkles, Download, Upload, RefreshCw, Link2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, isToday, addDays, parseISO } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { getCalendarIntegrations, syncCalendarEvents, parseICS as robustParseICS } from '@/integrations/calendar/sync';

interface CalEvent {
  id: string;
  realId: string;
  title: string;
  date: Date;
  type: 'task' | 'milestone' | 'meeting' | 'event';
  meta?: string;
  rawData?: any;
}

type ViewMode = 'month' | 'week' | 'agenda';

// ICS helpers
function escapeICS(str: string) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function formatICSDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function generateICS(events: CalEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WorkOS//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  events.forEach(ev => {
    const start = formatICSDate(ev.date);
    const end = formatICSDate(new Date(ev.date.getTime() + 60 * 60 * 1000));
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.realId}@workos`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${escapeICS(ev.title)}`);
    lines.push(`CATEGORIES:${ev.type.toUpperCase()}`);
    if (ev.rawData?.description) lines.push(`DESCRIPTION:${escapeICS(ev.rawData.description)}`);
    if (ev.rawData?.location) lines.push(`LOCATION:${escapeICS(ev.rawData.location)}`);
    if (ev.rawData?.attendees) lines.push(`ATTENDEE:${escapeICS(ev.rawData.attendees)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function parseICSForExport(content: string): { title: string; date: string; time: string; description: string; location: string }[] {
  const events: any[] = [];
  const blocks = content.split('BEGIN:VEVENT');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    const getField = (name: string) => {
      const match = block.match(new RegExp(`${name}[^:]*:(.+?)(?:\\r?\\n(?!\\s)|$)`, 's'));
      return match ? match[1].replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim() : '';
    };
    const dtstart = getField('DTSTART');
    let date = '', time = '';
    if (dtstart) {
      // Parse YYYYMMDDTHHMMSS or YYYYMMDD
      const clean = dtstart.replace(/Z$/, '');
      if (clean.length >= 8) {
        date = `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`;
        if (clean.length >= 13) {
          time = `${clean.slice(9,11)}:${clean.slice(11,13)}`;
        }
      }
    }
    events.push({
      title: getField('SUMMARY'),
      date,
      time,
      description: getField('DESCRIPTION'),
      location: getField('LOCATION'),
    });
  }
  return events.filter(e => e.title && e.date);
}

function generateGoogleCalLink(ev: CalEvent): string {
  const start = formatICSDate(ev.date);
  const end = formatICSDate(new Date(ev.date.getTime() + 60 * 60 * 1000));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${start}/${end}`,
  });
  if (ev.rawData?.description) params.set('details', ev.rawData.description);
  if (ev.rawData?.location) params.set('location', ev.rawData.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateOutlookLink(ev: CalEvent): string {
  const start = ev.date.toISOString();
  const end = new Date(ev.date.getTime() + 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    subject: ev.title,
    startdt: start,
    enddt: end,
    path: '/calendar/action/compose',
    rru: 'addevent',
  });
  if (ev.rawData?.description) params.set('body', ev.rawData.description);
  if (ev.rawData?.location) params.set('location', ev.rawData.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false); // Prevent concurrent loadEvents calls
  const lastLoadUserRef = useRef<string | null>(null); // Track last loaded user
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [eventForm, setEventForm] = useState({ title: '', type: 'task' as string, date: '', time: '', project_id: '', description: '', attendees: '', agenda: '', location: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<CalEvent | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(localStorage.getItem('workos_last_sync'));

  const loadEvents = useCallback(async () => {
    if (!user || loadingRef.current) return; // Skip if already loading
    
    loadingRef.current = true;
    try {
      const [tasksRes, msRes, meetRes, projRes, syncedRes, eventsRes] = await Promise.all([
      supabase.from('tasks').select('id, title, due_date, due_time, priority, project_id, status, time_estimate_min, description').eq('user_id', user.id).not('due_date', 'is', null),
      supabase.from('milestones').select('id, title, date, is_completed, project_id').eq('user_id', user.id),
      supabase.from('meetings').select('id, title, scheduled_at, attendees, agenda_html, notes_html, action_items, project_id').eq('user_id', user.id),
      supabase.from('projects').select('id, name').eq('user_id', user.id),
      supabase.from('synced_events').select('*').eq('user_id', user.id),
      supabase.from('events').select('id, title, scheduled_at, description, color, project_id').eq('user_id', user.id),
    ]);
    setProjects(projRes.data ?? []);
    const items: CalEvent[] = [];
    (tasksRes.data ?? []).forEach(t => {
      if (t.due_date) {
        const d = t.due_time ? new Date(`${t.due_date}T${t.due_time}`) : new Date(t.due_date);
        items.push({ id: `t-${t.id}`, realId: t.id, title: t.title, date: d, type: 'task', meta: t.priority, rawData: t });
      }
    });
    (msRes.data ?? []).forEach(m => {
      items.push({ id: `m-${m.id}`, realId: m.id, title: m.title, date: new Date(m.date), type: 'milestone', meta: m.is_completed ? 'done' : 'pending', rawData: m });
    });
    (meetRes.data ?? []).forEach(m => {
      items.push({ id: `mt-${m.id}`, realId: m.id, title: m.title, date: new Date(m.scheduled_at), type: 'meeting', rawData: m });
    });
    // Add general events
    (eventsRes.data ?? []).forEach(e => {
      items.push({ id: `e-${e.id}`, realId: e.id, title: e.title, date: new Date(e.scheduled_at), type: 'event', meta: e.color || '#3b82f6', rawData: e });
    });
    // Add synced events from external calendars
    (syncedRes.data ?? []).forEach((s: any) => {
      items.push({
        id: `sync-${s.id}`,
        realId: s.id,
        title: s.title,
        date: new Date(s.start_time),
        type: 'event',
        meta: `${s.provider} synced`,
        rawData: s,
      });
    });
    setEvents(items);
    setLoading(false);
    } finally {
      loadingRef.current = false; // Allow next load
    }
  }, [user]);

  useEffect(() => {
    // Only load if user changed to a different user
    if (user && lastLoadUserRef.current !== user.id) {
      lastLoadUserRef.current = user.id;
      loadEvents();
    }
  }, [loadEvents, user]);

  // Auto-sync on page load if last sync > 24h
  useEffect(() => {
    if (lastSync) {
      const diff = Date.now() - new Date(lastSync).getTime();
      if (diff > 24 * 60 * 60 * 1000) {
        handleSync();
      }
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      // First, sync external calendar integrations
      if (user?.id) {
        const integrations = await getCalendarIntegrations(user.id);
        const enabledIntegrations = integrations.filter((i: any) => i.sync_enabled);

        for (const integration of enabledIntegrations) {
          try {
            await syncCalendarEvents(integration.provider, integration.ics_url, user.id);
          } catch (error) {
            console.error(`Failed to sync ${integration.provider} calendar:`, error);
            // Continue with other integrations even if one fails
          }
        }

        if (enabledIntegrations.length > 0) {
          toast({
            title: 'External calendars synced',
            description: `Synced ${enabledIntegrations.length} calendar integration(s)`,
          });
        }
      }

      // Then load all events (internal + external)
      await loadEvents();
      const now = new Date().toISOString();
      localStorage.setItem('workos_last_sync', now);
      setLastSync(now);
      toast({ title: 'Calendar synced', description: `Last sync: ${format(new Date(), 'h:mm a')}` });
    } finally {
      setSyncing(false);
    }
  }, [user, toast, loadEvents]);

  const navigate = (dir: number) => {
    if (view === 'month') setCurrent(dir > 0 ? addMonths(current, 1) : subMonths(current, 1));
    else if (view === 'week') setCurrent(dir > 0 ? addWeeks(current, 1) : subWeeks(current, 1));
  };

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekStart = startOfWeek(current);
  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(current) });
  const agendaDays = eachDayOfInterval({ start: new Date(), end: addDays(new Date(), 30) });
  const getEventsForDay = (day: Date) => events.filter(e => isSameDay(e.date, day));

  const typeIcon = (type: string) => {
    if (type === 'task') return <CheckSquare className="h-3 w-3" />;
    if (type === 'milestone') return <Flag className="h-3 w-3" />;
    if (type === 'meeting') return <Video className="h-3 w-3" />;
    return <Sparkles className="h-3 w-3" />;
  };
  const typeColor = (type: string) => {
    if (type === 'task') return 'text-primary';
    if (type === 'milestone') return 'text-warning';
    if (type === 'meeting') return 'text-success';
    return 'text-accent';
  };

  const openAddDialog = (date?: Date) => {
    setEditMode(false);
    setEventForm({ title: '', type: 'task', date: format(date || new Date(), 'yyyy-MM-dd'), time: '', project_id: '', description: '', attendees: '', agenda: '', location: '' });
    setAddDialog(true);
  };

  const openEditDialog = (ev: CalEvent) => {
    setEditMode(true);
    const rd = ev.rawData || {};
    setEventForm({
      title: ev.title,
      type: ev.type,
      date: ev.type === 'meeting' ? format(ev.date, 'yyyy-MM-dd') : (rd.due_date || rd.date || format(ev.date, 'yyyy-MM-dd')),
      time: ev.type === 'task' ? (rd.due_time || '') : (ev.type === 'meeting' ? format(ev.date, 'HH:mm') : ''),
      project_id: rd.project_id || '',
      description: rd.description || '',
      attendees: rd.attendees || '',
      agenda: rd.agenda_html || '',
      location: rd.location || '',
    });
    setSelectedEvent(ev);
    setAddDialog(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (editMode && selectedEvent) {
      if (selectedEvent.type === 'task') {
        await supabase.from('tasks').update({
          title: eventForm.title, due_date: eventForm.date, due_time: eventForm.time || null,
          project_id: eventForm.project_id || null, description: eventForm.description || null,
        }).eq('id', selectedEvent.realId);
      } else if (selectedEvent.type === 'milestone') {
        await supabase.from('milestones').update({
          title: eventForm.title, date: eventForm.date, project_id: eventForm.project_id || undefined,
        }).eq('id', selectedEvent.realId);
      } else if (selectedEvent.type === 'meeting') {
        const scheduledAt = eventForm.time ? `${eventForm.date}T${eventForm.time}` : `${eventForm.date}T09:00`;
        await supabase.from('meetings').update({
          title: eventForm.title, scheduled_at: scheduledAt,
          project_id: eventForm.project_id || undefined,
          attendees: eventForm.attendees || null,
          agenda_html: eventForm.agenda || null,
        }).eq('id', selectedEvent.realId);
      }
      toast({ title: 'Event updated' });
    } else {
      if (eventForm.type === 'task') {
        await supabase.from('tasks').insert({
          title: eventForm.title, due_date: eventForm.date, due_time: eventForm.time || null,
          project_id: eventForm.project_id || null, user_id: user.id, status: 'todo', priority: 'medium',
          description: eventForm.description || null,
        });
      } else if (eventForm.type === 'milestone') {
        if (!eventForm.project_id) { toast({ title: 'Select a project for milestone', variant: 'destructive' }); return; }
        await supabase.from('milestones').insert({
          title: eventForm.title, date: eventForm.date, project_id: eventForm.project_id, user_id: user.id,
        });
      } else if (eventForm.type === 'meeting') {
        if (!eventForm.project_id) { toast({ title: 'Select a project for meeting', variant: 'destructive' }); return; }
        const scheduledAt = eventForm.time ? `${eventForm.date}T${eventForm.time}` : `${eventForm.date}T09:00`;
        await supabase.from('meetings').insert({
          title: eventForm.title, scheduled_at: scheduledAt, project_id: eventForm.project_id, user_id: user.id,
          attendees: eventForm.attendees || null, agenda_html: eventForm.agenda || null,
        });
      }
      toast({ title: 'Event added to calendar' });
    }
    setAddDialog(false);
    setSelectedEvent(null);
    setEditMode(false);
    await loadEvents();
  };

  const handleDeleteEvent = async (ev: CalEvent) => {
    if (ev.type === 'task') await supabase.from('tasks').delete().eq('id', ev.realId);
    else if (ev.type === 'milestone') await supabase.from('milestones').delete().eq('id', ev.realId);
    else if (ev.type === 'meeting') await supabase.from('meetings').delete().eq('id', ev.realId);
    toast({ title: 'Event deleted' });
    setDeleteConfirm(null);
    setSelectedEvent(null);
    await loadEvents();
  };

  // Export all events as ICS
  const handleExportICS = () => {
    const ics = generateICS(events);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workos-calendar-${format(new Date(), 'yyyy-MM-dd')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Calendar exported', description: `${events.length} events exported as .ics` });
  };

  // Import ICS file
  const handleImportICS = async (file: File) => {
    if (!user) return;
    try {
      const content = await file.text();
      // Use robust RFC 5545 compliant parser from sync.ts
      const parsed = robustParseICS(content);
      if (parsed.length === 0) {
        toast({ title: 'No events found in file', variant: 'destructive' });
        return;
      }

      // Fetch all existing events ONCE upfront (check all event sources)
      const [tasksRes, meetingsRes, eventsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('title, due_date, due_time')
          .eq('user_id', user.id)
          .not('due_date', 'is', null),
        supabase
          .from('meetings')
          .select('title, scheduled_at')
          .eq('user_id', user.id),
        supabase
          .from('events')
          .select('title, scheduled_at')
          .eq('user_id', user.id),
      ]);

      const existingTitles = new Set<string>();
      
      // Add existing tasks
      tasksRes.data?.forEach(t => {
        const dateStr = t.due_time 
          ? `${t.due_date}T${t.due_time}`.slice(0, 16)
          : t.due_date;
        existingTitles.add(`${t.title.toLowerCase()}|${dateStr}`);
      });

      // Add existing meetings
      meetingsRes.data?.forEach(m => {
        const dateStr = new Date(m.scheduled_at).toISOString().slice(0, 16);
        existingTitles.add(`${m.title.toLowerCase()}|${dateStr}`);
      });

      // Add existing events
      eventsRes.data?.forEach(e => {
        const dateStr = new Date(e.scheduled_at).toISOString().slice(0, 16);
        existingTitles.add(`${e.title.toLowerCase()}|${dateStr}`);
      });

      let imported = 0;
      let duplicates = 0;
      const eventsToInsert: any[] = [];

      // Check all events locally against existing events
      for (const ev of parsed) {
        const scheduledAt = ev.dtstart.toISOString();
        const dateStr = scheduledAt.slice(0, 16); // YYYY-MM-DDTHH:mm
        const key = `${ev.summary.toLowerCase()}|${dateStr}`;

        if (existingTitles.has(key)) {
          duplicates++;
          continue;
        }

        // Collect events to insert into events table
        eventsToInsert.push({
          title: ev.summary,
          scheduled_at: scheduledAt,
          project_id: projects[0]?.id || null,
          user_id: user.id,
          description: ev.description || null,
          location: ev.location || null,
          color: '#3b82f6',
        });
        
        // Add to existing titles to prevent duplicates within THIS import
        existingTitles.add(key);
      }

      // Insert all new events in one batch
      if (eventsToInsert.length > 0) {
        const { error } = await supabase.from('events').insert(eventsToInsert);
        if (!error) {
          imported = eventsToInsert.length;
        } else {
          console.error('Error importing events:', error);
          toast({ 
            title: 'Import failed', 
            description: error.message,
            variant: 'destructive'
          });
          return;
        }
      }
      
      const message = duplicates > 0 
        ? `Imported ${imported} events (${duplicates} duplicates skipped)`
        : `Imported ${imported} events`;
      
      toast({ title: message });
      await loadEvents();
    } catch (error) {
      console.error('Error importing ICS file:', error);
      toast({ 
        title: 'Import failed', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    }
  };

  // Add single event to Google/Outlook
  const addToGoogle = (ev: CalEvent) => {
    window.open(generateGoogleCalLink(ev), '_blank');
  };
  const addToOutlook = (ev: CalEvent) => {
    window.open(generateOutlookLink(ev), '_blank');
  };
  const downloadSingleICS = (ev: CalEvent) => {
    const ics = generateICS([ev]);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const projectName = (pid: string) => projects.find(p => p.id === pid)?.name || '';

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title="Calendar" />
      <input ref={fileInputRef} type="file" accept=".ics,.ical,.ifb,.icalendar" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImportICS(e.target.files[0]); e.target.value = ''; }} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => openAddDialog()}>
            <Plus className="mr-1 h-3.5 w-3.5" />Add Event
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><Download className="mr-1 h-3.5 w-3.5" />Import / Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />Import .ics file
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportICS}>
                <Download className="mr-2 h-4 w-4" />Export all as .ics
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
          {lastSync && <span className="text-xs text-muted-foreground">Last sync: {format(new Date(lastSync), 'MMM d, h:mm a')}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border">
            {(['month', 'week', 'agenda'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {v}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {view === 'month' ? format(current, 'MMMM yyyy') : view === 'week' ? `Week of ${format(weekStart, 'MMM d')}` : 'Next 30 Days'}
          </span>
          <Button variant="ghost" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrent(new Date())}>Today</Button>
        </div>
      </div>

      {/* Month View */}
      {view === 'month' && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map(day => {
              const dayEvents = getEventsForDay(day);
              return (
                <div key={day.toISOString()} onClick={() => openAddDialog(day)} className={`min-h-[80px] sm:min-h-[100px] border-b border-r border-border p-1 sm:p-2 cursor-pointer hover:bg-muted/20 ${!isSameMonth(day, current) ? 'bg-muted/10' : ''} ${isToday(day) ? 'bg-primary/5' : ''}`}>
                  <span className={`text-xs ${isToday(day) ? 'rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground font-bold' : isSameMonth(day, current) ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {format(day, 'd')}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map(e => (
                      <button key={e.id} onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] sm:text-xs truncate w-full text-left hover:bg-muted/50 ${typeColor(e.type)}`}>
                        {typeIcon(e.type)}
                        <span className="truncate">{e.title}</span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {weekDays.map(day => {
            const dayEvents = getEventsForDay(day);
            return (
              <Card key={day.toISOString()} className={`cursor-pointer ${isToday(day) ? 'border-primary/50' : ''}`} onClick={() => openAddDialog(day)}>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className={`text-xs ${isToday(day) ? 'text-primary' : 'text-muted-foreground'}`}>{format(day, 'EEE d')}</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-1">
                  {dayEvents.map(e => (
                    <button key={e.id} onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }} className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs w-full text-left ${typeColor(e.type)} bg-muted/30 hover:bg-muted/60`}>
                      {typeIcon(e.type)}
                      <span className="truncate">{e.title}</span>
                    </button>
                  ))}
                  {dayEvents.length === 0 && <p className="text-xs text-muted-foreground/50 text-center py-2">-</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Agenda View */}
      {view === 'agenda' && (
        <div className="space-y-1">
          {agendaDays.map(day => {
            const dayEvents = getEventsForDay(day);
            if (dayEvents.length === 0) return null;
            return (
              <div key={day.toISOString()} className="flex gap-4 rounded-md px-4 py-2 hover:bg-muted/30">
                <div className="w-20 shrink-0">
                  <p className={`text-sm font-medium ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>{format(day, 'MMM d')}</p>
                  <p className="text-xs text-muted-foreground">{format(day, 'EEEE')}</p>
                </div>
                <div className="flex-1 space-y-1">
                  {dayEvents.map(e => (
                    <button key={e.id} onClick={() => setSelectedEvent(e)} className={`flex items-center gap-2 text-sm w-full text-left hover:underline ${typeColor(e.type)}`}>
                      {typeIcon(e.type)}
                      <span>{e.title}</span>
                      {e.type === 'meeting' && <span className="text-xs text-muted-foreground">{format(e.date, 'h:mm a')}</span>}
                      {e.rawData?.due_time && <span className="text-xs text-muted-foreground">{e.rawData.due_time}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><CheckSquare className="h-3 w-3 text-primary" /> Tasks</span>
        <span className="flex items-center gap-1"><Flag className="h-3 w-3 text-warning" /> Milestones</span>
        <span className="flex items-center gap-1"><Video className="h-3 w-3 text-success" /> Meetings</span>
        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-accent" /> Events</span>
      </div>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent && !addDialog} onOpenChange={(v) => !v && setSelectedEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEvent && typeIcon(selectedEvent.type)}
              {selectedEvent?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{selectedEvent.type}</Badge>
                <span className="text-sm text-muted-foreground">{format(selectedEvent.date, 'EEEE, MMMM d, yyyy')}</span>
                {(selectedEvent.type === 'meeting' || selectedEvent.rawData?.due_time) && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {selectedEvent.type === 'meeting' ? format(selectedEvent.date, 'h:mm a') : selectedEvent.rawData?.due_time}
                  </span>
                )}
              </div>
              {selectedEvent.type === 'task' && selectedEvent.rawData && (
                <div className="space-y-2 text-sm">
                  <div className="flex gap-4"><span className="text-muted-foreground">Status:</span><Badge variant="secondary" className="capitalize">{selectedEvent.rawData.status}</Badge></div>
                  <div className="flex gap-4"><span className="text-muted-foreground">Priority:</span><Badge variant="secondary" className="capitalize">{selectedEvent.rawData.priority}</Badge></div>
                  {selectedEvent.rawData.due_time && <div className="flex gap-4"><span className="text-muted-foreground">Time:</span><span>{selectedEvent.rawData.due_time}</span></div>}
                  {selectedEvent.rawData.time_estimate_min && <div className="flex gap-4"><span className="text-muted-foreground">Estimate:</span><span>{selectedEvent.rawData.time_estimate_min} min</span></div>}
                  {selectedEvent.rawData.description && <div><span className="text-muted-foreground">Description:</span><p className="mt-1 text-xs text-foreground">{selectedEvent.rawData.description}</p></div>}
                  {selectedEvent.rawData.project_id && <div className="flex gap-4"><span className="text-muted-foreground">Project:</span><span>{projectName(selectedEvent.rawData.project_id)}</span></div>}
                </div>
              )}
              {selectedEvent.type === 'milestone' && selectedEvent.rawData && (
                <div className="space-y-2 text-sm">
                  <div className="flex gap-4"><span className="text-muted-foreground">Status:</span><Badge variant={selectedEvent.rawData.is_completed ? 'default' : 'secondary'}>{selectedEvent.rawData.is_completed ? 'Completed' : 'Pending'}</Badge></div>
                  {selectedEvent.rawData.project_id && <div className="flex gap-4"><span className="text-muted-foreground">Project:</span><span>{projectName(selectedEvent.rawData.project_id)}</span></div>}
                </div>
              )}
              {selectedEvent.type === 'meeting' && selectedEvent.rawData && (
                <div className="space-y-2 text-sm">
                  <div className="flex gap-4"><span className="text-muted-foreground">Time:</span><span>{format(selectedEvent.date, 'h:mm a')}</span></div>
                  {selectedEvent.rawData.attendees && <div className="flex gap-4"><span className="text-muted-foreground">Attendees:</span><span>{selectedEvent.rawData.attendees}</span></div>}
                  {selectedEvent.rawData.agenda_html && <div><span className="text-muted-foreground">Agenda:</span><div className="mt-1 rounded bg-muted/50 p-2 text-xs" dangerouslySetInnerHTML={{ __html: selectedEvent.rawData.agenda_html }} /></div>}
                  {selectedEvent.rawData.notes_html && <div><span className="text-muted-foreground">Notes:</span><div className="mt-1 rounded bg-muted/50 p-2 text-xs" dangerouslySetInnerHTML={{ __html: selectedEvent.rawData.notes_html }} /></div>}
                  {selectedEvent.rawData.project_id && <div className="flex gap-4"><span className="text-muted-foreground">Project:</span><span>{projectName(selectedEvent.rawData.project_id)}</span></div>}
                </div>
              )}
              {/* Add to external calendar */}
              <div className="flex gap-2 flex-wrap border-t border-border pt-3">
                <span className="text-xs text-muted-foreground self-center">Add to:</span>
                <Button variant="outline" size="sm" onClick={() => addToGoogle(selectedEvent)}>
                  <Link2 className="mr-1 h-3 w-3" />Google Calendar
                </Button>
                <Button variant="outline" size="sm" onClick={() => addToOutlook(selectedEvent)}>
                  <Link2 className="mr-1 h-3 w-3" />Outlook
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadSingleICS(selectedEvent)}>
                  <Download className="mr-1 h-3 w-3" />.ics
                </Button>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => { openEditDialog(selectedEvent); }}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(selectedEvent)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Event Modal */}
      <Dialog open={addDialog} onOpenChange={(v) => { if (!v) { setAddDialog(false); setEditMode(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editMode ? 'Edit Event' : 'Add Calendar Event'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveEvent} className="space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={eventForm.type} onValueChange={v => setEventForm({ ...eventForm, type: v })} disabled={editMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={eventForm.project_id} onValueChange={v => setEventForm({ ...eventForm, project_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Time</Label><Input type="time" value={eventForm.time} onChange={e => setEventForm({ ...eventForm, time: e.target.value })} /></div>
            </div>
            {(eventForm.type === 'task') && (
              <div className="space-y-2"><Label>Description</Label><Textarea value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} rows={2} /></div>
            )}
            {eventForm.type === 'meeting' && (
              <>
                <div className="space-y-2"><Label>Attendees</Label><Input value={eventForm.attendees} onChange={e => setEventForm({ ...eventForm, attendees: e.target.value })} placeholder="e.g. John, Jane" /></div>
                <div className="space-y-2"><Label>Agenda</Label><Textarea value={eventForm.agenda} onChange={e => setEventForm({ ...eventForm, agenda: e.target.value })} rows={2} /></div>
              </>
            )}
            <Button type="submit" className="w-full">{editMode ? 'Save Changes' : 'Add to Calendar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Event</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete "{deleteConfirm?.title}"? This cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDeleteEvent(deleteConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
