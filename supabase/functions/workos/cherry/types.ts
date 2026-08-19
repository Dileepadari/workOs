// Cherry's wire contract.
//
// Mirrored in src/lib/cherry.ts. The edge function cannot import from src/ and
// the frontend cannot import from here, so the two copies are kept honest by
// tests/lib/cherry.test.ts, which parses one shared fixture against both.
//
// The shape exists to make one interaction possible: Cherry says what she
// understood, lists exactly what she would change, and asks for anything she
// needs - and nothing is written until a person ticks the boxes and confirms.

export type CherryTable =
  | "projects" | "tasks" | "notes" | "milestones" | "resources"
  | "meetings" | "events" | "links" | "saved_views"
  | "day_pages" | "week_pages" | "focus_sessions";

export type CherryOperation = "insert" | "update" | "delete";

/** A row Cherry has resolved to a real id. */
export interface CherryTarget {
  id: string;
  table: CherryTable;
  /** The row's title/name as stored. */
  label: string;
  /** "in Landing Page Revamp · in progress · due Fri" - enough to tell two
   *  similarly-named rows apart at a glance. */
  context?: string;
  /** 0-1 from the resolver. Shown when it is low enough to be worth doubting. */
  confidence: number;
  /** The phrase in the user's message this was matched from. */
  matched_on: string;
}

export type CherryInput =
  | { kind: "text" }
  | { kind: "longtext" }
  | { kind: "date" }
  | { kind: "time" }
  | { kind: "number"; min?: number; max?: number }
  | { kind: "boolean" }
  | { kind: "tags" }
  | { kind: "enum"; options: { value: string; label: string }[] }
  | { kind: "row_ref"; table: CherryTable; options: CherryTarget[] };

/**
 * Something Cherry needs from the user.
 *
 * `blocking` is the required/optional split the whole feature turns on: a
 * blocking question has no skip path, a non-blocking one always carries a
 * `skip_label` so "ask, but let me proceed" is a real button rather than a
 * sentence in a paragraph.
 */
export interface CherryQuestion {
  /** Stable within a proposal: `${action_id}.${field}`. Used as the answers key. */
  id: string;
  action_id: string;
  field: string;
  blocking: boolean;
  prompt: string;
  input: CherryInput;
  /** Present iff blocking === false. */
  skip_label?: string;
  answered_value?: unknown;
  /** Set when the user chose to skip rather than answer. */
  skipped?: boolean;
}

/** Two or more rows matched the same phrase. Cherry must not pick for you. */
export interface CherryAmbiguity {
  id: string;
  action_id: string;
  prompt: string;
  candidates: CherryTarget[];
  /** Only ever true for non-destructive updates. */
  allow_all: boolean;
  resolved_target_id?: string;
}

export type CherrySeverity = "low" | "medium" | "destructive";
export type CherryFieldSource = "extracted" | "default" | "answered" | "inferred";

export interface CherryFieldView {
  field: string;
  label: string;
  value: unknown;
  /** Human-readable rendering, so the client never has to format a raw value. */
  display: string;
  source: CherryFieldSource;
}

export interface CherryAction {
  id: string;
  table: CherryTable;
  operation: CherryOperation;
  /** insert: the whole row. update: only the changed columns. delete: always {}. */
  payload: Record<string, unknown>;
  /** Required for update/delete. Null here on an update or delete means the
   *  action is still blocked on an ambiguity or a question. */
  target: CherryTarget | null;
  summary: string;
  fields: CherryFieldView[];
  /** Populated when an update would replace values that are already set, so
   *  the user sees "before → after" rather than a bare "will set description". */
  overwrites?: { field: string; label: string; before: string; after: string }[];
  severity: CherrySeverity;
  destructive?: {
    /** Real counts, read from the database before proposing. */
    cascade_summary: string[];
    requires_typed_confirmation: boolean;
    typed_confirmation_phrase?: string;
    /** False when FK cascade means undo cannot bring the children back. */
    undo_is_complete: boolean;
  };
  /** No blocking question outstanding and a resolved target where one is needed. */
  ready: boolean;
}

export type CherryIntent =
  | "create" | "modify" | "delete" | "mixed"
  | "question" | "unclear" | "refused";

export interface CherryProposal {
  proposal_id: string;
  /** Cherry's paraphrase of what was asked - not a restatement of the actions. */
  understanding: string;
  intent_kind: CherryIntent;
  reply: string;
  actions: CherryAction[];
  questions: CherryQuestion[];
  ambiguities: CherryAmbiguity[];
  /** Things Cherry deliberately did not do, and why. Without this, a dropped
   *  action is silent, which is worse than a refusal. */
  refusals: { reason: string; detail: string }[];
  blocked_by: "questions" | "ambiguity" | "nothing";
  generated_at: string;
}

/** What /apply returns, and what /undo consumes. */
export interface CherryUndoEntry {
  table: CherryTable;
  operation: CherryOperation;
  row_id: string;
  /** insert: null. update: the prior values of the changed columns.
   *  delete: the entire row as read immediately before deletion. */
  before: Record<string, unknown> | null;
}

export interface CherryUndoToken {
  workspace_id: string;
  entries: CherryUndoEntry[];
  /** Children lost to ON DELETE CASCADE, which no undo can restore. */
  unrecoverable: { table: string; count: number; parent_id: string }[];
  created_at: string;
}

export interface CherryApplyResult {
  applied: { action_id: string; table: CherryTable; operation: CherryOperation; row_id: string; summary: string }[];
  skipped: { action_id: string; reason: string }[];
  failed: { action_id: string; error: string }[];
  undo: CherryUndoToken;
  /** Computed from what actually executed, not from what was proposed - a
   *  failed action must not invalidate a query, and a cascade must invalidate
   *  the child tables too. */
  touched: { tables: string[]; project_ids: string[] };
}

export interface CherryTurn {
  role: "user" | "cherry";
  text: string;
}

/** The model's output. Deliberately smaller than CherryProposal, and with no
 *  row ids in it anywhere - see resolve.ts for why that matters. */
export interface CherryDraftCommand {
  table: CherryTable;
  operation: CherryOperation;
  target_hint: { text: string; project_hint?: string | null; id_ref?: string | null } | null;
  fields: { name: string; value: string | number | boolean | null; quote: string }[];
}

export interface CherryDraft {
  understanding: string;
  intent_kind: CherryIntent;
  reply: string;
  supersedes_pending?: boolean;
  commands: CherryDraftCommand[];
}

export const CHERRY_LIMITS = {
  maxActionsPerProposal: 25,
  maxDeletesPerProposal: 5,
  maxProjectDeletesPerProposal: 1,
  maxMessageChars: 4000,
  maxHistoryTurns: 8,
} as const;
