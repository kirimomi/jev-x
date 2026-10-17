import { TypeSafeClient, image, noul, type NoulQuestion } from '@typesafe-ai/sdk';
import {
  TweetData,
  CategoryId,
  UserFilterSettings,
  FilterDecision,
} from '../types/index.js';
import { CATEGORY_MAP } from './categories.js';
import { mockEvaluate } from './mockEvaluator.js';
import { decide, createUnfilteredDecision } from './decision.js';

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

  if (tweet.quoteText) {
    parts.push(`[引用元ポスト]:\n${tweet.quoteText}`);
  }

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

  if (tweet.hasSensitiveWarning) {
    parts.push(`[X公式フラグ]: センシティブ警告オーバーレイあり (成人向け/閲覧注意判定)`);
  }

  // Only include local NSFWJS text summary when Jev direct image attachment is NOT active
  if (!tweet.jevImageBytes && tweet.vision && tweet.vision.hasImages && tweet.vision.label !== 'JevVision') {
    if (tweet.vision.label === 'Skipped') {
      parts.push(`[画像解析(Vision)]: 無効 (ユーザー設定によりスキップ)`);
    } else {
      parts.push(`[画像解析(Vision)]: 露出度判定=${tweet.vision.label} (露出度スコア: ${(tweet.vision.exposureScore * 100).toFixed(0)}%, NSFW疑い=${tweet.vision.isLikelyNsfw ? '高' : '低'})`);
    }
  }

  return parts.join('\n\n');
}

export class FilterEngine {
  private client: TypeSafeClient | null = null;
  private mockMode: boolean;
  // Cache raw evaluated scores keyed by composite state hash (tweet.id + state signature)
  private scoreCache = new Map<string, Record<CategoryId, number>>();

  constructor(options: FilterEngineOptions = {}) {
    this.mockMode = Boolean(options.mockMode || !options.apiKey);

    if (options.apiKey && !this.mockMode) {
      this.client = new TypeSafeClient({
        apiKey: options.apiKey,
        dangerouslyAllowBrowser: true,
      });
    }
  }

  /**
   * Generates a composite cache key that changes when media or late-loaded content appears
   */
  private getCacheKey(tweet: TweetData): string {
    const imgCount = tweet.vision?.imageCount ?? (tweet.imageAlts?.length ?? 0);
    const hasWarn = tweet.hasSensitiveWarning ? '1' : '0';
    const exp = tweet.vision?.exposureScore ?? 0;
    const hasJevImg = tweet.jevImageBytes ? 'jev1' : 'jev0';
    return `${tweet.id}:${imgCount}:${hasWarn}:${exp}:${hasJevImg}`;
  }

  /**
   * Evaluates a single tweet against user filter settings
   */
  async evaluateTweet(
    tweet: TweetData,
    settings: UserFilterSettings
  ): Promise<FilterDecision> {
    if (!settings.globalEnabled) {
      return createUnfilteredDecision(tweet.id, 0, tweet.vision);
    }

    const startTime = performance.now();
    const cacheKey = this.getCacheKey(tweet);
    let categoryScores = this.scoreCache.get(cacheKey);

    if (!categoryScores) {
      // Collect active categories
      const activeCategoryIds = (Object.keys(settings.categories) as CategoryId[]).filter(
        (catId) => settings.categories[catId]?.enabled
      );

      if (activeCategoryIds.length === 0) {
        return createUnfilteredDecision(tweet.id, 0, tweet.vision);
      }

      if (this.mockMode || !this.client) {
        categoryScores = mockEvaluate(tweet, activeCategoryIds);
        this.scoreCache.set(cacheKey, categoryScores);
      } else {
        const stateText = buildTweetState(tweet);
        const questions: Record<string, NoulQuestion> = {};
        for (const catId of activeCategoryIds) {
          const catDef = CATEGORY_MAP.get(catId);
          if (catDef) {
            questions[catId] = noul(catDef.instruction);
          }
        }

        try {
          const callSystemOne = async (useImage: boolean) => {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Jev API timeout')), 8000)
            );
            const reqCall =
              useImage && tweet.jevImageBytes
                ? this.client!.systemOne(
                    {
                      state: {
                        post: stateText,
                        attached_image: image(tweet.jevImageBytes),
                      },
                      questions,
                    },
                    {
                      headers: { 'TypeSafe-Danger-Zone-Images': 'true' },
                    }
                  )
                : this.client!.systemOne({ state: stateText, questions });

            return Promise.race([reqCall, timeoutPromise]);
          };

          let response;
          if (tweet.jevImageBytes) {
            try {
              response = await callSystemOne(true);
            } catch (imgErr) {
              console.warn(`[FilterEngine] Jev image evaluation failed for ${tweet.id}, falling back to text-only:`, imgErr);
              response = await callSystemOne(false);
            }
          } else {
            response = await callSystemOne(false);
          }

          categoryScores = {} as Record<CategoryId, number>;
          for (const catId of activeCategoryIds) {
            const ans = response.answers[catId];
            categoryScores[catId] = ans?.type === 'noul' ? ans.noul : 0;
          }
          this.scoreCache.set(cacheKey, categoryScores);
        } catch (error) {
          console.error(`[FilterEngine] Jev API error for tweet ${tweet.id}:`, error);
          return createUnfilteredDecision(
            tweet.id,
            Math.round(performance.now() - startTime),
            tweet.vision
          );
        }
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);
    return decide(categoryScores, tweet, settings, latencyMs);
  }

  /**
   * Batch evaluate multiple tweets with concurrency limit (semaphore of 4)
   */
  async evaluateBatch(
    tweets: TweetData[],
    settings: UserFilterSettings,
    concurrency = 4
  ): Promise<FilterDecision[]> {
    const results: FilterDecision[] = new Array(tweets.length);
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < tweets.length) {
        const idx = currentIndex++;
        results[idx] = await this.evaluateTweet(tweets[idx], settings);
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, tweets.length) },
      () => worker()
    );

    await Promise.all(workers);
    return results;
  }

  clearCache(): void {
    this.scoreCache.clear();
  }
}
