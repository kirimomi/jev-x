/**
 * OGP (Open Graph Protocol) link card information
 */
export interface OgpCardInfo {
  title?: string;
  description?: string;
  domain?: string;
  url?: string;
}

/**
 * Extracted Tweet / Post data from X (Twitter) DOM
 */
export interface TweetData {
  id: string;
  authorUsername: string;
  authorName?: string;
  text: string;
  ogp?: OgpCardInfo;
  imageAlts?: string[];
  isReply?: boolean;
}

/**
 * Filter Category Identifier
 */
export type CategoryId =
  | 'adult_nsfw'
  | 'ai_slop'
  | 'impression_zombie'
  | 'thread_bait'
  | 'rage_bait'
  | 'scam_hustle'
  | 'toxic_venting'
  | 'preachy_guru'
  | 'affiliate_spam'
  | 'spoilers';

/**
 * Configuration for a single filter category
 */
export interface CategoryDefinition {
  id: CategoryId;
  name: string;
  description: string;
  /** Natural language instruction question evaluated by Jev */
  instruction: string;
  /** Default threshold (0.0 - 1.0). Probability >= threshold triggers mask. */
  defaultThreshold: number;
  /** Whether enabled by default */
  defaultEnabled: boolean;
  /** Icon/emoji for UI badge */
  badgeIcon: string;
}

/**
 * User's customized category preference
 */
export interface CategorySetting {
  enabled: boolean;
  threshold: number;
}

/**
 * Full user filter preferences
 */
export interface UserFilterSettings {
  categories: Record<CategoryId, CategorySetting>;
  globalEnabled: boolean;
}

/**
 * Individual category evaluation result
 */
export interface CategoryScoreResult {
  categoryId: CategoryId;
  probability: number;
  matched: boolean;
  threshold: number;
}

/**
 * Overall filtering decision for a tweet
 */
export interface FilterDecision {
  tweetId: string;
  shouldFilter: boolean;
  primaryReason?: CategoryId;
  primaryProbability?: number;
  matchedCategories: CategoryScoreResult[];
  evaluatedAt: number; // timestamp
  latencyMs: number;
}
