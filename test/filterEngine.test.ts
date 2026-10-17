import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FilterEngine } from '../src/core/filterEngine.js';
import { getDefaultUserSettings } from '../src/core/categories.js';
import { computeJevTargetDimensions, normalizeTwimgUrlForJev } from '../src/extension/background/jevImageService.js';
import { TweetData, UserFilterSettings } from '../src/types/index.js';

describe('FilterEngine (mockMode)', () => {
  let engine: FilterEngine;
  let defaultSettings: UserFilterSettings;

  beforeEach(() => {
    engine = new FilterEngine({ mockMode: true });
    defaultSettings = getDefaultUserSettings();
  });

  it('returns shouldFilter=false when globalEnabled is false', async () => {
    const settings = { ...defaultSettings, globalEnabled: false };
    const tweet: TweetData = {
      id: 'tweet-1',
      authorUsername: 'spammer',
      text: '裏垢女子 パパ活募集',
    };
    const decision = await engine.evaluateTweet(tweet, settings);
    expect(decision.shouldFilter).toBe(false);
    expect(decision.matchedCategories.length).toBe(0);
  });

  it('returns shouldFilter=false when no categories are enabled', async () => {
    const settings = { ...defaultSettings };
    for (const catId of Object.keys(settings.categories) as (keyof typeof settings.categories)[]) {
      settings.categories[catId] = { enabled: false, threshold: 0.5 };
    }
    const tweet: TweetData = {
      id: 'tweet-2',
      authorUsername: 'spammer',
      text: '裏垢女子 パパ活募集',
    };
    const decision = await engine.evaluateTweet(tweet, settings);
    expect(decision.shouldFilter).toBe(false);
  });

  it('filters tweet matching threshold and picks primaryReason with highest probability', async () => {
    const tweet: TweetData = {
      id: 'tweet-3',
      authorUsername: 'slop_creator',
      text: 'chatgptでai美女を自動生成して量産する方法！',
    };
    const decision = await engine.evaluateTweet(tweet, defaultSettings);
    expect(decision.shouldFilter).toBe(true);
    expect(decision.primaryReason).toBe('ai_slop');
    expect(decision.primaryProbability).toBeGreaterThanOrEqual(0.5);
  });

  it('respects requireMediaForAdult setting when media is absent', async () => {
    const settings: UserFilterSettings = {
      ...defaultSettings,
      requireMediaForAdult: true,
    };
    // Text-only adult spam without images, cards, or warning
    const tweet: TweetData = {
      id: 'tweet-4',
      authorUsername: 'adult_user',
      text: '裏垢女子 パパ活募集 風俗',
      hasSensitiveWarning: false,
      imageAlts: [],
    };
    const decision = await engine.evaluateTweet(tweet, settings);
    // With requireMediaForAdult, text-only adult_nsfw is skipped
    const adultMatched = decision.matchedCategories.find(c => c.categoryId === 'adult_nsfw');
    expect(adultMatched).toBeUndefined();
  });

  it('caches raw category scores and recalculates decision when settings change', async () => {
    const tweet: TweetData = {
      id: 'cached-1',
      authorUsername: 'user',
      text: '誰でも稼げる副業で月100万！不労所得のプレゼント企画です',
    };
    const decision1 = await engine.evaluateTweet(tweet, defaultSettings);
    expect(decision1.shouldFilter).toBe(true);
    expect(decision1.primaryReason).toBe('scam_hustle');

    // Disable the matched category: decision becomes false without needing re-evaluating state
    const modifiedSettings = {
      ...defaultSettings,
      categories: {
        ...defaultSettings.categories,
        scam_hustle: { enabled: false, threshold: 0.5 },
      },
    };
    const decision2 = await engine.evaluateTweet(tweet, modifiedSettings);
    expect(decision2.shouldFilter).toBe(false);
  });

  it('sends attached_image and TypeSafe-Danger-Zone-Images header when jevImageBytes is provided, and falls back to text-only on image error', async () => {
    const apiEngine = new FilterEngine({ apiKey: 'ts_test_key' });
    const evalSpy = vi.fn()
      // First call with image rejects (e.g., 400 Invalid image dimensions)
      .mockRejectedValueOnce(new Error('Invalid image'))
      // Second call (text-only fallback) resolves
      .mockResolvedValueOnce({
        answers: {
          adult_nsfw: { type: 'noul', noul: 0.05 },
          ai_slop: { type: 'noul', noul: 0.91 },
          impression_zombie: { type: 'noul', noul: 0.02 },
          scam_hustle: { type: 'noul', noul: 0.01 },
          aggressive_polarizing: { type: 'noul', noul: 0.01 },
          engagement_bait: { type: 'noul', noul: 0.02 },
          spoilers: { type: 'noul', noul: 0.01 },
          misinformation: { type: 'noul', noul: 0.01 },
        },
      });
    (apiEngine as any).client = { systemOne: evalSpy };

    const tweet: TweetData = {
      id: 'jev-img-1',
      authorUsername: 'ai_poster',
      text: 'おはようございます☀️',
      primaryImageUrl: 'https://pbs.twimg.com/media/abc123?format=jpg&name=small',
      jevImageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    };

    const decision = await apiEngine.evaluateTweet(tweet, {
      ...defaultSettings,
      imageVisionMode: 'jev',
    });

    expect(evalSpy).toHaveBeenCalledTimes(2);
    // 1st call: includes attached_image and TypeSafe-Danger-Zone-Images header
    expect(evalSpy.mock.calls[0][0].state).toHaveProperty('attached_image');
    expect(evalSpy.mock.calls[0][1]).toEqual({
      headers: { 'TypeSafe-Danger-Zone-Images': 'true' },
    });
    // 2nd call: fallback to text-only state without headers
    expect(evalSpy.mock.calls[1][0].state).not.toHaveProperty('attached_image');
    expect(decision.shouldFilter).toBe(true);
    expect(decision.primaryReason).toBe('ai_slop');
  });
});

describe('jevImageService helpers', () => {
  it('normalizes pbs.twimg.com URLs to format=jpg&name=small', () => {
    expect(
      normalizeTwimgUrlForJev('https://pbs.twimg.com/media/Gxyz123?format=webp&name=large')
    ).toBe('https://pbs.twimg.com/media/Gxyz123?format=jpg&name=small');
  });

  it('computes target dimensions with short side ~320px and enforces [280, 1568] bounds', () => {
    // 1024x1024 square -> 320x320
    expect(computeJevTargetDimensions(1024, 1024)).toEqual({ width: 320, height: 320 });
    // 1200x675 (16:9) -> short side 320, long side 569
    expect(computeJevTargetDimensions(1200, 675)).toEqual({ width: 569, height: 320 });
    // Rejected if either original dimension is < 280px
    expect(computeJevTargetDimensions(240, 500)).toBeNull();
    // Extreme banner aspect ratio that cannot keep both sides in [280, 1568]
    expect(computeJevTargetDimensions(3000, 300)).toBeNull();
  });
});
