export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          tags: string[] | null
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      collaborator_sessions: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          last_access_at: string
          project_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          last_access_at?: string
          project_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          last_access_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_log: {
        Row: {
          blockers: string[] | null
          created_at: string
          date: string
          energy_level: number | null
          id: string
          notes_html: string | null
          updated_at: string
          user_id: string
          wins: string[] | null
        }
        Insert: {
          blockers?: string[] | null
          created_at?: string
          date: string
          energy_level?: number | null
          id?: string
          notes_html?: string | null
          updated_at?: string
          user_id: string
          wins?: string[] | null
        }
        Update: {
          blockers?: string[] | null
          created_at?: string
          date?: string
          energy_level?: number | null
          id?: string
          notes_html?: string | null
          updated_at?: string
          user_id?: string
          wins?: string[] | null
        }
        Relationships: []
      }
      discussion_reactions: {
        Row: {
          created_at: string
          discussion_id: string
          emoji: string
          id: string
          user_identifier: string
        }
        Insert: {
          created_at?: string
          discussion_id: string
          emoji: string
          id?: string
          user_identifier: string
        }
        Update: {
          created_at?: string
          discussion_id?: string
          emoji?: string
          id?: string
          user_identifier?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_reactions_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      discussions: {
        Row: {
          author: string
          author_type: string
          body_html: string
          created_at: string
          id: string
          is_pinned: boolean
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author: string
          author_type?: string
          body_html: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string
          author_type?: string
          body_html?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          category: string | null
          click_count: number
          created_at: string
          description: string | null
          id: string
          short_key: string | null
          tags: string[] | null
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          category?: string | null
          click_count?: number
          created_at?: string
          description?: string | null
          id?: string
          short_key?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          category?: string | null
          click_count?: number
          created_at?: string
          description?: string | null
          id?: string
          short_key?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          action_items: string | null
          agenda_html: string | null
          attendees: string | null
          created_at: string
          gcal_event_id: string | null
          id: string
          notes_html: string | null
          project_id: string
          scheduled_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: string | null
          agenda_html?: string | null
          attendees?: string | null
          created_at?: string
          gcal_event_id?: string | null
          id?: string
          notes_html?: string | null
          project_id: string
          scheduled_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: string | null
          agenda_html?: string | null
          attendees?: string | null
          created_at?: string
          gcal_event_id?: string | null
          id?: string
          notes_html?: string | null
          project_id?: string
          scheduled_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string
          date: string
          id: string
          is_completed: boolean
          project_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_completed?: boolean
          project_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_completed?: boolean
          project_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string | null
          created_at: string
          id: string
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_collaborators: {
        Row: {
          email: string
          id: string
          invited_at: string
          last_access_at: string | null
          project_id: string
          role: string
        }
        Insert: {
          email: string
          id?: string
          invited_at?: string
          last_access_at?: string | null
          project_id: string
          role?: string
        }
        Update: {
          email?: string
          id?: string
          invited_at?: string
          last_access_at?: string | null
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          collab_password_hash: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          priority: number | null
          repo_url: string | null
          slug: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          status_note: string | null
          tags: string[] | null
          target_end_date: string | null
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          collab_password_hash?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority?: number | null
          repo_url?: string | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          status_note?: string | null
          tags?: string[] | null
          target_end_date?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          collab_password_hash?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority?: number | null
          repo_url?: string | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          status_note?: string | null
          tags?: string[] | null
          target_end_date?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          project_id: string
          tags: string[] | null
          title: string
          type: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          id?: string
          project_id: string
          tags?: string[] | null
          title: string
          type?: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          id?: string
          project_id?: string
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_label: string | null
          created_at: string
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["task_status"]
          time_estimate_min: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_label?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          time_estimate_min?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_label?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          time_estimate_min?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_collab_project_data: { Args: { p_session_id: string }; Returns: Json }
      get_collab_projects: { Args: { p_email: string }; Returns: Json }
      verify_collab_by_email: {
        Args: { p_email: string; p_project_slug: string }
        Returns: Json
      }
      verify_collab_password: {
        Args: { p_email: string; p_password: string; p_project_slug: string }
        Returns: Json
      }
    }
    Enums: {
      project_status: "active" | "archived" | "on_hold"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "done" | "blocked" | "dropped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      project_status: ["active", "archived", "on_hold"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "done", "blocked", "dropped"],
    },
  },
} as const
