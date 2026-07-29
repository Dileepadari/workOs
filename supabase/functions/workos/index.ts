// Single authenticated gateway for every write, every workspace-scoped read,
// and the image/file upload proxy in the app.
//
// Auth is a self-issued username/password + JWT scheme (public.users table,
// bcrypt hashes), not supabase.auth — this app is headed for a self-hosted
// Supabase instance with no Auth service, so there must be no dependency on
// GoTrue anywhere. Same shape as the sibling `portfolio` project's
// `admin` Edge Function, extended from single-admin to real multi-user
// workspaces/teams.
//
// Authorization lives here, in code — not in Postgres RLS. RLS stays enabled
// on every table as defense-in-depth (deny-all: nothing is reachable with
// just the anon key), but the actual membership/role checks happen in this
// function before any query runs, using the service-role key.

import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("WORKOS_JWT_SECRET")!;

// File uploads proxy to the real function living on the user's self-hosted
// Supabase box (/mnt/storage/supabase/functions/index.ts on
// mystorage.dileepadari.dev), reached through Kong at
// {host}/functions/v1/upload — NOT the simpler standalone-service contract
// the sibling `portfolio` project's DEVDOC describes (that service no longer
// exists; this box moved on to a real self-hosted Supabase stack). Auth is a
// short-lived admin JWT signed with *that instance's* JWT_SECRET (shared
// with its PostgREST), containing `is_admin: true` — minted here, per
// request, and never exposed to the browser. `x-app-name` must be in that
// function's own ALLOWED_CATEGORIES allowlist ("workos" was added there to
// support this app). The function only ever writes under an `images/`
// folder regardless of file type, and requires flat filenames (no `/`) —
// see handleUpload below.
const ORACLE_UPLOAD_BASE_URL = Deno.env.get("ORACLE_UPLOAD_BASE_URL") ?? "https://supabase.dileepadari.dev";
const ORACLE_APP_NAME = Deno.env.get("ORACLE_APP_NAME") ?? "workos";
const SELFHOST_JWT_SECRET = Deno.env.get("SELFHOST_JWT_SECRET") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const JWT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Content tables reachable through the generic /data gateway, and how each
// is scoped for authorization purposes. `projectScoped` tables carry a
// `project_id` column (or, for `projects` itself, the row's own `id`) that
// guest access is checked against via project_members. `personalOnly` tables
// are workspace-scoped but additionally restricted to their own creator
// regardless of workspace role (daily journal, personal calendar feeds) —
// guests never get access to these.
type TableConfig = { projectScoped: boolean; selfIsProject?: boolean; personalOnly?: boolean; noCreatedBy?: boolean; orderColumn?: string };
const CONTENT_TABLES: Record<string, TableConfig> = {
  projects: { projectScoped: true, selfIsProject: true },
  tasks: { projectScoped: true },
  notes: { projectScoped: true },
  resources: { projectScoped: true },
  milestones: { projectScoped: true },
  meetings: { projectScoped: true },
  events: { projectScoped: true },
  links: { projectScoped: false },
  daily_log: { projectScoped: false, personalOnly: true },
  calendar_integrations: { projectScoped: false, personalOnly: true },
  synced_events: { projectScoped: false, personalOnly: true },
  // Shared workspace-wide, not per-user-private, for v1.
  saved_views: { projectScoped: false },
  // Has `uploaded_by`, not `created_by` — client passes it explicitly.
  attachments: { projectScoped: false, noCreatedBy: true },
  // Keyed by workspace_id itself (no separate `id` or `created_at` column,
  // no `created_by`) — callers must pass idColumn:'workspace_id' on update.
  workspace_settings: { projectScoped: false, noCreatedBy: true, orderColumn: 'workspace_id' },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-file-type, x-file-name",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// --- Minimal HS256 JWT (sign + verify only) via Web Crypto -----------------
// Hand-rolled, same as portfolio/supabase/functions/admin/index.ts: the only
// thing this service ever needs is "sign a payload, verify a payload came
// from us."

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signJwt(payload: Record<string, unknown>, secret: string = JWT_SECRET): Promise<string> {
  const encHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const encPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${encHeader}.${encPayload}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(data));
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSignature] = parts;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(JWT_SECRET),
    base64UrlDecode(encSignature),
    new TextEncoder().encode(`${encHeader}.${encPayload}`),
  );
  if (!valid) return null;

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encPayload)));
  if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

