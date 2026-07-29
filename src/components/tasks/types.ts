import type { TaskStatus, TaskPriority } from '@/lib/taskMeta';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  content_json: unknown;
  content_text: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  project_id: string | null;
  assignee_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProjectLite { id: string; name: string; color: string; }

export interface Member {
  role: string;
  users: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}
