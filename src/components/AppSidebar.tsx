import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, CheckSquare, FileText, Link2, BookOpen, Settings, LogOut, Sun, Moon, Calendar, Crosshair, BarChart3, X, Bell, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationCenter } from './NotificationCenter';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/resources', icon: Link2, label: 'Resources' },
  { to: '/log', icon: BookOpen, label: 'Daily Log' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/collab', icon: Users, label: 'Collaborations' },
  { to: '/focus', icon: Crosshair, label: 'Focus Mode' },
  { to: '/review', icon: BarChart3, label: 'Weekly Review' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

interface Props { onClose?: () => void; }

export function AppSidebar({ onClose }: Props) {
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar shrink-0">
      <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="text-sm font-bold text-primary-foreground">W</span>
          </div>
          <span className="text-lg font-semibold text-foreground">WorkOS</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationCenter />
          <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => {
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
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </Button>
        <div className="px-3 text-xs text-muted-foreground truncate">{user?.email}</div>
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
