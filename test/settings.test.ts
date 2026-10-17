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

  it('preserves user threshold >= 0.7 when settingsVersion >= 2 and migrates v2 toxic_venting/affiliate_spam to enabled=true', () => {
    const v2Stored = {
      settingsVersion: 2,
      categories: {
        adult_nsfw: { enabled: true, threshold: 0.8 },
        ai_slop: { enabled: false, threshold: 0.95 },
        toxic_venting: { enabled: false, threshold: 0.5 },
        affiliate_spam: { enabled: false, threshold: 0.5 },
      },
      globalEnabled: true,
      showDebugBadges: false,
    };

    const normalized = normalizeSettings(v2Stored);
    expect(normalized.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
    // User set 80%, must NOT be overwritten with 50%
    expect(normalized.categories.adult_nsfw.threshold).toBe(0.8);
    expect(normalized.categories.ai_slop.threshold).toBe(0.95);
    expect(normalized.categories.ai_slop.enabled).toBe(false);
    // Migrated from legacy v2 default-off to v3 default-on
    expect(normalized.categories.toxic_venting.enabled).toBe(true);
    expect(normalized.categories.affiliate_spam.enabled).toBe(true);
    expect(normalized.showDebugBadges).toBe(false);
  });

  it('preserves user-disabled toxic_venting/affiliate_spam when settingsVersion is 3', () => {
    const v3Stored = {
      settingsVersion: 3,
      categories: {
        toxic_venting: { enabled: false, threshold: 0.6 },
        affiliate_spam: { enabled: false, threshold: 0.7 },
      },
    };

    const normalized = normalizeSettings(v3Stored);
    expect(normalized.categories.toxic_venting).toEqual({ enabled: false, threshold: 0.6 });
    expect(normalized.categories.affiliate_spam).toEqual({ enabled: false, threshold: 0.7 });
  });

  it('clamps thresholds to [0, 1] and restores defaults for invalid values', () => {
    const raw = {
      settingsVersion: 2,
      categories: {
        adult_nsfw: { enabled: 'not-bool' as any, threshold: 1.5 },
        ai_slop: { enabled: false, threshold: -0.2 },
        rage_bait: { enabled: true, threshold: NaN },
      },
    };

    const normalized = normalizeSettings(raw);
    expect(normalized.categories.adult_nsfw.threshold).toBe(1.0);
    expect(normalized.categories.adult_nsfw.enabled).toBe(true); // default
    expect(normalized.categories.ai_slop.threshold).toBe(0.0);
    expect(normalized.categories.rage_bait.threshold).toBe(0.5); // default fallback for NaN
  });

  it('discards unknown/removed categories (like spoilers) and fills missing ones with defaults', () => {
    const raw = {
      settingsVersion: 2,
      categories: {
        unknown_cat_xyz: { enabled: true, threshold: 0.9 },
        spoilers: { enabled: true, threshold: 0.8 },
        preachy_guru: { enabled: false, threshold: 0.65 },
      },
    };

    const normalized = normalizeSettings(raw);
    expect((normalized.categories as any).unknown_cat_xyz).toBeUndefined();
    expect((normalized.categories as any).spoilers).toBeUndefined();
    expect((normalized.categories as any).preachy_guru).toBeUndefined();
    // Fallback from legacy preachy_guru when thread_bait is absent
    expect(normalized.categories.thread_bait).toEqual({ enabled: false, threshold: 0.65 });
    expect(normalized.categories.adult_nsfw).toBeDefined();
    expect(normalized.categories.adult_nsfw.threshold).toBe(0.5);
  });

  it('normalizes imageVisionMode and migrates legacy enableImageVision', () => {
    expect(normalizeSettings({ settingsVersion: 2, imageVisionMode: 'jev' }).imageVisionMode).toBe('jev');
    expect(normalizeSettings({ settingsVersion: 2, imageVisionMode: 'jev' }).enableImageVision).toBe(false);

    expect(normalizeSettings({ settingsVersion: 2, imageVisionMode: 'local' }).imageVisionMode).toBe('local');
    expect(normalizeSettings({ settingsVersion: 2, imageVisionMode: 'local' }).enableImageVision).toBe(true);

    expect(normalizeSettings({ settingsVersion: 2, imageVisionMode: 'off' }).imageVisionMode).toBe('off');
    expect(normalizeSettings({ settingsVersion: 2, imageVisionMode: 'off' }).enableImageVision).toBe(false);

    // Legacy fallback when imageVisionMode is absent
    expect(normalizeSettings({ settingsVersion: 2, enableImageVision: false }).imageVisionMode).toBe('off');
    expect(normalizeSettings({ settingsVersion: 2, enableImageVision: true }).imageVisionMode).toBe('local');
  });
});
