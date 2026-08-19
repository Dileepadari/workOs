// The data layer.
//
// Every page used to hand-roll `useEffect` + `useState` + an explicit
// `fetchData()` after each mutation, which meant a write in one place never
// refreshed a list in another, and `QueryClientProvider` sat mounted with zero
// consumers. This is that provider finally doing its job.
//
// Keys are hierarchical - ['ws', workspaceId, table] - so a mutation can
// invalidate by prefix and every view of that table updates, which is what
// lets Cherry write from a side panel and have the board behind it catch up
// without either knowing about the other.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export const wsKey = (wsId: string, table: string, scope?: Record<string, unknown>) =>
  (scope ? (['ws', wsId, table, scope] as const) : (['ws', wsId, table] as const));

/** Invalidates by table name, or the whole workspace when nothing is named. */
export function useInvalidate() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;

  return (tables?: string[]) => {
    if (!wsId) return;
    if (!tables?.length) {
      qc.invalidateQueries({ queryKey: ['ws', wsId] });
      return;
    }
    for (const table of tables) qc.invalidateQueries({ queryKey: ['ws', wsId, table] });
    // Projects appearing or disappearing changes the shape of every
    // project-scoped list, not just the projects list itself.
    if (tables.includes('projects')) qc.invalidateQueries({ queryKey: ['ws', wsId] });
  };
}

/**
 * A workspace-scoped table read.
 *
 * Disabled until a workspace is chosen rather than firing with an empty id -
 * the gateway rejects a missing workspace_id, and a rejected request that
 * looks like a real error makes every page's empty state ambiguous.
 */
export function useTable<T = unknown>(
  table: string,
  filters?: Record<string, unknown>,
  options?: Partial<UseQueryOptions<T[], Error>>,
) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;

  return useQuery<T[], Error>({
    queryKey: wsId ? wsKey(wsId, table, filters) : ['ws', 'none', table],
    queryFn: () => api.select<T>(table, wsId!, filters),
    enabled: Boolean(wsId) && (options?.enabled ?? true),
    staleTime: 30_000,
    ...options,
  });
}

interface MutationOpts {
  /** Tables to refresh once the write lands. Defaults to the one written. */
  invalidates?: string[];
}

export function useCreate<T = unknown>(table: string, opts: MutationOpts = {}) {
  const { currentWorkspace } = useWorkspace();
  const invalidate = useInvalidate();
  return useMutation<T, Error, Record<string, unknown>>({
    mutationFn: (payload) => api.insert<T>(table, currentWorkspace!.id, payload),
    onSuccess: () => invalidate(opts.invalidates ?? [table]),
  });
}

export function useUpdate<T = unknown>(table: string, opts: MutationOpts = {}) {
  const { currentWorkspace } = useWorkspace();
  const invalidate = useInvalidate();
  return useMutation<T, Error, { id: string; payload: Record<string, unknown>; idColumn?: string }>({
    mutationFn: ({ id, payload, idColumn }) =>
      api.update<T>(table, currentWorkspace!.id, id, payload, idColumn ?? 'id'),
    onSuccess: () => invalidate(opts.invalidates ?? [table]),
  });
}

export function useRemove(table: string, opts: MutationOpts = {}) {
  const { currentWorkspace } = useWorkspace();
  const invalidate = useInvalidate();
  return useMutation<void, Error, { id: string; idColumn?: string }>({
    mutationFn: ({ id, idColumn }) => api.remove(table, currentWorkspace!.id, id, idColumn ?? 'id'),
    onSuccess: () => invalidate(opts.invalidates ?? [table]),
  });
}

// ------------------------------------------------------------- entities --

export interface ProjectRow {
  id: string; name: string; description: string | null; status: string;
  color: string | null; type: string | null; tags: string[] | null;
  slug: string | null; start_date: string | null; target_end_date: string | null;
  repo_url: string | null; status_note: string | null;
  created_at: string; updated_at: string;
}

export interface TaskRow {
  id: string; title: string; description: string | null;
  content_json: unknown; content_text: string | null;
  status: string; priority: string;
  due_date: string | null; due_time: string | null;
  completed_at: string | null;
  project_id: string | null; assignee_id: string | null;
  time_estimate_min: number | null; sort_order: number;
  created_at: string; updated_at: string;
}

export interface FocusSessionRow {
  id: string; task_id: string | null; project_id: string | null;
  started_at: string; ended_at: string | null;
  planned_minutes: number; actual_minutes: number;
  was_break: boolean; interruptions: number; completed: boolean;
  note: string | null; created_at: string;
}

export interface DayPageRow {
  id: string; date: string; title: string | null; summary: string | null;
  highlights: string[]; friction: string[]; reflection: string | null;
  metrics: Record<string, number | string | null>;
  generated_by: string; sealed_at: string | null;
  created_at: string; updated_at: string;
}

export interface WeekPageRow {
  id: string; week_start: string; title: string | null; summary: string | null;
  wins: string[]; concerns: string[]; focus_next: string[];
  metrics: Record<string, number | string | null>;
  generated_by: string; sealed_at: string | null;
  created_at: string; updated_at: string;
}

export const useProjects = () => useTable<ProjectRow>('projects');
export const useTasks = (filters?: Record<string, unknown>) => useTable<TaskRow>('tasks', filters);
export const useNotes = () => useTable<Record<string, unknown>>('notes');
export const useLinks = () => useTable<Record<string, unknown>>('links');
export const useMilestones = (filters?: Record<string, unknown>) => useTable<Record<string, unknown>>('milestones', filters);
export const useMeetings = (filters?: Record<string, unknown>) => useTable<Record<string, unknown>>('meetings', filters);
export const useEvents = () => useTable<Record<string, unknown>>('events');
export const useFocusSessions = () => useTable<FocusSessionRow>('focus_sessions');
export const useDayPages = () => useTable<DayPageRow>('day_pages');
export const useWeekPages = () => useTable<WeekPageRow>('week_pages');
