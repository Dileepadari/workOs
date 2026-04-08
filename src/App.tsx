import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ColorThemeProvider } from "@/contexts/ColorThemeContext";
import { SearchProvider, useSearch } from "@/contexts/SearchContext";
import { AppLayout } from "@/components/AppLayout";
import { QuickSearch } from "@/components/QuickSearch";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Tasks from "./pages/Tasks";
import Notes from "./pages/Notes";
import Resources from "./pages/Resources";
import DailyLog from "./pages/DailyLog";
import SettingsPage from "./pages/SettingsPage";
import CalendarPage from "./pages/CalendarPage";
import FocusMode from "./pages/FocusMode";
import WeeklyReview from "./pages/WeeklyReview";
import TagManager from "./pages/TagManager";
import CollabMenu from "./pages/CollabMenu";
import CollabView from "./pages/CollabView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
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
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/collab" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<CollabMenu />} />
        </Route>
        <Route path="/collab/:slug" element={<CollabView />} />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="notes" element={<Notes />} />
          <Route path="resources" element={<Resources />} />
          <Route path="log" element={<DailyLog />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="focus" element={<FocusMode />} />
          <Route path="review" element={<WeeklyReview />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/tags" element={<TagManager />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ThemeProvider>
        <ColorThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <SearchProvider>
                <AppRoutes />
              </SearchProvider>
            </BrowserRouter>
          </AuthProvider>
        </ColorThemeProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
