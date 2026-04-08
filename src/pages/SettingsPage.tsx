import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Download, Tag, Sun, Moon, Shield, Database } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ColorThemeSelector } from '@/components/ColorThemeSelector';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const exportData = async (type: 'all' | 'links' | 'project') => {
    setExporting(true);
    try {
      const tables = type === 'links' ? ['links'] : type === 'all' ? ['projects', 'tasks', 'milestones', 'resources', 'discussions', 'meetings', 'links', 'notes', 'daily_log', 'bookmarks'] : ['projects'];
      const allData: Record<string, any[]> = {};
      for (const table of tables) {
        const { data } = await supabase.from(table as any).select('*');
        allData[table] = data ?? [];
      }

      if (type === 'links') {
        // CSV export for links
        const links = allData.links;
        const csv = ['url,title,short_key,tags,category,click_count,created_at',
          ...links.map(l => `"${l.url}","${l.title}","${l.short_key || ''}","${(l.tags || []).join(';')}","${l.category}",${l.click_count},"${l.created_at}"`)
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
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Settings" />

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" />Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Email</p>
            <p className="text-xs sm:text-sm text-foreground">{user?.email}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">User ID</p>
            <p className="font-mono text-[10px] sm:text-xs text-muted-foreground break-all">{user?.id}</p>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">{theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}Appearance</CardTitle>
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

      {/* Color Theme */}
      <ColorThemeSelector />

      {/* Quick Links */}
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

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" />Export & Backup</CardTitle>
          <CardDescription>Download your data as JSON or CSV</CardDescription>
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

      {/* Danger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={signOut}>Sign Out</Button>
        </CardContent>
      </Card>
    </div>
  );
}