interface AuthedUser { sub: string; username: string }

async function requireAuth(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const payload = await verifyJwt(token);
  if (!payload || typeof payload.sub !== "string") return null;
  return { sub: payload.sub, username: payload.username as string };
}

// --- Auth routes ------------------------------------------------------

async function handleSignup(req: Request): Promise<Response> {
  const { username, password, display_name, email } = await req.json().catch(() => ({}));
  if (!username || !password) return json({ error: "Missing username/password" }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

  const { data: existing } = await db.from("users").select("id").eq("username", username).maybeSingle();
  if (existing) return json({ error: "Username already taken" }, 409);

  const password_hash = await bcrypt.hash(password, 10);
  const { data: user, error } = await db
    .from("users")
    .insert({ username, password_hash, display_name: display_name || username, email: email || null })
    .select("id, username")
    .single();

  if (error) return json({ error: error.message }, 400);

  // Every new signup gets their own Personal Workspace by default (they can
  // join others via invite separately).
  const { data: workspace, error: wsError } = await db
    .from("workspaces")
    .insert({ name: "Personal Workspace", created_by: user.id })
    .select("id")
    .single();
  if (wsError) return json({ error: wsError.message }, 400);

  await db.from("workspace_members").insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" });
  await db.from("workspace_settings").insert({ workspace_id: workspace.id });

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: user.id, username: user.username, iat: now, exp: now + JWT_TTL_SECONDS });
  return json({ token, user });
}

async function handleLogin(req: Request): Promise<Response> {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) return json({ error: "Missing username/password" }, 400);

  const { data: user } = await db
    .from("users")
    .select("id, username, password_hash, is_active")
    .eq("username", username)
    .maybeSingle();

  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    return json({ error: "Invalid credentials" }, 401);
  }

  await db.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: user.id, username: user.username, iat: now, exp: now + JWT_TTL_SECONDS });
  return json({ token, user: { id: user.id, username: user.username } });
}

// --- Workspace management routes ---------------------------------------

async function getMembership(userId: string, workspaceId: string): Promise<string | null> {
  const { data } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? null;
}

async function handleListWorkspaces(user: AuthedUser): Promise<Response> {
  const { data, error } = await db
    .from("workspace_members")
    .select("role, workspaces(id, name, slug, logo_url)")
    .eq("user_id", user.sub);
  if (error) return json({ error: error.message }, 400);
  return json({ workspaces: data.map((r) => ({ ...r.workspaces, role: r.role })) });
}

async function handleCreateWorkspace(req: Request, user: AuthedUser): Promise<Response> {
  const { name } = await req.json().catch(() => ({}));
  if (!name) return json({ error: "Missing name" }, 400);

  const { data: workspace, error } = await db.from("workspaces").insert({ name, created_by: user.sub }).select("id, name").single();
  if (error) return json({ error: error.message }, 400);

  await db.from("workspace_members").insert({ workspace_id: workspace.id, user_id: user.sub, role: "owner" });
  await db.from("workspace_settings").insert({ workspace_id: workspace.id });

  return json({ workspace: { ...workspace, role: "owner" } });
}

async function handleUpdateWorkspace(req: Request, workspaceId: string, user: AuthedUser): Promise<Response> {
  const role = await getMembership(user.sub, workspaceId);
  if (role !== "owner" && role !== "admin") return json({ error: "Only owners/admins can rename the workspace" }, 403);

  const { name } = await req.json().catch(() => ({}));
  if (!name || !name.trim()) return json({ error: "Missing name" }, 400);

  const { data, error } = await db.from("workspaces").update({ name: name.trim() }).eq("id", workspaceId).select("id, name, slug, logo_url").single();
  if (error) return json({ error: error.message }, 400);
  return json({ workspace: { ...data, role } });
}

async function handleListMembers(workspaceId: string, user: AuthedUser): Promise<Response> {
  const role = await getMembership(user.sub, workspaceId);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);

  const { data, error } = await db
    .from("workspace_members")
    .select("role, created_at, users(id, username, display_name, avatar_url)")
    .eq("workspace_id", workspaceId);
  if (error) return json({ error: error.message }, 400);
  return json({ members: data });
}

