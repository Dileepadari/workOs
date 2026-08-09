-- ============================================================================
-- Secrets: a per-workspace vault for credentials, API keys, tokens and the
-- like.
--
-- The stored value is ENCRYPTED (AES-GCM, key from the WORKOS_SECRETS_KEY
-- Edge Function secret), not hashed. A hash is one-way and could never be
-- shown again, and the whole point of this feature is "masked in the list,
-- readable when I click reveal" - so it needs to be reversible. Plaintext
-- never touches this table, and the decryption key lives only in the Edge
-- Function's environment, never in Postgres and never in the browser.
--
-- Values are deliberately NOT reachable through the generic /data gateway:
-- secrets have their own routes in supabase/functions/workos/index.ts so that
-- list responses can omit `value_encrypted` entirely and decryption only ever
-- happens on an explicit POST /secrets/:id/reveal.
-- ============================================================================

create table public.secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'other',
  -- The account the secret belongs to (login, key id, ...) - safe to show
  -- unmasked in the list, unlike the value itself.
  username text,
  url text,
  tags text[] not null default '{}',
  -- Format: v1.<base64url iv>.<base64url ciphertext> - see encryptSecret()
  -- in the workos Edge Function.
  value_encrypted text not null,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deny-all, matching every other table here: the Edge Function holds the
-- service-role key and does its own membership/role checks. RLS is
-- defense-in-depth so nothing is reachable with just the anon key.
alter table public.secrets enable row level security;

create index idx_secrets_workspace on public.secrets(workspace_id);
create index idx_secrets_category on public.secrets(workspace_id, category);
