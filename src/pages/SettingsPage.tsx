import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api, workspaces as workspacesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Download, Tag, Sun, Moon, Shield, Database, Building2, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ColorThemeSelector } from '@/components/ColorThemeSelector';
import { CalendarIntegrationSettings } from '@/components/CalendarIntegrationSettings';

/** Only the columns the links CSV export writes. */
interface ExportedLink {
  url: string;
  title: string;
  short_key: string | null;
  tags: string[] | null;
  category: string;
  click_count: number | null;
  created_at: string;
}

/** RFC4180 cell: always quoted, with embedded quotes doubled - a title
 *  containing a `"` used to produce a broken CSV. */
function csvCell(value: string | null | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { currentWorkspace, refresh } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(currentWorkspace?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => { setWorkspaceName(currentWorkspace?.name ?? ''); }, [currentWorkspace?.id, currentWorkspace?.name]);

  const canManageWorkspace = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin';

  const saveWorkspaceName = async () => {
    if (!currentWorkspace || !workspaceName.trim()) return;
    setSavingName(true);
    try {
      await workspacesApi.rename(currentWorkspace.id, workspaceName.trim());
      await refresh();
      toast({ title: 'Workspace renamed' });
    } catch (err) {
      toast({ title: 'Failed to rename workspace', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSavingName(false);
    }
  };

  const exportData = async (type: 'all' | 'links' | 'project') => {
    const wsId = currentWorkspace?.id;
    if (!wsId) return;
    setExporting(true);
    try {
      // 'bookmarks' dropped from this list - that table was removed in the
      // multi-tenant rebuild (dead, zero rows); Resources.tsx's links table
      // is the only "save a URL" store left.
      const tables = type === 'links' ? ['links'] : type === 'all' ? ['projects', 'tasks', 'milestones', 'resources', 'discussions', 'meetings', 'links', 'notes', 'daily_log'] : ['projects'];
      const allData: Record<string, unknown[]> = {};
      for (const table of tables) {
        allData[table] = await api.select(table, wsId);
      }

      if (type === 'links') {
        // CSV export for links
        const links = allData.links as ExportedLink[];
        const csv = ['url,title,short_key,tags,category,click_count,created_at',
          ...links.map(l => [
            csvCell(l.url), csvCell(l.title), csvCell(l.short_key), csvCell((l.tags || []).join(';')),
            csvCell(l.category), String(l.click_count ?? 0), csvCell(l.created_at),
          ].join(','))
        ].join('\n');
        downloadFile(csv, 'workos-links.csv', 'text/csv');
      } else {
        // JSON export
        const json = JSON.stringify(allData, null, 2);
        downloadFile(json, `workos-export-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
      }
      toast({ title: 'Export complete!' });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
    setExporting(false);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader title="Settings" />

      {/* ============ Personal ============ */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" />Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Username</p>
                <p className="text-xs sm:text-sm text-foreground">{user?.username}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">User ID</p>
                <p className="font-mono text-[10px] sm:text-xs text-muted-foreground break-all">{user?.id}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">{theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}Appearance</CardTitle>
              <CardDescription>Just for you - dark mode isn't shared with the rest of the workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Dark Mode</Label>
                  <p className="text-xs text-muted-foreground">Toggle between light and dark themes</p>
                </div>
                <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>
        </div>

        <CalendarIntegrationSettings />

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={signOut}>Sign Out</Button>
          </CardContent>
        </Card>
      </div>

      {/* ============ Workspace ============ */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Workspace Details</CardTitle>
              <CardDescription>Visible to everyone in {currentWorkspace?.name ?? 'this workspace'}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} disabled={!canManageWorkspace} className="flex-1" />
                {canManageWorkspace && (
                  <Button onClick={saveWorkspaceName} disabled={savingName || !workspaceName.trim() || workspaceName === currentWorkspace?.name}>
                    {savingName ? 'Saving...' : 'Save'}
                  </Button>
                )}
              </div>
              {!canManageWorkspace && <p className="text-xs text-muted-foreground">Only owners/admins can rename the workspace.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Team</CardTitle>
              <CardDescription>Manage members and invites</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/team"><Users className="mr-2 h-4 w-4" />Open Team</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Tag className="h-4 w-4" />Tag Manager</CardTitle>
              <CardDescription>View, rename, merge, and delete tags across all content</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/settings/tags"><Tag className="mr-2 h-4 w-4" />Open Tag Manager</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" />Export & Backup</CardTitle>
              <CardDescription>Download this workspace's data as JSON or CSV</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => exportData('all')} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />Full Export (JSON)
              </Button>
              <Button variant="outline" onClick={() => exportData('links')} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />Links (CSV)
              </Button>
            </CardContent>
          </Card>
        </div>

        <ColorThemeSelector />
      </div>
    </div>
  );
}