async function handleCreateInvite(req: Request, workspaceId: string, user: AuthedUser): Promise<Response> {
  const role = await getMembership(user.sub, workspaceId);
  if (role !== "owner" && role !== "admin") return json({ error: "Only owners/admins can invite" }, 403);

  const body = await req.json().catch(() => ({}));
  const { email, role: inviteRole, scoped_project_id, scoped_project_role } = body;
  if (!email || !inviteRole) return json({ error: "Missing email/role" }, 400);

  const { data, error } = await db
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email,
      role: inviteRole,
      scoped_project_id: scoped_project_id || null,
      scoped_project_role: scoped_project_role || null,
      invited_by: user.sub,
    })
    .select("id, email, role, token, expires_at")
    .single();
  if (error) return json({ error: error.message }, 400);
  return json({ invite: data });
}

async function handleListInvites(workspaceId: string, user: AuthedUser): Promise<Response> {
  const role = await getMembership(user.sub, workspaceId);
  if (role !== "owner" && role !== "admin") return json({ error: "Only owners/admins can view invites" }, 403);

  const { data, error } = await db
    .from("workspace_invites")
    .select("id, email, role, expires_at, accepted_at, scoped_project_id, scoped_project_role")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 400);
  return json({ invites: data });
}

async function handleAcceptInvite(req: Request, token: string): Promise<Response> {
  const { data: invite } = await db
    .from("workspace_invites")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invite) return json({ error: "Invite not found, already used, or expired" }, 404);

  const body = await req.json().catch(() => ({}));
  let userId: string;

  const existingAuth = await requireAuth(req);
  if (existingAuth) {
    userId = existingAuth.sub;
  } else {
    const { username, password, display_name } = body;
    if (!username || !password) return json({ error: "Missing username/password for new account" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { data: takenCheck } = await db.from("users").select("id").eq("username", username).maybeSingle();
    if (takenCheck) return json({ error: "Username already taken" }, 409);

    const password_hash = await bcrypt.hash(password, 10);
    const { data: newUser, error } = await db
      .from("users")
      .insert({ username, password_hash, display_name: display_name || username, email: invite.email })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 400);
    userId = newUser.id;
  }

  await db.from("workspace_members").upsert(
    { workspace_id: invite.workspace_id, user_id: userId, role: invite.role },
    { onConflict: "workspace_id,user_id" },
  );

  if (invite.scoped_project_id) {
    await db.from("project_members").upsert(
      {
        project_id: invite.scoped_project_id,
        workspace_id: invite.workspace_id,
        user_id: userId,
        role: invite.scoped_project_role || "viewer",
      },
      { onConflict: "project_id,user_id" },
    );
  }

  await db.from("workspace_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

  if (existingAuth) return json({ success: true, workspace_id: invite.workspace_id });

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({ sub: userId, username: body.username, iat: now, exp: now + JWT_TTL_SECONDS });
  return json({ success: true, token: jwt, workspace_id: invite.workspace_id });
}

// --- Generic content-table gateway --------------------------------------

async function canAccessProject(
  userId: string,
  workspaceId: string,
  projectId: string | null,
  role: string,
  needWrite: boolean,
): Promise<boolean> {
  if (role !== "guest") return true; // owner/admin/member: full workspace access
  if (!projectId) return false; // guests only ever get scoped project access
  const { data } = await db
    .from("project_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  if (needWrite) return data.role === "editor";
  return true; // viewer/commenter can read
}

async function handleData(req: Request, user: AuthedUser): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { table, operation, workspace_id, payload, id, idColumn = "id", filters } = body;

  const config = CONTENT_TABLES[table];
  if (!config) return json({ error: "Table not allowed" }, 400);
  if (!workspace_id) return json({ error: "Missing workspace_id" }, 400);

  const role = await getMembership(user.sub, workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);

  if (config.personalOnly && role === "guest") {
    return json({ error: "Guests cannot access this table" }, 403);
  }

  // Resolve the project_id this operation touches, for guest scoping. For
  // select, a guest must tell us which project they're asking about via
  // filters — a select with no project filter has no single project_id to
  // check against, so it's rejected below rather than silently scanning
  // every project's rows looking for ones a guest happens to have access to.
  let projectId: string | null = null;
  if (config.projectScoped) {
    if (config.selfIsProject) {
      projectId = operation === "insert" ? null : (id ?? payload?.id ?? (filters?.id as string | undefined) ?? null);
    } else if (operation === "insert") {
      projectId = payload?.project_id ?? null;
    } else if (id) {
      const { data: existingRow } = await db.from(table).select("project_id").eq(idColumn, id).maybeSingle();
      projectId = existingRow?.project_id ?? null;
    } else if (operation === "select") {
      projectId = (filters?.project_id as string | undefined) ?? null;
    }
  }

  const needWrite = operation !== "select";
  if (role === "guest") {
    const allowed = config.selfIsProject
      ? await canAccessProject(user.sub, workspace_id, projectId, role, needWrite)
      : await canAccessProject(user.sub, workspace_id, projectId, role, needWrite);
    if (!allowed) return json({ error: "Forbidden" }, 403);
  }

  if (operation === "select") {
    let query = db.from(table).select("*").eq("workspace_id", workspace_id);
    if (config.personalOnly) query = query.eq("created_by", user.sub);
    if (filters && typeof filters === "object") {
      for (const [key, value] of Object.entries(filters)) query = query.eq(key, value as string);
    }
    const { data, error } = await query.order(config.orderColumn ?? "created_at", { ascending: false });
    if (error) return json({ error: error.message }, 400);
    return json({ data });
  }

  // payload may be a single object or an array (bulk insert/upsert, e.g. ICS
  // calendar sync batches) — stamp workspace_id/created_by onto every row.
  const stamp = (row: Record<string, unknown>) => ({
    ...row,
    workspace_id,
    ...(config.noCreatedBy ? {} : { created_by: user.sub }),
  });

  if (operation === "insert") {
    const rows = Array.isArray(payload) ? payload.map(stamp) : stamp(payload);
    const query = db.from(table).insert(rows).select();
    const { data, error } = Array.isArray(payload) ? await query : await query.single();
    if (error) return json({ error: error.message }, 400);
    return json({ data });
  }

  if (operation === "upsert") {
    const rows = Array.isArray(payload) ? payload.map(stamp) : stamp(payload);
    const query = db.from(table).upsert(rows, { onConflict: idColumn }).select();
    const { data, error } = Array.isArray(payload) ? await query : await query.single();
    if (error) return json({ error: error.message }, 400);
    return json({ data });
  }

  if (operation === "update") {
    if (!id) return json({ error: "Missing id" }, 400);

    // Task (re)assignment notifies the new assignee — checked before the
    // write so we know whether assignee_id actually changed.
    let priorAssigneeId: string | null = null;
    const isReassignment = table === "tasks" && typeof payload === "object" && payload !== null && "assignee_id" in payload;
    if (isReassignment) {
      const { data: existingTask } = await db.from("tasks").select("assignee_id, title, project_id").eq("id", id).maybeSingle();
      priorAssigneeId = existingTask?.assignee_id ?? null;
    }

    let query = db.from(table).update(payload).eq(idColumn, id).eq("workspace_id", workspace_id);
    if (config.personalOnly) query = query.eq("created_by", user.sub);
    const { data, error } = await query.select().single();
    if (error) return json({ error: error.message }, 400);

    if (isReassignment && data.assignee_id && data.assignee_id !== priorAssigneeId && data.assignee_id !== user.sub) {
      await db.from("notifications").insert({
        workspace_id, recipient_id: data.assignee_id, type: "assignment",
        entity_type: "task", entity_id: id, actor_id: user.sub,
        title: `${user.username} assigned you a task`, body: data.title, link: data.project_id ? `/projects/${data.project_id}` : "/tasks",
      });
      await db.from("activity_log").insert({
        workspace_id, project_id: data.project_id ?? null, actor_id: user.sub,
        action: "assigned", entity_type: "task", entity_id: id, metadata: { assignee_id: data.assignee_id },
      });
    }

    return json({ data });
  }

  if (operation === "delete") {
    if (!id) return json({ error: "Missing id" }, 400);
    let query = db.from(table).delete().eq(idColumn, id).eq("workspace_id", workspace_id);
    if (config.personalOnly) query = query.eq("created_by", user.sub);
    const { error } = await query;
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  return json({ error: "Unknown operation" }, 400);
}

// --- Comments, mentions, reactions, notifications, activity --------------
//
// Deliberately NOT routed through the generic /data gateway (unlike plain
// content tables): posting a comment has real side effects (parsing
// @mentions, notifying mentioned users and prior participants in the
// thread, logging activity) that need server-side logic beyond a straight
// table write, and reactions need find-or-toggle semantics. Reads (list
// comments/reactions/notifications/activity) are still simple selects, just
// with their own routes for symmetry with the write side.

function entityLink(entityType: string, entityId: string, projectId: string | null): string {
  if (entityType === "project") return `/projects/${entityId}`;
  if (projectId) return `/projects/${projectId}`;
  return "/";
}

async function notifyMentionsAndParticipants(opts: {
  workspaceId: string;
  commentId: string;
  contentText: string;
  actorId: string;
  actorUsername: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
}) {
  const { workspaceId, commentId, contentText, actorId, actorUsername, entityType, entityId, projectId } = opts;
  const link = entityLink(entityType, entityId, projectId);

  // @mentions — only for usernames that are actually members of this workspace.
  const mentionedUsernames = [...new Set([...contentText.matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1]))];
  const notifiedUserIds = new Set<string>();

  if (mentionedUsernames.length > 0) {
    const { data: matches } = await db.from("users").select("id, username").in("username", mentionedUsernames);
    for (const u of matches ?? []) {
      if (u.id === actorId) continue;
      const { data: membership } = await db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", u.id).maybeSingle();
      if (!membership) continue;
      await db.from("comment_mentions").insert({ comment_id: commentId, mentioned_user_id: u.id });
      await db.from("notifications").insert({
        workspace_id: workspaceId, recipient_id: u.id, type: "mention",
        entity_type: entityType, entity_id: entityId, actor_id: actorId,
        title: `${actorUsername} mentioned you in a comment`, body: contentText.slice(0, 140), link,
      });
      notifiedUserIds.add(u.id);
    }
  }

  // Prior participants in this thread (excluding the actor and anyone
  // already mention-notified above) get a lighter "comment_reply" ping.
  const { data: priorComments } = await db.from("comments").select("created_by").eq("entity_type", entityType).eq("entity_id", entityId);
  const participantIds = new Set((priorComments ?? []).map((c) => c.created_by).filter((id) => id !== actorId && !notifiedUserIds.has(id)));
  for (const uid of participantIds) {
    await db.from("notifications").insert({
      workspace_id: workspaceId, recipient_id: uid, type: "comment_reply",
      entity_type: entityType, entity_id: entityId, actor_id: actorId,
      title: `${actorUsername} commented`, body: contentText.slice(0, 140), link,
    });
  }
}

async function handleCreateComment(req: Request, user: AuthedUser): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { workspace_id, entity_type, entity_id, content_json, content_text, project_id } = body;
  if (!workspace_id || !entity_type || !entity_id) return json({ error: "Missing workspace_id/entity_type/entity_id" }, 400);

  const role = await getMembership(user.sub, workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);
  if (role === "guest") return json({ error: "Guests cannot comment yet" }, 403);

  const { data: comment, error } = await db
    .from("comments")
    .insert({ workspace_id, entity_type, entity_id, created_by: user.sub, content_json: content_json ?? [], content_text: content_text ?? "" })
    .select()
    .single();
  if (error) return json({ error: error.message }, 400);

  await db.from("activity_log").insert({
    workspace_id, project_id: project_id ?? (entity_type === "project" ? entity_id : null), actor_id: user.sub,
    action: "commented", entity_type, entity_id, metadata: { comment_id: comment.id },
  });

  await notifyMentionsAndParticipants({
    workspaceId: workspace_id, commentId: comment.id, contentText: content_text ?? "",
    actorId: user.sub, actorUsername: user.username, entityType: entity_type, entityId: entity_id,
    projectId: project_id ?? (entity_type === "project" ? entity_id : null),
  });

  return json({ data: comment });
}

