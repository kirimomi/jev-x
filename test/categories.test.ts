import { describe, it, expect } from 'vitest';
import { getDefaultUserSettings, FILTER_CATEGORIES } from '../src/core/categories.js';

describe('getDefaultUserSettings', () => {
  it('returns valid default user settings matching category definitions', () => {
    const settings = getDefaultUserSettings();
    expect(settings.globalEnabled).toBe(true);
    expect(settings.showDebugBadges).toBe(true);
    expect(settings.showFoldBanner).toBe(true);
    expect(settings.requireMediaForAdult).toBe(false);

    for (const cat of FILTER_CATEGORIES) {
      expect(settings.categories[cat.id]).toBeDefined();
      expect(settings.categories[cat.id].enabled).toBe(cat.defaultEnabled);
      expect(settings.categories[cat.id].threshold).toBe(cat.defaultThreshold);
    }
  });
});
