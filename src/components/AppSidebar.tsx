import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, CheckSquare, FileText, Link2, BookOpen, Settings, LogOut, Sun, Moon, Calendar, Crosshair, BarChart3, X, Users, ChevronsUpDown, Plus, Check, KeyRound, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { cn, preventAccidentalDialogClose } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { NotificationCenter } from './NotificationCenter';
import logoMark from '@/assets/logo-mark.png';

const navGroups = [
  {
    label: null,
    items: [{ to: '/', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Work',
    items: [
      { to: '/projects', icon: FolderKanban, label: 'Projects' },
      { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
      { to: '/calendar', icon: Calendar, label: 'Calendar' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { to: '/notes', icon: FileText, label: 'Notes' },
      { to: '/resources', icon: Link2, label: 'Resources' },
      { to: '/secrets', icon: KeyRound, label: 'Secrets' },
    ],
  },
  {
    label: 'Personal',
    items: [
      { to: '/book', icon: BookOpen, label: 'Your Book' },
      { to: '/focus', icon: Crosshair, label: 'Focus Mode' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/team', icon: Users, label: 'Team' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

interface Props { onClose?: () => void; onOpenCherry?: () => void; }

function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, switchWorkspace, createWorkspace } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      await createWorkspace(newName.trim());
      setNewName('');
      setCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 min-w-0 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-sidebar-accent transition-colors">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 p-1">
              <img src={logoMark} alt="" className="h-full w-full object-contain logo-mono" />
            </div>
            <span className="text-sm font-semibold text-foreground truncate max-w-[110px] text-left">
              {currentWorkspace?.name || 'WorkOS'}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} onClick={() => switchWorkspace(ws.id)} className="flex items-center justify-between gap-2">
              <span className="truncate">{ws.name}</span>
              {ws.id === currentWorkspace?.id && <Check className="h-3.5 w-3.5 shrink-0" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" /> Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent aria-describedby={undefined} {...preventAccidentalDialogClose}>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Workspace name" autoFocus />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppSidebar({ onClose, onOpenCherry }: Props) {
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar shrink-0">
      <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5 gap-2">
        <WorkspaceSwitcher />
        <div className="flex items-center gap-1 shrink-0">
          <NotificationCenter />
          <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {navGroups.map((group, gi) => (
          <div key={group.label ?? gi} className="space-y-0.5">
            {group.label && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{group.label}</p>
            )}
            {group.items.map(({ to, icon: Icon, label }) => {
              const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3 space-y-2">
        {onOpenCherry && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onOpenCherry}
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Ask Cherry
            <kbd className="ml-auto rounded border border-sidebar-border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
              ⌘J
            </kbd>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </Button>
        <div className="px-3 text-xs text-muted-foreground truncate">@{user?.username}</div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