async function handleListComments(req: Request, user: AuthedUser): Promise<Response> {
  const url = new URL(req.url);
  const workspace_id = url.searchParams.get("workspace_id");
  const entity_type = url.searchParams.get("entity_type");
  const entity_id = url.searchParams.get("entity_id");
  if (!workspace_id || !entity_type || !entity_id) return json({ error: "Missing workspace_id/entity_type/entity_id" }, 400);

  const role = await getMembership(user.sub, workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);

  const { data, error } = await db
    .from("comments")
    .select("*")
    .eq("workspace_id", workspace_id).eq("entity_type", entity_type).eq("entity_id", entity_id)
    .order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 400);
  return json({ data });
}

async function handleUpdateComment(req: Request, commentId: string, user: AuthedUser): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { data: existing } = await db.from("comments").select("created_by, workspace_id").eq("id", commentId).maybeSingle();
  if (!existing) return json({ error: "Not found" }, 404);

  const role = await getMembership(user.sub, existing.workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("content_json" in body) payload.content_json = body.content_json;
  if ("content_text" in body) payload.content_text = body.content_text;
  if ("is_pinned" in body) payload.is_pinned = body.is_pinned;

  // Anyone in the workspace can pin/unpin; only the author can edit content.
  const editingContent = "content_json" in body || "content_text" in body;
  if (editingContent && existing.created_by !== user.sub) return json({ error: "Only the author can edit this comment" }, 403);

  const { data, error } = await db.from("comments").update(payload).eq("id", commentId).select().single();
  if (error) return json({ error: error.message }, 400);
  return json({ data });
}

