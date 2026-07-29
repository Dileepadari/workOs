import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { workspaces as workspacesApi, type Workspace } from '@/lib/api';
import { useAuth } from './AuthContext';

const CURRENT_WORKSPACE_KEY = 'workos_current_workspace_id';

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [list, setList] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(CURRENT_WORKSPACE_KEY));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await workspacesApi.list();
      setList(data);
      setCurrentId((prev) => {
        if (prev && data.some((w) => w.id === prev)) return prev;
        const next = data[0]?.id ?? null;
        if (next) localStorage.setItem(CURRENT_WORKSPACE_KEY, next);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchWorkspace = (workspaceId: string) => {
    setCurrentId(workspaceId);
    localStorage.setItem(CURRENT_WORKSPACE_KEY, workspaceId);
  };

  const createWorkspace = async (name: string) => {
    const workspace = await workspacesApi.create(name);
    await refresh();
    switchWorkspace(workspace.id);
    return workspace;
  };

  const currentWorkspace = list.find((w) => w.id === currentId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{ workspaces: list, currentWorkspace, loading, switchWorkspace, createWorkspace, refresh }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
