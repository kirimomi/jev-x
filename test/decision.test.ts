import { describe, it, expect } from 'vitest';
import { decide, createUnfilteredDecision } from '../src/core/decision.js';
import { classifyExposure, EXPOSURE_THRESHOLDS } from '../src/core/visionAnalyzer.js';
import { getDefaultUserSettings } from '../src/core/categories.js';
import { TweetData, CategoryId } from '../src/types/index.js';

describe('classifyExposure', () => {
  it('classifies score >= 0.45 as Explicit and likely NSFW', () => {
    expect(classifyExposure(EXPOSURE_THRESHOLDS.EXPLICIT)).toEqual({
      label: 'Explicit',
      isLikelyNsfw: true,
    });
    expect(classifyExposure(0.85)).toEqual({
      label: 'Explicit',
      isLikelyNsfw: true,
    });
  });

  it('classifies score >= 0.28 and < 0.45 as Sexy and likely NSFW', () => {
    expect(classifyExposure(EXPOSURE_THRESHOLDS.SEXY)).toEqual({
      label: 'Sexy',
      isLikelyNsfw: true,
    });
    expect(classifyExposure(0.35)).toEqual({
      label: 'Sexy',
      isLikelyNsfw: true,
    });
  });

  it('classifies score < 0.28 as Neutral and not NSFW', () => {
    expect(classifyExposure(0.27)).toEqual({
      label: 'Neutral',
      isLikelyNsfw: false,
    });
    expect(classifyExposure(0)).toEqual({
      label: 'Neutral',
      isLikelyNsfw: false,
    });
  });
});

describe('createUnfilteredDecision', () => {
  it('creates clean unfiltered decision', () => {
    const decision = createUnfilteredDecision('tweet-99', 42);
    expect(decision.tweetId).toBe('tweet-99');
    expect(decision.shouldFilter).toBe(false);
    expect(decision.matchedCategories).toEqual([]);
    expect(decision.latencyMs).toBe(42);
  });
});

describe('decide', () => {
  const defaultSettings = getDefaultUserSettings();

  it('matches category when score exceeds threshold and selects highest probability as primaryReason', () => {
    const tweet: TweetData = {
      id: 't-1',
      authorUsername: 'user1',
      text: 'Test content',
    };
    const scores: Partial<Record<CategoryId, number>> = {
      ai_slop: 0.9,
      thread_bait: 0.8,
    };

    const decision = decide(scores, tweet, defaultSettings, 10);
    expect(decision.shouldFilter).toBe(true);
    expect(decision.primaryReason).toBe('ai_slop');
    expect(decision.primaryProbability).toBe(0.9);
    expect(decision.matchedCategories.length).toBe(2);
  });

  it('skips adult_nsfw when requireMediaForAdult is enabled and tweet has no media', () => {
    const tweet: TweetData = {
      id: 't-2',
      authorUsername: 'user2',
      text: 'Text only adult words',
      hasSensitiveWarning: false,
      imageAlts: [],
    };
    const scores: Partial<Record<CategoryId, number>> = {
      adult_nsfw: 0.95,
    };
    const settings = { ...defaultSettings, requireMediaForAdult: true };

    const decision = decide(scores, tweet, settings);
    expect(decision.shouldFilter).toBe(false);
    expect(decision.matchedCategories).toEqual([]);
  });

  it('matches adult_nsfw when requireMediaForAdult is enabled and tweet has images', () => {
    const tweet: TweetData = {
      id: 't-3',
      authorUsername: 'user3',
      text: 'Adult post with image',
      vision: {
        hasImages: true,
        imageCount: 1,
        exposureScore: 0.9,
        isLikelyNsfw: true,
        label: 'Explicit',
      },
    };
    const scores: Partial<Record<CategoryId, number>> = {
      adult_nsfw: 0.95,
    };
    const settings = { ...defaultSettings, requireMediaForAdult: true };

    const decision = decide(scores, tweet, settings);
    expect(decision.shouldFilter).toBe(true);
    expect(decision.primaryReason).toBe('adult_nsfw');
  });
});
