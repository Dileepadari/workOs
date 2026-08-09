// Shared metadata for the secrets vault, kept beside taskMeta.ts for the same
// reason: one place for the category/label/colour maps instead of a copy per
// component.

export const SECRET_CATEGORIES = [
  'api_key',
  'password',
  'token',
  'ssh_key',
  'database',
  'certificate',
  'other',
] as const;

export type SecretCategory = (typeof SECRET_CATEGORIES)[number];

export const SECRET_CATEGORY_LABELS: Record<SecretCategory, string> = {
  api_key: 'API Key',
  password: 'Password',
  token: 'Token',
  ssh_key: 'SSH Key',
  database: 'Database',
  certificate: 'Certificate',
  other: 'Other',
};

// Low-opacity tints, same rationale as TASK_STATUS_COLORS: at /20 the text
// sits too close in luminance to the tint to clear AA contrast in dark mode.
export const SECRET_CATEGORY_COLORS: Record<SecretCategory, string> = {
  api_key: 'bg-primary/10 text-primary',
  password: 'bg-destructive/10 text-destructive',
  token: 'bg-accent/10 text-accent',
  ssh_key: 'bg-warning/10 text-warning',
  database: 'bg-success/10 text-success',
  certificate: 'bg-muted text-muted-foreground',
  other: 'bg-secondary text-secondary-foreground',
};

export function secretCategoryLabel(category: string): string {
  return SECRET_CATEGORY_LABELS[category as SecretCategory] ?? category;
}

export function secretCategoryColor(category: string): string {
  return SECRET_CATEGORY_COLORS[category as SecretCategory] ?? SECRET_CATEGORY_COLORS.other;
}

/**
 * Placeholder shown in place of a hidden value. Deliberately a fixed width -
 * the real length is itself a hint about the secret, so it isn't leaked to
 * anyone reading over your shoulder.
 */
export const MASKED_VALUE = '••••••••••••';

/** How long a revealed secret stays on screen before re-masking itself. */
export const REVEAL_TIMEOUT_MS = 30_000;
