import { describe, it, expect, beforeEach } from 'vitest';
import { FilterEngine } from '../src/core/filterEngine.js';
import { getDefaultUserSettings } from '../src/core/categories.js';
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
});
