import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, X, CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Task { id: string; title: string; status: string; priority: string; project_id: string | null; }
interface Project { id: string; name: string; color: string; }

export default function FocusMode() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 min
  const [isBreak, setIsBreak] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [completeTaskConfirm, setCompleteTaskConfirm] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      // Timer done
      if (!isBreak) {
        setSessions(s => s + 1);
        setIsBreak(true);
        setTimeLeft(5 * 60);
        // Play sound
        try { new Audio('data:audio/wav;base64,UklGRl9vT19teleV...').play(); } catch {}
      } else {
        setIsBreak(false);
        setTimeLeft(25 * 60);
      }
      setIsRunning(false);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, timeLeft]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => { setIsRunning(false); setTimeLeft(isBreak ? 5 * 60 : 25 * 60); };

  const completeTask = async () => {
    if (!selectedTask) return;
    await supabase.from('tasks').update({ status: 'done' }).eq('id', selectedTask);
    setTasks(prev => prev.filter(t => t.id !== selectedTask));
    setSelectedTask('');
    setCompleteTaskConfirm(false);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const pct = isBreak ? ((5 * 60 - timeLeft) / (5 * 60)) * 100 : ((25 * 60 - timeLeft) / (25 * 60)) * 100;
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