async function handleDeleteComment(commentId: string, user: AuthedUser): Promise<Response> {
  const { data: existing } = await db.from("comments").select("created_by, workspace_id").eq("id", commentId).maybeSingle();
  if (!existing) return json({ error: "Not found" }, 404);

  const role = await getMembership(user.sub, existing.workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);
  if (existing.created_by !== user.sub && role !== "owner" && role !== "admin") {
    return json({ error: "Only the author or an admin can delete this comment" }, 403);
  }

  const { error } = await db.from("comments").delete().eq("id", commentId);
  if (error) return json({ error: error.message }, 400);
  return json({ success: true });
}

async function handleToggleReaction(req: Request, user: AuthedUser): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { workspace_id, entity_type, entity_id, emoji } = body;
  if (!workspace_id || !entity_type || !entity_id || !emoji) return json({ error: "Missing fields" }, 400);

  const role = await getMembership(user.sub, workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);

  const { data: existing } = await db.from("reactions").select("id")
    .eq("entity_type", entity_type).eq("entity_id", entity_id).eq("user_id", user.sub).eq("emoji", emoji).maybeSingle();

  if (existing) {
    await db.from("reactions").delete().eq("id", existing.id);
    return json({ reacted: false });
  }
  await db.from("reactions").insert({ workspace_id, entity_type, entity_id, user_id: user.sub, emoji });
  return json({ reacted: true });
}

