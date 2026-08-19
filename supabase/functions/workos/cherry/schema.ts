// What every entity needs, what it merely wants, and how Cherry asks for it.
//
// One table, three jobs: it decides which questions get asked, it decides what
// /apply will accept, and it holds the exact wording so no prompt string ever
// lives in a component. Keeping those together is what stops the DB
// constraints, the questions and the validation drifting apart.
//
// `need` is the distinction the whole feature turns on:
//   required    - the row cannot exist without it. No skip path.
//   recommended - the row is poorer without it. Asked, but skippable.
//   optional    - never asked; only filled if the message clearly gave it.

import type { CherryTable } from "./types.ts";

export type FieldKind =
  | "text" | "longtext" | "blocks" | "date" | "time" | "timestamptz"
  | "number" | "boolean" | "enum" | "tags" | "url" | "color"
  | "ref:projects" | "ref:users";

export interface FieldSpec {
  kind: FieldKind;
  label: string;
  need: "required" | "recommended" | "optional";
  enum?: string[];
  default?: unknown;
  /** Exactly how Cherry phrases the question. Empty for fields never asked. */
  ask: string;
  /** Required iff need === 'recommended'. */
  skipLabel?: string;
  max?: number;
  min?: number;
  /**
   * A pattern the user's message must satisfy for a model-supplied value to
   * survive.
   *
   * Models fill schemas. Ask for a task with a priority and you get one
   * whether or not urgency was expressed; ask for a project and you get a
   * target date invented out of nothing. Anything whose quote is absent from
   * the message and whose pattern does not fire is dropped and re-asked
   * instead of written. Absent here means no grounding requirement.
   */
  evidence?: RegExp;
}

export interface EntitySpec {
  label: string;
  labelPlural: string;
  /** Used for summaries, duplicate matching and delete confirmation. */
  titleField: string;
  fields: Record<string, FieldSpec>;
  cherry: {
    allowInsert: boolean;
    allowUpdate: boolean;
    allowDelete: boolean;
    maxPerProposal: number;
    deleteRequiresTypedConfirmation: boolean;
    /** Read off the migrations, not guessed. Drives the cascade warning and
     *  the honesty of the undo button. */
    cascades?: { table: string; column: string; onDelete: "cascade" | "set null" }[];
    /** Cherry proposes this instead of a delete, where one exists. Losing a
     *  project's milestones and meetings to a cascade is not something a
     *  sentence should be able to do casually. */
    preferInsteadOfDelete?: { field: string; value: string; phrasing: string };
  };
}

const STATUS_EVIDENCE = /\b(todo|to-?do|start|in ?progress|doing|done|finish|complete|block|stuck|drop|cancel|abandon)\w*/i;
const PRIORITY_EVIDENCE = /\b(low|medium|normal|high|urgent|asap|critical|priorit|important)\w*/i;

