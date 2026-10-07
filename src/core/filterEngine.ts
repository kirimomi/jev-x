import { TypeSafeClient, noul, type NoulQuestion } from '@typesafe-ai/sdk';
import {
  TweetData,
  CategoryId,
  UserFilterSettings,
  FilterDecision,
  CategoryScoreResult,
} from '../types/index.js';
import { CATEGORY_MAP } from './categories.js';

export interface FilterEngineOptions {
  apiKey?: string;
  mockMode?: boolean;
}

/**
 * Builds structured State context for Jev evaluation
 */
export function buildTweetState(tweet: TweetData): string {
  const parts: string[] = [];

  const authorPart = tweet.authorName
    ? `[投稿者]: ${tweet.authorName} (@${tweet.authorUsername})`
    : `[投稿者]: @${tweet.authorUsername}`;
  parts.push(authorPart);

  if (tweet.isReply) {
    parts.push(`[投稿種別]: 他ユーザーへの返信 (リプライ)`);
  }

  parts.push(`[本文]:\n${tweet.text}`);

  if (tweet.ogp) {
    const ogpLines: string[] = ['[リンクカード(OGP)]:'];
    if (tweet.ogp.title) ogpLines.push(`  - タイトル: ${tweet.ogp.title}`);
    if (tweet.ogp.description) ogpLines.push(`  - 説明: ${tweet.ogp.description}`);
    if (tweet.ogp.domain) ogpLines.push(`  - ドメイン: ${tweet.ogp.domain}`);
    if (tweet.ogp.url) ogpLines.push(`  - URL: ${tweet.ogp.url}`);
    parts.push(ogpLines.join('\n'));
  }

  if (tweet.imageAlts && tweet.imageAlts.length > 0) {
    parts.push(`[画像説明(ALT)]: ${tweet.imageAlts.join(', ')}`);
  }

  return parts.join('\n\n');
}

/**
 * Mock evaluation for local testing without spending API credits
 */
function mockEvaluate(
  tweet: TweetData,
  activeCategoryIds: CategoryId[]
): Record<CategoryId, number> {
  const scores: Record<CategoryId, number> = {} as Record<CategoryId, number>;
  const text = (
    tweet.text +
    ' ' +
    (tweet.ogp?.title || '') +
    ' ' +
    (tweet.ogp?.description || '') +
    ' ' +
    (tweet.ogp?.domain || '')
  ).toLowerCase();

  for (const catId of activeCategoryIds) {
    scores[catId] = 0.05; // baseline low probability
  }

  if (activeCategoryIds.includes('adult_nsfw')) {
    if (text.includes('裏垢') || text.includes('オナ') || text.includes('エロ') || text.includes('nsfw') || text.includes('パパ活')) {
      scores['adult_nsfw'] = 0.95;
    }
  }

  if (activeCategoryIds.includes('ai_slop')) {
    if (text.includes('ai美女') || text.includes('chatgptに聞いたら') || text.includes('ai生成') || text.includes('slop') || text.includes('midjourney')) {
      scores['ai_slop'] = 0.92;
    }
  }

  if (activeCategoryIds.includes('impression_zombie')) {
    if (tweet.isReply && (tweet.text.length < 10 || /^[\p{Emoji}\s]+$/u.test(tweet.text) || /[\u0600-\u06FF]/.test(tweet.text))) {
      scores['impression_zombie'] = 0.96;
    }
  }

  if (activeCategoryIds.includes('thread_bait')) {
    if (text.includes('最後にとんでもない') || text.includes('続きはツリー') || text.includes('プロフへ') || text.includes('👇') || text.includes('1/')) {
      scores['thread_bait'] = 0.88;
    }
  }

  if (activeCategoryIds.includes('scam_hustle')) {
    if (text.includes('月100万') || text.includes('brain') || text.includes('プレゼント企画') || text.includes('プロンプト配布') || text.includes('誰でも稼げる')) {
      scores['scam_hustle'] = 0.94;
    }
  }

  if (activeCategoryIds.includes('rage_bait')) {
    if (text.includes('男はこれだから') || text.includes('女の敵') || text.includes('z世代は') || text.includes('民度低すぎ')) {
      scores['rage_bait'] = 0.89;
    }
  }

  if (activeCategoryIds.includes('toxic_venting')) {
    if (text.includes('死ね') || text.includes('ゴミすぎる') || text.includes('消えろ') || text.includes('クソが')) {
      scores['toxic_venting'] = 0.91;
    }
  }

  if (activeCategoryIds.includes('preachy_guru')) {
    if (text.includes('優秀な人ほど') || text.includes('残酷な真実') || text.includes('30代で気づいたこと')) {
      scores['preachy_guru'] = 0.86;
    }
  }

  if (activeCategoryIds.includes('affiliate_spam')) {
    if (text.includes('セールでこれだけは買え') || text.includes('リプ欄にお得') || text.includes('amzn.to')) {
      scores['affiliate_spam'] = 0.93;
    }
  }

  if (activeCategoryIds.includes('spoilers')) {
    if (text.includes('の結末') || text.includes('が死亡') || text.includes('ネタバレ')) {
      scores['spoilers'] = 0.90;
    }
  }

  return scores;
}

