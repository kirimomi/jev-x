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
 * Image vision analysis result
 */
export interface ImageVisionResult {
  hasImages: boolean;
  imageCount: number;
  exposureScore: number; // 0.0 - 1.0 (skin/nudity ratio estimate)
  isLikelyNsfw: boolean;
  label: 'Neutral' | 'Sexy' | 'Explicit' | 'WarningOverlay' | 'Skipped';
  details?: string;
  latencyMs?: number;
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
  quoteText?: string;
  imageAlts?: string[];
  isReply?: boolean;
  hasSensitiveWarning?: boolean;
  vision?: ImageVisionResult;
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
  /** Whether to display a compact decision badge on every post */
  showDebugBadges: boolean;
  /** Whether to show accordion fold/unfold banner (true) or completely hide filtered posts without banner (false) */
  showFoldBanner: boolean;
  /** If true, posts without media (no images/cards/sensitive flags) will NOT be filtered as adult_nsfw */
  requireMediaForAdult: boolean;
  /** Whether to run local image recognition (pixel exposure analysis) */
  enableImageVision: boolean;
  /** Schema version for settings persistence & migration */
  settingsVersion?: number;
  /** Global multiplier applied to category thresholds (0.0 to 1.0, representing 0-100%). Defaults to 1.0 */
  globalSensitivityMultiplier?: number;
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
  allScores?: Partial<Record<CategoryId, number>>;
  visionResult?: ImageVisionResult;
  evaluatedAt: number; // timestamp
  latencyMs: number;
}