async function handleListReactions(req: Request, user: AuthedUser): Promise<Response> {
  const url = new URL(req.url);
  const workspace_id = url.searchParams.get("workspace_id");
  const entity_type = url.searchParams.get("entity_type");
  if (!workspace_id || !entity_type) return json({ error: "Missing workspace_id/entity_type" }, 400);

  const role = await getMembership(user.sub, workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);

  const { data, error } = await db.from("reactions").select("*").eq("workspace_id", workspace_id).eq("entity_type", entity_type);
  if (error) return json({ error: error.message }, 400);
  return json({ data });
}

async function handleListNotifications(req: Request, user: AuthedUser): Promise<Response> {
  const url = new URL(req.url);
  const workspace_id = url.searchParams.get("workspace_id");
  if (!workspace_id) return json({ error: "Missing workspace_id" }, 400);

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("workspace_id", workspace_id).eq("recipient_id", user.sub)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: error.message }, 400);
  return json({ data });
}

async function handleMarkNotificationRead(notificationId: string, user: AuthedUser): Promise<Response> {
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId).eq("recipient_id", user.sub);
  if (error) return json({ error: error.message }, 400);
  return json({ success: true });
}

async function handleMarkAllNotificationsRead(req: Request, user: AuthedUser): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { workspace_id } = body;
  if (!workspace_id) return json({ error: "Missing workspace_id" }, 400);
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspace_id).eq("recipient_id", user.sub).is("read_at", null);
  if (error) return json({ error: error.message }, 400);
  return json({ success: true });
}

async function handleListActivity(req: Request, user: AuthedUser): Promise<Response> {
  const url = new URL(req.url);
  const workspace_id = url.searchParams.get("workspace_id");
  const project_id = url.searchParams.get("project_id");
  if (!workspace_id) return json({ error: "Missing workspace_id" }, 400);

  const role = await getMembership(user.sub, workspace_id);
  if (!role) return json({ error: "Not a member of this workspace" }, 403);

  let query = db.from("activity_log").select("*").eq("workspace_id", workspace_id);
  if (project_id) query = query.eq("project_id", project_id);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) return json({ error: error.message }, 400);
  return json({ data });
}

