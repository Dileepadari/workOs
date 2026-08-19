-- Per-user preferences and per-user AI keys, both in the database.
--
-- Two reasons this is not localStorage. Preferences that live in a browser are
-- not really yours - they follow the machine, not the person, so signing in
-- somewhere else silently resets who your assistant is and what theme you use.
-- And an API key in localStorage is readable by any script that ever runs on
-- the page, which is the wrong place for a credential by any standard.
--
-- The keys are stored encrypted with the same scheme and the same
-- WORKOS_SECRETS_KEY as the secrets vault, in the same `v1.<iv>.<ciphertext>`
-- format. They are write-only across the API: a client can set one or clear
-- one, and can ask whether one exists, but can never read it back.

alter table public.user_preferences
  add column if not exists cherry_avatar text not null default 'cherry',
  add column if not exists cherry_voice boolean not null default true,
  -- Never returned to the browser. See handlePreferences in the edge function.
  add column if not exists anthropic_key_encrypted text,
  add column if not exists gemini_key_encrypted text,
  -- Last four characters only, so the UI can show *which* key is set without
  -- ever holding the key itself.
  add column if not exists anthropic_key_hint text,
  add column if not exists gemini_key_hint text;

-- 'auto' picks whichever of the user's own keys exists, then the server's.
alter table public.user_preferences
  alter column cherry_provider set default 'auto';

comment on column public.user_preferences.anthropic_key_encrypted is
  'v1.<base64url iv>.<base64url ciphertext>, AES-GCM under WORKOS_SECRETS_KEY. Write-only over the API.';
comment on column public.user_preferences.gemini_key_encrypted is
  'v1.<base64url iv>.<base64url ciphertext>, AES-GCM under WORKOS_SECRETS_KEY. Write-only over the API.';
