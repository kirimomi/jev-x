import { describe, it, expect } from 'vitest';
import { normalizeSettings, CURRENT_SETTINGS_VERSION } from '../src/core/settings.js';
import { getDefaultUserSettings } from '../src/core/categories.js';

describe('normalizeSettings', () => {
  it('returns default settings when stored is null or invalid', () => {
    const defaults = getDefaultUserSettings();
    expect(normalizeSettings(null)).toEqual(defaults);
    expect(normalizeSettings(undefined)).toEqual(defaults);
    expect(normalizeSettings('invalid')).toEqual(defaults);
  });

  it('migrates legacy v1 settings (threshold >= 0.7 becomes 0.5)', () => {
    const legacyStored = {
      categories: {
        adult_nsfw: { enabled: true, threshold: 0.8 },
        ai_slop: { enabled: true, threshold: 0.7 },
        impression_zombie: { enabled: true, threshold: 0.6 },
      },
      globalEnabled: true,
      // No settingsVersion, treated as v1
    };

    const normalized = normalizeSettings(legacyStored);
    expect(normalized.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
    // Migrated from >= 0.7 to 0.5
    expect(normalized.categories.adult_nsfw.threshold).toBe(0.5);
    expect(normalized.categories.ai_slop.threshold).toBe(0.5);
    // Below 0.7 preserved
    expect(normalized.categories.impression_zombie.threshold).toBe(0.6);
  });

  it('preserves user threshold >= 0.7 when settingsVersion is 2', () => {
    const v2Stored = {
      settingsVersion: 2,
      categories: {
        adult_nsfw: { enabled: true, threshold: 0.8 },
        ai_slop: { enabled: false, threshold: 0.95 },
      },
      globalEnabled: true,
      showDebugBadges: false,
    };

    const normalized = normalizeSettings(v2Stored);
    expect(normalized.settingsVersion).toBe(2);
    // User set 80%, must NOT be overwritten with 50%
    expect(normalized.categories.adult_nsfw.threshold).toBe(0.8);
    expect(normalized.categories.ai_slop.threshold).toBe(0.95);
    expect(normalized.showDebugBadges).toBe(false);
  });

  it('clamps thresholds to [0, 1] and restores defaults for invalid values', () => {
    const raw = {
      settingsVersion: 2,
      categories: {
        adult_nsfw: { enabled: 'not-bool' as any, threshold: 1.5 },
        ai_slop: { enabled: false, threshold: -0.2 },
        spoilers: { enabled: true, threshold: NaN },
      },
    };

    const normalized = normalizeSettings(raw);
    expect(normalized.categories.adult_nsfw.threshold).toBe(1.0);
    expect(normalized.categories.adult_nsfw.enabled).toBe(true); // default
    expect(normalized.categories.ai_slop.threshold).toBe(0.0);
    expect(normalized.categories.spoilers.threshold).toBe(0.5); // default fallback for NaN
  });

  it('discards unknown categories and fills missing ones with defaults', () => {
    const raw = {
      settingsVersion: 2,
      categories: {
        unknown_cat_xyz: { enabled: true, threshold: 0.9 },
      },
    };

    const normalized = normalizeSettings(raw);
    expect((normalized.categories as any).unknown_cat_xyz).toBeUndefined();
    expect(normalized.categories.adult_nsfw).toBeDefined();
    expect(normalized.categories.adult_nsfw.threshold).toBe(0.5);
  });
});