// --- Upload (Oracle storage proxy) ---------------------------------------

// Matches /mnt/storage/supabase/functions/index.ts's own validation exactly
// — flat filenames only (no path segments), since that function does
// `Deno.writeFile(\`${targetDir}/${fileName}\`, ...)\` with no sanitization
// of its own beyond this regex.
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

async function handleUpload(req: Request): Promise<Response> {
  const fileName = req.headers.get("x-file-name");
  if (!fileName || !SAFE_FILENAME.test(fileName)) {
    return json({ error: "Missing or invalid x-file-name header (letters, digits, '.', '_', '-' only, no slashes)" }, 400);
  }
  if (!SELFHOST_JWT_SECRET) {
    return json({ error: "Server is missing SELFHOST_JWT_SECRET — uploads are not configured" }, 500);
  }

  const fileBuffer = await req.arrayBuffer();

  // Short-lived admin token for this one upload call — the self-hosted
  // function's own auth scheme (its login() Postgres function normally
  // issues these), not our WORKOS_JWT_SECRET-signed user tokens.
  const now = Math.floor(Date.now() / 1000);
  const adminToken = await signJwt({ is_admin: true, iat: now, exp: now + 60 }, SELFHOST_JWT_SECRET);

  const uploadRes = await fetch(`${ORACLE_UPLOAD_BASE_URL}/functions/v1/upload`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${adminToken}`,
      "x-app-name": ORACLE_APP_NAME,
      "x-file-name": fileName,
    },
    body: fileBuffer,
  });

  const result = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !result.success) {
    return json({ error: result.error ?? "Upload to storage failed" }, 502);
  }

  return json({ url: result.url });
}

// --- Router --------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/workos/, "");

  if (req.method === "POST" && path === "/auth/signup") return handleSignup(req);
  if (req.method === "POST" && path === "/auth/login") return handleLogin(req);

  const inviteMatch = path.match(/^\/invites\/([^/]+)\/accept$/);
  if (req.method === "POST" && inviteMatch) return handleAcceptInvite(req, inviteMatch[1]);

  // Everything below requires a valid JWT.
  const user = await requireAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  if (req.method === "GET" && path === "/workspaces") return handleListWorkspaces(user);
  if (req.method === "POST" && path === "/workspaces") return handleCreateWorkspace(req, user);

  const workspaceMatch = path.match(/^\/workspaces\/([^/]+)$/);
  if (req.method === "PATCH" && workspaceMatch) return handleUpdateWorkspace(req, workspaceMatch[1], user);

  const membersMatch = path.match(/^\/workspaces\/([^/]+)\/members$/);
  if (req.method === "GET" && membersMatch) return handleListMembers(membersMatch[1], user);

  const invitesMatch = path.match(/^\/workspaces\/([^/]+)\/invites$/);
  if (req.method === "POST" && invitesMatch) return handleCreateInvite(req, invitesMatch[1], user);
  if (req.method === "GET" && invitesMatch) return handleListInvites(invitesMatch[1], user);

  if (req.method === "POST" && path === "/data") return handleData(req, user);
  if (req.method === "POST" && path === "/upload") return handleUpload(req);

  if (req.method === "POST" && path === "/comments") return handleCreateComment(req, user);
  if (req.method === "GET" && path === "/comments") return handleListComments(req, user);
  const commentMatch = path.match(/^\/comments\/([^/]+)$/);
  if (req.method === "PATCH" && commentMatch) return handleUpdateComment(req, commentMatch[1], user);
  if (req.method === "DELETE" && commentMatch) return handleDeleteComment(commentMatch[1], user);

  if (req.method === "POST" && path === "/reactions/toggle") return handleToggleReaction(req, user);
  if (req.method === "GET" && path === "/reactions") return handleListReactions(req, user);

  if (req.method === "GET" && path === "/notifications") return handleListNotifications(req, user);
  if (req.method === "POST" && path === "/notifications/read-all") return handleMarkAllNotificationsRead(req, user);
  const notifMatch = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (req.method === "POST" && notifMatch) return handleMarkNotificationRead(notifMatch[1], user);

  if (req.method === "GET" && path === "/activity") return handleListActivity(req, user);

  return json({ error: "Route or method not found" }, 404);
});
