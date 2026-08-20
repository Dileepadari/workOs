import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { useCreate, useFocusSessions, type FocusSessionRow } from '@/hooks/useWorkData';
import { isSameDay, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Pause, RotateCcw, CheckSquare, Settings, Volume2, VolumeX, Timer, Flame, Clock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Task { id: string; title: string; status: string; priority: string; project_id: string | null; }
interface Project { id: string; name: string; color: string; }

const BEEP_FREQUENCY = 800;
const BEEP_DURATION = 200;

function playBeep(count = 3) {
  try {
    // Safari only exposes the prefixed constructor.
    const AudioContextCtor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = BEEP_FREQUENCY;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      const start = ctx.currentTime + i * 0.35;
      osc.start(start);
      osc.stop(start + BEEP_DURATION / 1000);
    }
  } catch {
    // No Web Audio support, or autoplay blocked - the timer still works
    // without the chime, so there's nothing useful to do here.
  }
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

/** Radix Select reserves the empty string, so "nothing selected" needs a
 *  value of its own. Never stored - it maps back to '' before use. */
const NO_TASK = '__none__';

export default function FocusMode() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isBreak, setIsBreak] = useState(false);
  // Sessions used to be a number in React state, so a refresh threw the whole
  // day away and nothing ever reached the database. They are rows now, which
  // is also what lets focus minutes appear on a day page.
  const { data: allSessions = [] } = useFocusSessions();
  const logSession = useCreate<FocusSessionRow>('focus_sessions');
  const startedAtRef = useRef<string | null>(null);
  const [interruptions, setInterruptions] = useState(0);
  /**
   * Whether the block currently on screen has already been written.
   *
   * The completion effect below depends on a callback that depends on the
   * mutation object, and `useMutation` hands back a fresh object every render -
   * so the effect re-ran constantly, and while `timeLeft` was 0 and the
   * `setIsRunning(false)` from the first run had not yet committed, it fired a
   * second time. Every finished session was written twice, which doubled both
   * the count and the minutes. A ref settles it before the next render can.
   */
  const loggedRef = useRef(false);
  // Held in a ref so its changing identity cannot re-trigger the effect.
  const logSessionRef = useRef(logSession);
  logSessionRef.current = logSession;
  const [completeTaskConfirm, setCompleteTaskConfirm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!user || !wsId) return;
    const load = async () => {
      const [t, p] = await Promise.all([
        api.select<Task>('tasks', wsId),
        api.select<Project>('projects', wsId),
      ]);
      setTasks(t.filter(task => task.status !== 'done'));
      setProjects(p);
    };
    load();
  }, [user, wsId]);

  const handleTimerComplete = useCallback(() => {
    if (!isBreak) {
      if (loggedRef.current) return;
      loggedRef.current = true;
      // Record the block before resetting anything - a finished session is a
      // fact, and losing it because the tab closed a second later is the bug
      // this replaced.
      const startedAt = startedAtRef.current ?? new Date(Date.now() - focusDuration * 60_000).toISOString();
      logSessionRef.current.mutate({
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        planned_minutes: focusDuration,
        actual_minutes: focusDuration,
        task_id: selectedTask || null,
        project_id: tasks.find(t => t.id === selectedTask)?.project_id ?? null,
        was_break: false,
        interruptions,
        completed: true,
      });
      startedAtRef.current = null;
      setInterruptions(0);
      if (soundEnabled) playBeep(3);
      sendNotification('Focus session complete!', 'Time for a break.');
      setIsBreak(true);
      setTimeLeft(breakDuration * 60);
    } else {
      if (soundEnabled) playBeep(2);
      sendNotification('Break over!', 'Ready for another focus session?');
      setIsBreak(false);
      setTimeLeft(focusDuration * 60);
    }
    setIsRunning(false);
  }, [isBreak, breakDuration, focusDuration, soundEnabled, interruptions, selectedTask, tasks]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && isRunning) {
      handleTimerComplete();
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, timeLeft, handleTimerComplete]);

  const toggleTimer = () => {
    if (!isRunning && !isBreak && !startedAtRef.current) {
      startedAtRef.current = new Date().toISOString();
      loggedRef.current = false;
    }
    setIsRunning(!isRunning);
  };
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(isBreak ? breakDuration * 60 : focusDuration * 60);
    startedAtRef.current = null;
    loggedRef.current = false;
  };

  const applySettings = () => {
    if (!isRunning) {
      setTimeLeft(isBreak ? breakDuration * 60 : focusDuration * 60);
    }
    setSettingsOpen(false);
  };

  const completeTask = async () => {
    if (!selectedTask || !wsId) return;
    await api.update('tasks', wsId, selectedTask, { status: 'done' });
    setTasks(prev => prev.filter(t => t.id !== selectedTask));
    setSelectedTask('');
    setCompleteTaskConfirm(false);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const todaySessions = allSessions.filter(
    (x) => !x.was_break && isSameDay(parseISO(x.started_at), new Date()),
  );
  const sessions = todaySessions.length;
  const focusedMinutes = todaySessions.reduce((a, x) => a + (x.actual_minutes || 0), 0);
  const totalSecs = isBreak ? breakDuration * 60 : focusDuration * 60;
  const pct = ((totalSecs - timeLeft) / totalSecs) * 100;
  const currentTask = tasks.find(t => t.id === selectedTask);
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Focus Mode" subtitle={sessions ? `${sessions} ${sessions === 1 ? "block" : "blocks"} today, ${focusedMinutes}m focused` : "Nothing logged today. One block is enough to start the record."} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Timer column */}
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col items-center justify-center gap-8 py-12">
            {/* Task selector */}
            <div className="w-full max-w-md">
              {/* Picking a task used to be a one-way door: the list held only
                  tasks, and Radix will not accept an empty string as an item
                  value, so there was no way back to an untethered block once
                  you had chosen one. NO_TASK is that way back. */}
              <Select
                value={selectedTask || NO_TASK}
                onValueChange={(v) => setSelectedTask(v === NO_TASK ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a task to focus on..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TASK}>No task - just focus</SelectItem>
                  {tasks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                      {t.project_id && projectMap[t.project_id] && ` · ${projectMap[t.project_id].name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timer */}
            <div className="relative flex h-60 w-60 items-center justify-center">
              <svg className="absolute inset-0" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                <circle cx="100" cy="100" r="90" fill="none" stroke={isBreak ? 'hsl(var(--success))' : 'hsl(var(--primary))'} strokeWidth="6" strokeDasharray={`${2 * Math.PI * 90}`} strokeDashoffset={`${2 * Math.PI * 90 * (1 - pct / 100)}`} strokeLinecap="round" transform="rotate(-90 100 100)" className="transition-all duration-1000" />
              </svg>
              <div className="text-center">
                <p className="font-mono text-5xl font-bold text-foreground">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</p>
                <p className="text-xs text-muted-foreground mt-1">{isBreak ? 'Break Time' : 'Focus Time'}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={resetTimer}><RotateCcw className="h-4 w-4" /></Button>
              <Button size="lg" onClick={toggleTimer} className="h-14 w-14 rounded-full">
                {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? 'Mute sound' : 'Enable sound'}>
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} title="Timer settings">
                <Settings className="h-4 w-4" />
              </Button>
              {selectedTask && (
                <Button variant="outline" size="icon" onClick={() => setCompleteTaskConfirm(true)} title="Mark task complete">
                  <CheckSquare className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Current task info */}
            {currentTask && (
              <div className="w-full max-w-md rounded-lg border border-border p-4 text-center">
                <p className="text-sm font-medium text-foreground">{currentTask.title}</p>
                {currentTask.project_id && projectMap[currentTask.project_id] && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    <span className="mr-1 h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: projectMap[currentTask.project_id].color }} />
                    {projectMap[currentTask.project_id].name}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Side column: session stats + up-next tasks */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="flex flex-col items-center gap-1.5 p-4 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Timer className="h-4.5 w-4.5 text-primary" /></div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{sessions}</p>
                <p className="text-xs text-muted-foreground">Sessions today</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center gap-1.5 p-4 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10"><Clock className="h-4.5 w-4.5 text-success" /></div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{focusedMinutes}m</p>
                <p className="text-xs text-muted-foreground">Focused time</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Flame className="h-4 w-4 text-warning" />
                <p className="text-sm font-semibold text-foreground">Up Next</p>
              </div>
              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open tasks - enjoy the quiet.</p>
              ) : (
                <div className="space-y-1.5">
                  {tasks.slice(0, 6).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTask(t.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                        selectedTask === t.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.project_id && projectMap[t.project_id] && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: projectMap[t.project_id].color }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Timer Settings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Focus Duration (minutes)</Label>
              <Input type="number" min={1} max={120} value={focusDuration} onChange={e => setFocusDuration(Number(e.target.value) || 25)} />
            </div>
            <div className="space-y-2">
              <Label>Break Duration (minutes)</Label>
              <Input type="number" min={1} max={60} value={breakDuration} onChange={e => setBreakDuration(Number(e.target.value) || 5)} />
            </div>
            <div className="flex gap-2">
              {[15, 25, 45, 60].map(d => (
                <Button key={d} variant={focusDuration === d ? 'default' : 'outline'} size="sm" onClick={() => setFocusDuration(d)}>{d}m</Button>
              ))}
            </div>
            <Button onClick={applySettings} className="w-full">Apply</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={completeTaskConfirm}
        onOpenChange={setCompleteTaskConfirm}
        title="Mark Task Complete"
        description={`Are you sure you want to mark "${currentTask?.title}" as complete?`}
        onConfirm={completeTask}
      />
    </div>
  );
}
