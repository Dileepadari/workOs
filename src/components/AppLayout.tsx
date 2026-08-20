import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { OnboardingWizard } from './OnboardingWizard';
import { CherryPanel } from './cherry/CherryPanel';
import { CherryLauncher } from './cherry/CherryLauncher';
import { useCherryPrefs } from '@/hooks/useCherryPrefs';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoMark from '@/assets/logo-mark.png';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cherryOpen, setCherryOpen] = useState(false);
  const { avatar } = useCherryPrefs();

  // Cmd/Ctrl+J opens Cherry. Cmd+K is already the search palette, and Cherry
  // is the other thing you reach for without moving your hands.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setCherryOpen((v) => !v);
      }
      if (e.key === 'Escape') setCherryOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <AppSidebar onClose={() => setSidebarOpen(false)} />
      </div>
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <img src={logoMark} alt="" className="h-full w-full object-contain logo-mono" />
          </div>
          <span className="font-display text-sm font-semibold text-foreground">WorkOS</span>
        </div>
        {/* Cherry stands in the bottom-right corner and is fixed, so on a
            narrow screen she sits on top of whatever is at the end of the
            page. The extra bottom padding is her floor space: content can
            always be scrolled clear of her instead of hiding under her. */}
        <div className="px-4 py-5 pb-32 sm:px-6 sm:py-6 sm:pb-24">
          <Outlet />
        </div>
      </main>

      {/* Cherry stands in the corner rather than sitting in the menu: she is
          a person you turn to, not a page you navigate to. Clicking her opens
          the panel beside her. She also replaces the old quick-capture button
          - task creation used to exist in four places at once, which was a
          real part of why the app felt busy. */}
      <CherryLauncher open={cherryOpen} onOpen={() => setCherryOpen(true)} avatar={avatar} />
      <CherryPanel open={cherryOpen} onClose={() => setCherryOpen(false)} />
      <OnboardingWizard />
    </div>
  );
}
