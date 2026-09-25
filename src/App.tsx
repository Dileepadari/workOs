import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SearchProvider, useSearch } from "@/contexts/SearchContext";
import { AppLayout } from "@/components/AppLayout";
import { QuickSearch } from "@/components/QuickSearch";
import Auth from "./pages/Auth";

// Every page below this line is code-split.
//
// Eagerly importing them put all fifteen, plus the BlockNote editor they pull
// in, into one 2.4MB entry chunk that had to parse before anything rendered -
// including for a signed-out visitor who can only reach /auth. Auth itself
// stays eager because it is what that visitor is about to see.
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Notes = lazy(() => import("./pages/Notes"));
const Resources = lazy(() => import("./pages/Resources"));
const Secrets = lazy(() => import("./pages/Secrets"));
const Book = lazy(() => import("./pages/Book"));
const BookPrint = lazy(() => import("./pages/BookPrint"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const FocusMode = lazy(() => import("./pages/FocusMode"));
const TagManager = lazy(() => import("./pages/TagManager"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

/** Shown while a route chunk is in flight, and while auth is still resolving. */
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading...
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function SearchShortcut() {
  const { openSearch } = useSearch();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openSearch]);
  return null;
}

function SearchDialog() {
  const { isOpen, closeSearch } = useSearch();
  return <QuickSearch open={isOpen} onClose={closeSearch} />;
}

function AppRoutes() {
  return (
    <>
      <SearchShortcut />
      <SearchDialog />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/book/print" element={<ProtectedRoute><BookPrint /></ProtectedRoute>} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="notes" element={<Notes />} />
          <Route path="resources" element={<Resources />} />
          <Route path="secrets" element={<Secrets />} />
            <Route path="book" element={<Book />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="focus" element={<FocusMode />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/tags" element={<TagManager />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <WorkspaceProvider>
          <ThemeProvider>
            {/* Sonner reads the app's theme, so it has to sit inside the
                provider that owns it. It used to render above the tree and
                pull from next-themes, which had no provider at all - which is
                why toasts always came out in system theme. */}
            <Sonner />
            <BrowserRouter>
              <SearchProvider>
                <AppRoutes />
              </SearchProvider>
            </BrowserRouter>
          </ThemeProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
