import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { QuickCapture } from './QuickCapture';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <AppSidebar onClose={() => setSidebarOpen(false)} />
      </div>
      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-primary-foreground">W</span>
          </div>
          <span className="text-xs font-semibold text-foreground">WorkOS</span>
        </div>
        <div className="p-3 sm:p-4">
          <Outlet />
        </div>
      </main>
      <QuickCapture />
    </div>
  );
}
