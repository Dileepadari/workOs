import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { OnboardingWizard } from './OnboardingWizard';
import { useCherryPrefs } from '@/hooks/useCherryPrefs';
import { Assistant } from '@completeos/ui';
import { session, GATEWAY_URL } from '@/lib/session';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoMark from '@/assets/logo-mark.png';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { avatar } = useCherryPrefs();

  return (
    // Sidebar + content are capped and centred as one unit (like MoneyOS and
    // LifeBook), so on a wide monitor the whole app sits in the middle instead
    // of the sidebar hugging the far-left edge with the content adrift.
    <div className="mx-auto flex h-screen max-w-[1500px] overflow-hidden">
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
        {/* Compact, centred content like the other apps, rather than stretching
            edge to edge on a wide monitor. */}
        <div className="mx-auto w-full max-w-[1200px] px-4 py-5 pb-32 sm:px-6 sm:py-6 sm:pb-24">
          <Outlet />
        </div>
      </main>

      {/* The one shared ecosystem assistant - the same Cherry that runs in every
          app. In WorkOS she asks which workspace before a change and then acts
          through WorkOS's own path; she can also answer across your workspaces. */}
      <Assistant
        app="workos"
        baseUrl={GATEWAY_URL}
        getAccessToken={() => session.getAccessToken()}
        enabled={session.hasApp('workos')}
        avatar={avatar}
      />
      <OnboardingWizard />
    </div>
  );
}
