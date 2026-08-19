import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { workspaces as workspacesApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Copy, Users, Mail, UserPlus, Crown } from 'lucide-react';
import { MemberListSkeleton } from '@/components/skeletons/pages';

interface Member {
  role: string;
  created_at: string;
  users: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
}

const roleBadgeColor: Record<string, string> = {
  owner: 'bg-accent/10 text-accent',
  admin: 'bg-primary/10 text-primary',
  member: 'bg-muted text-muted-foreground',
  guest: 'bg-warning/10 text-warning',
};

export default function TeamPage() {
  const { currentWorkspace } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        workspacesApi.members(currentWorkspace.id),
        workspacesApi.invites.list(currentWorkspace.id),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !email.trim()) return;
    setInviting(true);
    try {
      await workspacesApi.invites.create(currentWorkspace.id, { email: email.trim(), role });
      setEmail('');
      toast.success('Invite created');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  };

  const canManage = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin';
  const owners = members.filter(m => m.role === 'owner').length;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Team" subtitle={`${members.length} ${members.length === 1 ? "member" : "members"}${invites.length ? `, ${invites.length} invited` : ""}`} />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {[
          { label: 'Members', value: members.length, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Owners/Admins', value: owners, icon: Crown, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Pending Invites', value: invites.length, icon: Mail, color: 'text-warning', bg: 'bg-warning/10' },
        ].map(({ label, value, icon: Icon, color, bg }, index) => (
          <Card key={label} className="animate-scale-in hover-lift" style={{ animationDelay: `${index * 40}ms` }}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4.5 w-4.5 ${color}`} /></div>
              <div>
                <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><UserPlus className="h-4 w-4 text-primary" />Invite someone</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" required />
              </div>
              <div className="w-full space-y-1.5 sm:w-40">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="guest">Guest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting}>{inviting ? 'Inviting...' : 'Send invite'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Members grid */}
        <Card className={canManage && invites.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-primary" />Members</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && <MemberListSkeleton />}
            {!loading && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {members.map((m, index) => (
                  <div
                    key={m.users.id}
                    className="animate-fade-in flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/30"
                    style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">{(m.users.display_name || m.users.username)[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{m.users.display_name || m.users.username}</p>
                      <p className="truncate text-xs text-muted-foreground">@{m.users.username}</p>
                    </div>
                    <Badge className={`shrink-0 text-xs capitalize ${roleBadgeColor[m.role] || 'bg-muted text-muted-foreground'}`}>{m.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending invites */}
        {canManage && invites.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-warning" />Pending invites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invites.map((inv, index) => (
                <div key={inv.id} className="animate-fade-in rounded-lg border border-border p-3" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
                  <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                  <p className="mb-2 text-xs text-muted-foreground capitalize">{inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                  <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => copyInviteLink(inv.token)}>
                    <Copy className="mr-1.5 h-3 w-3" /> Copy invite link
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
