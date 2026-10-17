import { describe, it, expect } from 'vitest';
import { getDefaultUserSettings, FILTER_CATEGORIES } from '../src/core/categories.js';

describe('getDefaultUserSettings', () => {
  it('returns valid default user settings matching the 8 category definitions (all enabled by default)', () => {
    const settings = getDefaultUserSettings();
    expect(settings.globalEnabled).toBe(true);
    expect(settings.showDebugBadges).toBe(true);
    expect(settings.showFoldBanner).toBe(true);
    expect(settings.imageVisionMode).toBe('local');
    expect(FILTER_CATEGORIES.map((c) => c.id)).toEqual([
      'adult_nsfw',
      'rage_bait',
      'toxic_venting',
      'scam_hustle',
      'affiliate_spam',
      'thread_bait',
      'ai_slop',
      'impression_zombie',
    ]);

    for (const cat of FILTER_CATEGORIES) {
      expect(cat.defaultEnabled).toBe(true);
      expect(settings.categories[cat.id]).toBeDefined();
      expect(settings.categories[cat.id].enabled).toBe(true);
      expect(settings.categories[cat.id].threshold).toBe(cat.defaultThreshold);
    }
  });
});
