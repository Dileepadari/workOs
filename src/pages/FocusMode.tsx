import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Pause, RotateCcw, CheckSquare, Settings, Volume2, VolumeX } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Task { id: string; title: string; status: string; priority: string; project_id: string | null; }
interface Project { id: string; name: string; color: string; }

const BEEP_FREQUENCY = 800;
const BEEP_DURATION = 200;

function playBeep(count = 3) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  } catch {}
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

export default function FocusMode() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isBreak, setIsBreak] = useState(false);
  const [sessions, setSessions] = useState(0);
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
    if (!user) return;
    const load = async () => {
      const [t, p] = await Promise.all([
        supabase.from('tasks').select('id, title, status, priority, project_id').neq('status', 'done'),
        supabase.from('projects').select('id, name, color'),
      ]);
      setTasks(t.data ?? []);
      setProjects(p.data ?? []);
    };
    load();
  }, [user]);

  const handleTimerComplete = useCallback(() => {
    if (!isBreak) {
      setSessions(s => s + 1);
      if (soundEnabled) playBeep(3);
      sendNotification('Focus session complete! 🎉', 'Time for a break.');
      setIsBreak(true);
      setTimeLeft(breakDuration * 60);
    } else {
      if (soundEnabled) playBeep(2);
      sendNotification('Break over! 💪', 'Ready for another focus session?');
      setIsBreak(false);
      setTimeLeft(focusDuration * 60);
    }
    setIsRunning(false);
  }, [isBreak, breakDuration, focusDuration, soundEnabled]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && isRunning) {
      handleTimerComplete();
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, timeLeft, handleTimerComplete]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => { setIsRunning(false); setTimeLeft(isBreak ? breakDuration * 60 : focusDuration * 60); };

  const applySettings = () => {
    if (!isRunning) {
      setTimeLeft(isBreak ? breakDuration * 60 : focusDuration * 60);
    }
    setSettingsOpen(false);
  };

  const completeTask = async () => {
    if (!selectedTask) return;
    await supabase.from('tasks').update({ status: 'done' }).eq('id', selectedTask);
    setTasks(prev => prev.filter(t => t.id !== selectedTask));
    setSelectedTask('');
    setCompleteTaskConfirm(false);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const totalSecs = isBreak ? breakDuration * 60 : focusDuration * 60;
  const pct = ((totalSecs - timeLeft) / totalSecs) * 100;
  const currentTask = tasks.find(t => t.id === selectedTask);
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-8 animate-fade-in">
      <PageHeader title="Focus Mode" />

      {/* Task selector */}
      <div className="w-full max-w-md">
        <Select value={selectedTask} onValueChange={setSelectedTask}>
          <SelectTrigger>
            <SelectValue placeholder="Select a task to focus on..." />
          </SelectTrigger>
          <SelectContent>
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
      <div className="relative flex h-52 w-52 items-center justify-center">
        <svg className="absolute inset-0" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle cx="100" cy="100" r="90" fill="none" stroke={isBreak ? 'hsl(var(--success))' : 'hsl(var(--primary))'} strokeWidth="6" strokeDasharray={`${2 * Math.PI * 90}`} strokeDashoffset={`${2 * Math.PI * 90 * (1 - pct / 100)}`} strokeLinecap="round" transform="rotate(-90 100 100)" className="transition-all duration-1000" />
        </svg>
        <div className="text-center">
          <p className="font-mono text-4xl font-bold text-foreground">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</p>
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
        <Card className="w-full max-w-md">
          <CardContent className="p-4 text-center">
            <p className="text-sm font-medium text-foreground">{currentTask.title}</p>
            {currentTask.project_id && projectMap[currentTask.project_id] && (
              <Badge variant="outline" className="mt-2 text-xs">
                <span className="mr-1 h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: projectMap[currentTask.project_id].color }} />
                {projectMap[currentTask.project_id].name}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Session counter */}
      <p className="text-xs text-muted-foreground">{sessions} pomodoro session{sessions !== 1 ? 's' : ''} completed</p>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-sm">
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
