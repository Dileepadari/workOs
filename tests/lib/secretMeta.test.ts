import { describe, it, expect } from 'vitest';
import {
  SECRET_CATEGORIES, SECRET_CATEGORY_LABELS, SECRET_CATEGORY_COLORS,
  secretCategoryLabel, secretCategoryColor, MASKED_VALUE,
} from '@/lib/secretMeta';

describe('secret categories', () => {
  it('has a label and a colour for every category', () => {
    for (const category of SECRET_CATEGORIES) {
      expect(SECRET_CATEGORY_LABELS[category]).toBeTruthy();
      expect(SECRET_CATEGORY_COLORS[category]).toBeTruthy();
    }
  });

  it('resolves known categories to their label', () => {
    expect(secretCategoryLabel('api_key')).toBe('API Key');
    expect(secretCategoryLabel('ssh_key')).toBe('SSH Key');
  });

  it('falls back gracefully for a category written by an older client', () => {
    expect(secretCategoryLabel('legacy_kind')).toBe('legacy_kind');
    expect(secretCategoryColor('legacy_kind')).toBe(SECRET_CATEGORY_COLORS.other);
  });
});

describe('MASKED_VALUE', () => {
  it('is a fixed-width placeholder, so the real length is not leaked', () => {
    expect(MASKED_VALUE.length).toBeGreaterThan(0);
    expect(new Set(MASKED_VALUE)).toEqual(new Set(['•']));
  });
});
