import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  getCalendarIntegrations,
  saveCalendarIntegration,
  deleteCalendarIntegration,
  toggleCalendarSync,
  syncCalendarEvents,
} from '@/integrations/calendar/sync';
import { Trash2, Edit2, Eye, EyeOff, CloudSync, Calendar, Check, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Integration {
  id: string;
  provider: 'google' | 'outlook';
  ics_url: string;
  sync_enabled: boolean;
  last_synced_at: string | null;
}

export function CalendarIntegrationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState<'google' | 'outlook'>('google');
  const [newUrl, setNewUrl] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    loadIntegrations();
  }, [user?.id]);

  const loadIntegrations = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await getCalendarIntegrations(user.id);
      setIntegrations(data as Integration[]);
    } catch (error) {
      toast({
        title: 'Failed to load integrations',
        variant: 'destructive',
      });
    }
    setLoading(false);
  };

  const handleSave = async (provider: 'google' | 'outlook', url: string) => {
    if (!user?.id || !url.trim()) {
      toast({
        title: 'Please enter a valid ICS URL',
        variant: 'destructive',
      });
      return;
    }

    try {
      await saveCalendarIntegration(user.id, provider, url.trim());
      await loadIntegrations();
      setEditingId(null);
      toast({ title: 'Calendar integration saved!' });
    } catch (error) {
      toast({
        title: 'Failed to save integration',
        variant: 'destructive',
      });
    }
  };

  const handleAddNew = async () => {
    await handleSave(newProvider, newUrl);
    if (newUrl.trim()) {
      setNewProvider('google');
      setNewUrl('');
      setAddingNew(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this calendar integration?')) return;

    try {
      await deleteCalendarIntegration(id);
      await loadIntegrations();
      toast({ title: 'Integration removed' });
    } catch (error) {
      toast({
        title: 'Failed to remove integration',
        variant: 'destructive',
      });
    }
  };

  const handleToggleSync = async (id: string, enabled: boolean) => {
    try {
      await toggleCalendarSync(id, !enabled);
      await loadIntegrations();
    } catch (error) {
      toast({
        title: 'Failed to update sync status',
        variant: 'destructive',
      });
    }
  };

  const handleManualSync = async (provider: 'google' | 'outlook', icsUrl: string) => {
    if (!user?.id) return;

    setSyncing(provider);
    try {
      const result = await syncCalendarEvents(provider, icsUrl, user.id);

      if (result.errors.length > 0) {
        toast({
          title: 'Sync completed with errors',
          description: result.errors[0],
          variant: 'destructive',
        });
      } else {
        toast({
          title: `Sync complete`,
          description: `Added ${result.added} events${result.duplicates > 0 ? `, skipped ${result.duplicates} duplicates` : ''}`,
        });
      }

      await loadIntegrations();
    } catch (error) {
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
    setSyncing(null);
  };

  const toggleVisibility = (id: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const maskUrl = (url: string) => {
    const maxLength = 50;
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Calendar Integrations
          </CardTitle>
          <CardDescription>Sync events from Google Calendar and Outlook</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading integrations...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Calendar Integrations
        </CardTitle>
        <CardDescription>Connect Google Calendar and Outlook to sync events</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Existing Integrations */}
        {integrations.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Connected Calendars</h3>
            {integrations.map(integration => {
              const isVisible = visibleIds.has(integration.id);
              const isEditing = editingId === integration.id;
              const isSyncing = syncing === integration.provider;

              return (
                <div
                  key={integration.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {integration.provider === 'google' ? '🔵 Google' : '🟢 Outlook'}
                      </Badge>
                      <Badge variant={integration.sync_enabled ? 'default' : 'secondary'}>
                        {integration.sync_enabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          defaultValue={integration.ics_url}
                          placeholder="https://calendar.google.com/calendar/ical/..."
                          onChange={e => {
                            const updated = integrations.map(i =>
                              i.id === integration.id
                                ? { ...i, ics_url: e.target.value }
                                : i
                            );
                            setIntegrations(updated);
                          }}
                          className="text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              const updated = integrations.find(i => i.id === integration.id);
                              if (updated) {
                                handleSave(integration.provider, updated.ics_url);
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <code className="text-[10px] text-muted-foreground break-all">
                            {isVisible ? integration.ics_url : maskUrl(integration.ics_url)}
                          </code>
                          <button
                            onClick={() => toggleVisibility(integration.id)}
                            className="text-muted-foreground hover:text-foreground"
                            title={isVisible ? 'Hide URL' : 'Show URL'}
                          >
                            {isVisible ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        {integration.last_synced_at && (
                          <p className="text-[11px] text-muted-foreground">
                            Last synced: {new Date(integration.last_synced_at).toLocaleDateString()} at{' '}
                            {new Date(integration.last_synced_at).toLocaleTimeString()}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!isEditing && (
                      <>
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={integration.sync_enabled}
                            onCheckedChange={() =>
                              handleToggleSync(integration.id, integration.sync_enabled)
                            }
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(integration.id)}
                          title="Edit and update ICS URL"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleManualSync(integration.provider, integration.ics_url)}
                          disabled={isSyncing || !integration.sync_enabled}
                          title="Manually sync events"
                        >
                          {isSyncing ? (
                            <CloudSync className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CloudSync className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(integration.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add New Integration */}
        <div className="space-y-3 border-t border-border pt-4">
          {!addingNew && integrations.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setAddingNew(true)}
              className="w-full"
            >
              + Add Another Calendar
            </Button>
          )}

          {(addingNew || integrations.length === 0) && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                {integrations.length === 0 ? 'Add Your First Calendar' : 'Add New Calendar'}
              </h3>

              <div className="space-y-2">
                <Label>Calendar Provider</Label>
                <div className="flex gap-2">
                  <Button
                    variant={newProvider === 'google' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewProvider('google')}
                  >
                    Google Calendar
                  </Button>
                  <Button
                    variant={newProvider === 'outlook' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewProvider('outlook')}
                  >
                    Outlook
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ics-url">ICS Feed URL</Label>
                <Input
                  id="ics-url"
                  type="url"
                  placeholder={
                    newProvider === 'google'
                      ? 'https://calendar.google.com/calendar/ical/your-email%40gmail.com/private-xxxxx/basic.ics'
                      : 'https://outlook.live.com/calendar/ical/your-email%40outlook.com/calendar.ics'
                  }
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  {newProvider === 'google'
                    ? 'Find this in Google Calendar Settings → Calendar → Private Address (copy the .ics link)'
                    : 'Find this in Outlook Calendar Settings → Sharing → Copy the iCal URL'}
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleAddNew} disabled={!newUrl.trim()}>
                  <Check className="mr-2 h-4 w-4" />
                  Add Calendar
                </Button>
                {addingNew && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAddingNew(false);
                      setNewUrl('');
                      setNewProvider('google');
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Privacy Notice</p>
                    <p>Your ICS feed URL is stored securely and is private. It contains your calendar data and should be kept confidential. Only you can see it.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[12px] text-blue-900 dark:border-blue-900 dark:bg-blue-950">
          <p className="font-semibold mb-1">How it works</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Add your Google Calendar or Outlook ICS feed URL</li>
            <li>Events are synced to your calendar, duplicates are automatically filtered</li>
            <li>URLs remain hidden until you click Edit or the eye icon</li>
            <li>Use the Sync button to manually update events anytime</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
