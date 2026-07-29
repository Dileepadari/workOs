import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, UserPlus, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { activity as activityApi, type ActivityEntry } from '@/lib/api';
import type { Member } from '@/components/tasks/types';

interface Props {
  workspaceId: string;
  projectId?: string;
  members: Member[];
}

function actorLabel(members: Member[], actorId: string | null) {
  if (!actorId) return 'Someone';
  const m = members.find((m) => m.users.id === actorId);
  return m ? (m.users.display_name || m.users.username) : 'Someone';
}

function describe(entry: ActivityEntry, actor: string): string {
  switch (entry.action) {
    case 'commented': return `${actor} commented`;
    case 'assigned': return `${actor} assigned a task`;
    default: return `${actor} ${entry.action} ${entry.entity_type}`;
  }
}

function iconFor(action: string) {
  if (action === 'commented') return MessageSquare;
  if (action === 'assigned') return UserPlus;
  return History;
}

export function ActivityFeed({ workspaceId, projectId, members }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    activityApi.list(workspaceId, projectId).then(setEntries);
  }, [workspaceId, projectId]);

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" />Recent Activity</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {entries.slice(0, 12).map((e, index) => {
          const Icon = iconFor(e.action);
          return (
            <div key={e.id} className="animate-fade-in flex items-center gap-2 text-xs text-muted-foreground" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{describe(e, actorLabel(members, e.actor_id))}</span>
              <span className="shrink-0">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
