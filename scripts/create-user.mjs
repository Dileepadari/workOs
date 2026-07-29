#!/usr/bin/env node
// Provisions (or updates) a public.users row directly via the service-role
// key, then - only on first creation - calls the one-time
// bootstrap_initial_workspace() migration function to create that user's
// Personal Workspace and fold all pre-existing (pre-multi-tenant) data into
// it. Deliberately a standalone script, not app code or a committed
// migration - a password hash should never end up in a UI form visible to
// the browser bundle, or in git history. Mirrors the sibling `portfolio`
// project's scripts/create-admin.mjs.
//
// Username/password are read from env vars, never CLI args - argv gets
// echoed back by npm/shells/process listings, env vars set via a file don't.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_BOOTSTRAP_USERNAME=... ADMIN_BOOTSTRAP_PASSWORD=... npm run create-user

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const email = process.env.ADMIN_BOOTSTRAP_EMAIL || null;
const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME || username;

if (!username || !password) {
  console.error('Missing ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD environment variables.');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const { data: existing } = await supabase
  .from('users')
  .select('id')
  .eq('username', username)
  .maybeSingle();

const isFirstCreation = !existing;
const password_hash = await bcrypt.hash(password, 10);

const { data: user, error } = await supabase
  .from('users')
  .upsert(
    { username, password_hash, email, display_name: displayName, is_active: true },
    { onConflict: 'username' },
  )
  .select('id, username')
  .single();

if (error) {
  console.error('Failed to create/update user:', error.message);
  process.exit(1);
}

console.log(`User "${user.username}" (${user.id}) is ready.`);

if (isFirstCreation) {
  console.log('First creation - bootstrapping Personal Workspace and migrating existing data...');
  const { data: workspaceId, error: rpcError } = await supabase.rpc('bootstrap_initial_workspace', {
    p_owner_user_id: user.id,
  });

  if (rpcError) {
    console.error('Failed to bootstrap workspace:', rpcError.message);
    process.exit(1);
  }

  console.log(`Personal Workspace created: ${workspaceId}`);
} else {
  console.log('User already existed - skipped workspace bootstrap (only runs once, on first creation).');
}