export const ENTITY_SCHEMA: Record<CherryTable, EntitySpec> = {
  tasks: {
    label: "task", labelPlural: "tasks", titleField: "title",
    fields: {
      title: { kind: "text", label: "Title", need: "required", max: 200,
               ask: "What should the task be called?" },
      project_id: { kind: "ref:projects", label: "Project", need: "recommended",
                    ask: "Which project is this task for?",
                    skipLabel: "No project" },
      due_date: { kind: "date", label: "Due date", need: "recommended",
                  ask: "When is it due?", skipLabel: "Leave undated" },
      description: { kind: "longtext", label: "Description", need: "recommended", max: 5000,
                     ask: "Anything worth writing down about it?",
                     skipLabel: "No description" },
      due_time: { kind: "time", label: "Due time", need: "optional", ask: "What time?" },
      status: { kind: "enum", label: "Status", need: "optional", default: "todo",
                enum: ["todo", "in_progress", "done", "blocked", "dropped"],
                ask: "What status should it have?", evidence: STATUS_EVIDENCE },
      priority: { kind: "enum", label: "Priority", need: "optional", default: "medium",
                  enum: ["low", "medium", "high", "urgent"],
                  ask: "How urgent is it?", evidence: PRIORITY_EVIDENCE },
      assignee_id: { kind: "ref:users", label: "Assignee", need: "optional",
                     ask: "Who should own this?" },
      time_estimate_min: { kind: "number", label: "Estimate (min)", need: "optional", min: 1, max: 10080,
                           ask: "Roughly how long, in minutes?",
                           evidence: /\b(\d+\s*(min|minute|hour|hr|h)\b|estimate|take)/i },
      completed_at: { kind: "timestamptz", label: "Completed", need: "optional", ask: "" },
      sort_order: { kind: "number", label: "Order", need: "optional", ask: "" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 15, deleteRequiresTypedConfirmation: false },
  },

  projects: {
    label: "project", labelPlural: "projects", titleField: "name",
    fields: {
      name: { kind: "text", label: "Name", need: "required", max: 120,
              ask: "What should the project be called?" },
      description: { kind: "longtext", label: "Description", need: "recommended", max: 2000,
                     ask: "One line on what this project is - future you will want it.",
                     skipLabel: "Skip the description" },
      target_end_date: { kind: "date", label: "Target end", need: "recommended",
                         ask: "When are you aiming to finish?", skipLabel: "No target date" },
      status: { kind: "enum", label: "Status", need: "optional", default: "active",
                enum: ["active", "archived", "on_hold"],
                ask: "What status?", evidence: /\b(active|archiv|on[ -]?hold|paus|shelv)\w*/i },
      type: { kind: "text", label: "Type", need: "optional", default: "personal",
              ask: "What type of project?" },
      start_date: { kind: "date", label: "Start", need: "optional", ask: "When does it start?" },
      tags: { kind: "tags", label: "Tags", need: "optional", max: 10, ask: "Any tags?" },
      color: { kind: "color", label: "Colour", need: "optional", default: "#2D6A6A", ask: "" },
      slug: { kind: "text", label: "Slug", need: "optional", ask: "" },
      repo_url: { kind: "url", label: "Repo", need: "optional", ask: "Is there a repo URL?" },
      status_note: { kind: "longtext", label: "Status note", need: "optional", max: 2000,
                     ask: "What is the current state?" },
    },
    cherry: {
      allowInsert: true, allowUpdate: true, allowDelete: true,
      maxPerProposal: 3, deleteRequiresTypedConfirmation: true,
      cascades: [
        { table: "milestones", column: "project_id", onDelete: "cascade" },
        { table: "resources", column: "project_id", onDelete: "cascade" },
        { table: "meetings", column: "project_id", onDelete: "cascade" },
        { table: "tasks", column: "project_id", onDelete: "set null" },
        { table: "notes", column: "project_id", onDelete: "set null" },
        { table: "events", column: "project_id", onDelete: "set null" },
      ],
      // Deleting a project takes its milestones, resources and meetings with
      // it, and no undo brings those back. Archiving loses nothing.
      preferInsteadOfDelete: {
        field: "status", value: "archived",
        phrasing: "Archive it instead - deleting a project also deletes its milestones, resources and meetings, and that cannot be undone.",
      },
    },
  },

  notes: {
    label: "note", labelPlural: "notes", titleField: "title",
    fields: {
      title: { kind: "text", label: "Title", need: "required", max: 200,
               ask: "What should the note be called?" },
      project_id: { kind: "ref:projects", label: "Project", need: "recommended",
                    ask: "Which project does this note belong to?", skipLabel: "No project" },
      content_text: { kind: "blocks", label: "Body", need: "recommended", max: 100000,
                      ask: "What goes in it?", skipLabel: "Start it empty" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 10, deleteRequiresTypedConfirmation: false },
  },

  milestones: {
    label: "milestone", labelPlural: "milestones", titleField: "title",
    fields: {
      project_id: { kind: "ref:projects", label: "Project", need: "required",
                    ask: "Which project is this milestone on?" },
      title: { kind: "text", label: "Title", need: "required", max: 200,
               ask: "What is the milestone?" },
      date: { kind: "date", label: "Date", need: "required",
              ask: "What date is it set for?" },
      is_completed: { kind: "boolean", label: "Completed", need: "optional", default: false,
                      ask: "Is it already done?",
                      evidence: /\b(done|complete|finish|hit|reach|ship)\w*/i },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 10, deleteRequiresTypedConfirmation: false },
  },

  resources: {
    label: "resource", labelPlural: "resources", titleField: "title",
    fields: {
      project_id: { kind: "ref:projects", label: "Project", need: "required",
                    ask: "Which project is this resource for?" },
      title: { kind: "text", label: "Title", need: "required", max: 200,
               ask: "What should it be called?" },
      url: { kind: "url", label: "URL", need: "recommended",
             ask: "What is the link?", skipLabel: "No link" },
      type: { kind: "text", label: "Type", need: "optional", default: "link", ask: "" },
      tags: { kind: "tags", label: "Tags", need: "optional", max: 10, ask: "Any tags?" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 10, deleteRequiresTypedConfirmation: false },
  },

  meetings: {
    label: "meeting", labelPlural: "meetings", titleField: "title",
    fields: {
      project_id: { kind: "ref:projects", label: "Project", need: "required",
                    ask: "Which project is this meeting for?" },
      title: { kind: "text", label: "Title", need: "required", max: 200,
               ask: "What is the meeting about?" },
      scheduled_at: { kind: "timestamptz", label: "When", need: "required",
                      ask: "When is it? Give a date and a time." },
      attendees: { kind: "text", label: "Attendees", need: "recommended", max: 500,
                   ask: "Who is coming?", skipLabel: "Leave attendees blank" },
      action_items: { kind: "longtext", label: "Action items", need: "optional", max: 5000, ask: "" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 8, deleteRequiresTypedConfirmation: false },
  },

  events: {
    label: "event", labelPlural: "events", titleField: "title",
    fields: {
      title: { kind: "text", label: "Title", need: "required", max: 200,
               ask: "What is the event?" },
      scheduled_at: { kind: "timestamptz", label: "When", need: "required",
                      ask: "When is it? Give a date and a time." },
      project_id: { kind: "ref:projects", label: "Project", need: "optional",
                    ask: "Is it tied to a project?" },
      location: { kind: "text", label: "Location", need: "recommended", max: 300,
                  ask: "Where is it?", skipLabel: "No location" },
      description: { kind: "longtext", label: "Description", need: "optional", max: 2000, ask: "" },
      color: { kind: "color", label: "Colour", need: "optional", default: "#3b82f6", ask: "" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 10, deleteRequiresTypedConfirmation: false },
  },

  links: {
    label: "link", labelPlural: "links", titleField: "title",
    fields: {
      title: { kind: "text", label: "Title", need: "required", max: 200,
               ask: "What should the link be called?" },
      url: { kind: "url", label: "URL", need: "required",
             ask: "What is the URL?" },
      description: { kind: "longtext", label: "Description", need: "recommended", max: 1000,
                     ask: "What is it, in a line?", skipLabel: "No description" },
      category: { kind: "text", label: "Category", need: "optional", default: "other", ask: "" },
      tags: { kind: "tags", label: "Tags", need: "optional", max: 10, ask: "Any tags?" },
      short_key: { kind: "text", label: "Short key", need: "optional", max: 40, ask: "" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 15, deleteRequiresTypedConfirmation: false },
  },

  saved_views: {
    label: "saved view", labelPlural: "saved views", titleField: "name",
    fields: {
      name: { kind: "text", label: "Name", need: "required", max: 120,
              ask: "What should the view be called?" },
      entity_type: { kind: "text", label: "Entity", need: "optional", default: "tasks", ask: "" },
      view_type: { kind: "enum", label: "Layout", need: "optional", default: "list",
                   enum: ["list", "board", "calendar"], ask: "List, board or calendar?" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: true,
              maxPerProposal: 5, deleteRequiresTypedConfirmation: false },
  },

  // The book. Cherry may write a reflection into a day page, but she does not
  // author the generated prose - that is what the page generator is for, and
  // letting a chat turn overwrite a sealed page would defeat sealing.
  day_pages: {
    label: "day page", labelPlural: "day pages", titleField: "date",
    fields: {
      date: { kind: "date", label: "Date", need: "required", ask: "Which day?" },
      reflection: { kind: "longtext", label: "Reflection", need: "recommended", max: 10000,
                    ask: "What do you want to write for that day?", skipLabel: "Leave it blank" },
      highlights: { kind: "tags", label: "Highlights", need: "optional", max: 20, ask: "" },
      friction: { kind: "tags", label: "Friction", need: "optional", max: 20, ask: "" },
    },
    cherry: { allowInsert: true, allowUpdate: true, allowDelete: false,
              maxPerProposal: 3, deleteRequiresTypedConfirmation: false },
  },

  week_pages: {
    label: "week page", labelPlural: "week pages", titleField: "week_start",
    fields: {
      week_start: { kind: "date", label: "Week of", need: "required", ask: "Which week? Give the Monday." },
      wins: { kind: "tags", label: "Wins", need: "optional", max: 20, ask: "" },
      concerns: { kind: "tags", label: "Concerns", need: "optional", max: 20, ask: "" },
      focus_next: { kind: "tags", label: "Next week", need: "optional", max: 20, ask: "" },
    },
    cherry: { allowInsert: false, allowUpdate: true, allowDelete: false,
              maxPerProposal: 2, deleteRequiresTypedConfirmation: false },
  },

  // Sessions are recorded by the timer as they happen. Letting Cherry invent
  // them would put fabricated focus minutes onto a day page, which is the one
  // number on there that has to be earned.
  focus_sessions: {
    label: "focus session", labelPlural: "focus sessions", titleField: "id",
    fields: {
      note: { kind: "text", label: "Note", need: "optional", max: 500, ask: "" },
    },
    cherry: { allowInsert: false, allowUpdate: false, allowDelete: false,
              maxPerProposal: 0, deleteRequiresTypedConfirmation: false },
  },
};

/** Tables Cherry may act on at all. Narrower than the gateway's allowlist on
 *  purpose - see the per-entity notes above, and note that `secrets` is not
 *  reachable through the gateway in the first place. */
export const CHERRY_TABLES = Object.keys(ENTITY_SCHEMA) as CherryTable[];

export function isCherryTable(t: string): t is CherryTable {
  return Object.prototype.hasOwnProperty.call(ENTITY_SCHEMA, t);
}
