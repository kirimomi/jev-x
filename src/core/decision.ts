import {
  TweetData,
  CategoryId,
  UserFilterSettings,
  FilterDecision,
  CategoryScoreResult,
  ImageVisionResult,
} from '../types/index.js';
import { CATEGORY_MAP } from './categories.js';

/**
 * Creates an unfiltered decision object
 */
export function createUnfilteredDecision(
  tweetId: string,
  latencyMs: number = 0,
  visionResult?: ImageVisionResult
): FilterDecision {
  return {
    tweetId,
    shouldFilter: false,
    matchedCategories: [],
    visionResult,
    evaluatedAt: Date.now(),
    latencyMs,
  };
}

/**
 * Pure function that computes a FilterDecision given category scores, tweet data, and settings.
 */
export function decide(
  categoryScores: Partial<Record<CategoryId, number>>,
  tweet: TweetData,
  settings: UserFilterSettings,
  latencyMs: number = 0
): FilterDecision {
  const activeCategoryIds = (Object.keys(settings.categories) as CategoryId[]).filter(
    (catId) => settings.categories[catId]?.enabled
  );

  const matchedCategories: CategoryScoreResult[] = [];
  let primaryReason: CategoryId | undefined;
  let highestProbability = -1;

  const hasMedia = Boolean(
    tweet.hasSensitiveWarning ||
    (tweet.vision && tweet.vision.hasImages && tweet.vision.imageCount > 0) ||
    (tweet.imageAlts && tweet.imageAlts.length > 0)
  );

  for (const catId of activeCategoryIds) {
    if (catId === 'adult_nsfw' && settings.requireMediaForAdult && !hasMedia) {
      continue;
    }

    const prob = categoryScores[catId] ?? 0;
    const rawThreshold = settings.categories[catId]?.threshold ?? (CATEGORY_MAP.get(catId)?.defaultThreshold ?? 0.5);
    const multiplier = settings.globalSensitivityMultiplier ?? 1.0;
    const threshold = Math.max(0, Math.min(1, rawThreshold * multiplier));
    const isMatched = prob >= threshold;

    if (isMatched) {
      matchedCategories.push({
        categoryId: catId,
        probability: prob,
        matched: true,
        threshold,
      });

      if (prob > highestProbability) {
        highestProbability = prob;
        primaryReason = catId;
      }
    }
  }

  return {
    tweetId: tweet.id,
    shouldFilter: matchedCategories.length > 0,
    primaryReason,
    primaryProbability: primaryReason ? highestProbability : undefined,
    matchedCategories,
    allScores: categoryScores,
    visionResult: tweet.vision,
    evaluatedAt: Date.now(),
    latencyMs,
  };
}