export class FilterEngine {
  private client: TypeSafeClient | null = null;
  private mockMode: boolean;
  private cache = new Map<string, FilterDecision>();

  constructor(options: FilterEngineOptions = {}) {
    this.mockMode = Boolean(options.mockMode || !options.apiKey);

    if (options.apiKey && !this.mockMode) {
      this.client = new TypeSafeClient({
        apiKey: options.apiKey,
      });
    }
  }

  /**
   * Evaluates a single tweet against user filter settings
   */
  async evaluateTweet(
    tweet: TweetData,
    settings: UserFilterSettings
  ): Promise<FilterDecision> {
    if (!settings.globalEnabled) {
      return {
        tweetId: tweet.id,
        shouldFilter: false,
        matchedCategories: [],
        evaluatedAt: Date.now(),
        latencyMs: 0,
      };
    }

    // Check memory cache
    const cached = this.cache.get(tweet.id);
    if (cached) {
      return cached;
    }

    const startTime = performance.now();

    // Collect active categories
    const activeCategoryIds = (Object.keys(settings.categories) as CategoryId[]).filter(
      (catId) => settings.categories[catId]?.enabled
    );

    if (activeCategoryIds.length === 0) {
      return {
        tweetId: tweet.id,
        shouldFilter: false,
        matchedCategories: [],
        evaluatedAt: Date.now(),
        latencyMs: 0,
      };
    }

    const state = buildTweetState(tweet);
    let categoryScores: Record<CategoryId, number>;

    if (this.mockMode || !this.client) {
      categoryScores = mockEvaluate(tweet, activeCategoryIds);
    } else {
      // Build Jev questions object
      const questions: Record<string, NoulQuestion> = {};
      for (const catId of activeCategoryIds) {
        const catDef = CATEGORY_MAP.get(catId);
        if (catDef) {
          questions[catId] = noul(catDef.instruction);
        }
      }

      try {
        const response = await this.client.systemOne({
          state,
          questions,
        });

        categoryScores = {} as Record<CategoryId, number>;
        for (const catId of activeCategoryIds) {
          const ans = response.answers[catId];
          categoryScores[catId] = ans?.type === 'noul' ? ans.noul : 0;
        }
      } catch (error) {
        console.error(`[FilterEngine] Jev API error for tweet ${tweet.id}:`, error);
        // Fallback to safe
        return {
          tweetId: tweet.id,
          shouldFilter: false,
          matchedCategories: [],
          evaluatedAt: Date.now(),
          latencyMs: Math.round(performance.now() - startTime),
        };
      }
    }

    const matchedCategories: CategoryScoreResult[] = [];
    let primaryReason: CategoryId | undefined;
    let highestProbability = -1;

    for (const catId of activeCategoryIds) {
      const prob = categoryScores[catId] ?? 0;
      const threshold = settings.categories[catId]?.threshold ?? 0.7;
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

    const decision: FilterDecision = {
      tweetId: tweet.id,
      shouldFilter: matchedCategories.length > 0,
      primaryReason,
      primaryProbability: primaryReason ? highestProbability : undefined,
      matchedCategories,
      evaluatedAt: Date.now(),
      latencyMs: Math.round(performance.now() - startTime),
    };

    this.cache.set(tweet.id, decision);
    return decision;
  }

  /**
   * Batch evaluate multiple tweets in parallel
   */
  async evaluateBatch(
    tweets: TweetData[],
    settings: UserFilterSettings
  ): Promise<FilterDecision[]> {
    return Promise.all(tweets.map((t) => this.evaluateTweet(t, settings)));
  }

  clearCache(): void {
    this.cache.clear();
  }
}
