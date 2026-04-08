import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderKanban, Lock, ExternalLink, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

interface CollabProject {
  id: string;
  name: string;
  slug: string;
  status: string;
  color: string;
  type: string;
  description: string | null;
  role: string;
  open_tasks: number;
  total_tasks: number;
}

export default function CollabMenu() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<CollabProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadCollabProjects();
  }, [user]);

  const loadCollabProjects = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_collab_projects', {
        p_email: user.email!,
      });
      if (error) {
        console.error('Error loading collab projects:', error);
        return;
      }
      if (data?.success) {
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(search.toLowerCase()) ||
    project.description?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success/20 text-success';
      case 'on_hold':
        return 'bg-warning/20 text-warning';
      case 'archived':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-primary/20 text-primary';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-destructive/20 text-destructive';
      case 'editor':
        return 'bg-primary/20 text-primary';
      case 'viewer':
        return 'bg-muted/20 text-muted-foreground';
      default:
        return 'bg-secondary/20 text-secondary';
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Collaborations" />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search collaborations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 && projects.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-foreground">No Collaborations Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You haven't been invited to any collaborative projects yet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* No Search Results */}
      {filteredProjects.length === 0 && projects.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-foreground">No Results Found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Try adjusting your search query.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.map((project) => (
          <Link key={project.id} to={`/collab/${project.slug}`}>
            <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate">{project.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {project.type === 'shared' ? 'Shared Project' : 'Private Project'}
                    </CardDescription>
                  </div>
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Badge className={getStatusColor(project.status)}>
                    {project.status}
                  </Badge>
                  <Badge className={getRoleColor(project.role)}>
                    {project.role}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>
                    {project.open_tasks}/{project.total_tasks} tasks
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
