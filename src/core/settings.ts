import { UserFilterSettings, CategoryId, CategorySetting } from '../types/index.js';
import { FILTER_CATEGORIES, getDefaultUserSettings } from './categories.js';

export const CURRENT_SETTINGS_VERSION = 3;

/**
 * Normalizes stored settings, ensuring type safety, category validity,
 * threshold clamping, and one-time migration for legacy schemas.
 */
export function normalizeSettings(stored: unknown): UserFilterSettings {
  const defaults = getDefaultUserSettings();

  if (!stored || typeof stored !== 'object') {
    return defaults;
  }

  const raw = stored as Record<string, any>;
  const rawVersion = typeof raw.settingsVersion === 'number' ? raw.settingsVersion : 1;
  const isLegacyV1 = rawVersion < 2;
  const isLegacyPreV3 = rawVersion < 3;

  const normalizedCategories = {} as Record<CategoryId, CategorySetting>;

  for (const cat of FILTER_CATEGORIES) {
    const rawCat =
      raw.categories?.[cat.id] ??
      (cat.id === 'thread_bait' ? raw.categories?.preachy_guru : undefined);
    let enabled = cat.defaultEnabled;
    let threshold = cat.defaultThreshold;

    if (rawCat && typeof rawCat === 'object') {
      if (typeof rawCat.enabled === 'boolean') {
        enabled = rawCat.enabled;
        // One-time migration to v3: toxic_venting and affiliate_spam were default-OFF before v3
        if (isLegacyPreV3 && (cat.id === 'toxic_venting' || cat.id === 'affiliate_spam')) {
          enabled = true;
        }
      }

      if (typeof rawCat.threshold === 'number' && !Number.isNaN(rawCat.threshold)) {
        let val = Math.max(0, Math.min(1, rawCat.threshold));
        // One-time migration: in legacy v1 only, migrate threshold >= 0.7 to 0.5
        if (isLegacyV1 && val >= 0.7) {
          val = 0.5;
        }
        threshold = val;
      }
    }

    normalizedCategories[cat.id] = { enabled, threshold };
  }

  let imageVisionMode: 'local' | 'direct' | 'off' = defaults.imageVisionMode ?? 'local';
  if (raw.imageVisionMode === 'local' || raw.imageVisionMode === 'direct' || raw.imageVisionMode === 'off') {
    imageVisionMode = raw.imageVisionMode;
  } else if (raw.imageVisionMode === 'jev') {
    // Phase 2 (Issue #18): the direct-attachment mode was named after the
    // Jev engine; it now applies to whichever engine is active.
    imageVisionMode = 'direct';
  } else if (typeof raw.enableImageVision === 'boolean') {
    imageVisionMode = raw.enableImageVision ? 'local' : 'off';
  }
  const enableImageVision = imageVisionMode === 'local';

  return {
    categories: normalizedCategories,
    globalEnabled: typeof raw.globalEnabled === 'boolean' ? raw.globalEnabled : defaults.globalEnabled,
    showDebugBadges: typeof raw.showDebugBadges === 'boolean' ? raw.showDebugBadges : defaults.showDebugBadges,
    showFoldBanner: typeof raw.showFoldBanner === 'boolean' ? raw.showFoldBanner : defaults.showFoldBanner,
    enableImageVision,
    imageVisionMode,
    globalSensitivityMultiplier: typeof raw.globalSensitivityMultiplier === 'number' && !Number.isNaN(raw.globalSensitivityMultiplier) ? Math.max(0, raw.globalSensitivityMultiplier) : defaults.globalSensitivityMultiplier,
    evaluationEngine: raw.evaluationEngine === 'decisions' ? 'decisions' : 'jev',
    settingsVersion: CURRENT_SETTINGS_VERSION,
  };
}
