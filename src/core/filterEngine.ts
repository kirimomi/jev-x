import { TypeSafeClient, image, noul, type NoulQuestion } from '@typesafe-ai/sdk';
import {
  TweetData,
  CategoryId,
  UserFilterSettings,
  FilterDecision,
  ApiConnectionTestResult,
  EvaluationEngine,
} from '../types/index.js';
import { CATEGORY_MAP } from './categories.js';
import { mockEvaluate } from './mockEvaluator.js';
import { decide, createUnfilteredDecision } from './decision.js';

export interface FilterEngineOptions {
  /** TypeSafe AI (Jev) API key */
  apiKey?: string;
  /** Gemini API key (Decisions engine) */
  geminiApiKey?: string;
  /** Which evaluation engine to use. Defaults to 'jev'. */
  engine?: EvaluationEngine;
  mockMode?: boolean;
}

const DECISIONS_API_URL = 'https://generativelanguage.googleapis.com/v1beta/decisions';
const DECISIONS_MODEL = 'gemini-decision-1';
const DECISIONS_TIMEOUT_MS = 8000;

interface DecisionsAnswer {
  type: string;
  noul?: number;
  confidence?: number;
}

interface DecisionsResponse {
  answers?: Record<string, DecisionsAnswer>;
}

interface DecisionsErrorBody {
  error?: {
    code?: number | string;
    message?: string;
    status?: string;
  };
}

type DecisionsHttpError = Error & { status?: number; apiCode?: number | string };

/** Multimodal input parts for the Decisions API (text-only calls use a plain string) */
type DecisionsInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string; resolution: string };

type DecisionsInput = string | DecisionsInputPart[];

/** Chunked base64 encoding that stays safe for large byte arrays */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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

  // Only include local NSFWJS text summary when direct image attachment is NOT active
  if (!tweet.attachedImageBytes && tweet.vision && tweet.vision.hasImages && tweet.vision.label !== 'DirectVision') {
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
  private geminiApiKey?: string;
  readonly engine: EvaluationEngine;
  readonly mockMode: boolean;
  /** Meta of the most recent real API evaluation, for diagnostics (Issue #18) */
  lastRunMeta?: {
    engine: EvaluationEngine;
    confidences: Partial<Record<CategoryId, number>>;
    error?: string;
    /** Decisions only: an image was attached to the request */
    imageAttached?: boolean;
    /** Decisions only: the image request was rejected and retried text-only */
    imageFallback?: boolean;
  };
  // Cache raw evaluated scores and measured latency keyed by composite state hash (tweet.id + state signature)
  private scoreCache = new Map<string, { scores: Record<CategoryId, number>; latencyMs: number }>();

  constructor(options: FilterEngineOptions = {}) {
    this.engine = options.engine ?? 'jev';
    this.geminiApiKey = options.geminiApiKey;
    const activeKey = this.engine === 'decisions' ? options.geminiApiKey : options.apiKey;
    this.mockMode = Boolean(options.mockMode || !activeKey);

    if (options.apiKey && this.engine === 'jev' && !this.mockMode) {
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
    const hasAttachedImg = tweet.attachedImageBytes ? 'img1' : 'img0';
    return `${tweet.id}:${imgCount}:${hasWarn}:${exp}:${hasAttachedImg}`;
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
    let cached = this.scoreCache.get(cacheKey);
    let categoryScores = cached?.scores;
    let latencyMs = cached?.latencyMs ?? 0;

    if (!categoryScores) {
      // Collect active categories
      const activeCategoryIds = (Object.keys(settings.categories) as CategoryId[]).filter(
        (catId) => settings.categories[catId]?.enabled
      );

      if (activeCategoryIds.length === 0) {
        return createUnfilteredDecision(tweet.id, 0, tweet.vision);
      }

      if (this.mockMode) {
        categoryScores = mockEvaluate(tweet, activeCategoryIds);
        latencyMs = Math.round(performance.now() - startTime);
        this.scoreCache.set(cacheKey, { scores: categoryScores, latencyMs });
      } else {
        const stateText = buildTweetState(tweet);

        try {
          categoryScores =
            this.engine === 'decisions'
              ? await this.evaluateWithDecisions(tweet, stateText, activeCategoryIds)
              : await this.evaluateWithJev(tweet, stateText, activeCategoryIds);
          latencyMs = Math.round(performance.now() - startTime);
          this.scoreCache.set(cacheKey, { scores: categoryScores, latencyMs });
        } catch (error) {
          console.error(`[FilterEngine] ${this.engine} API error for tweet ${tweet.id}:`, error);
          this.lastRunMeta = {
            engine: this.engine,
            confidences: {},
            error: error instanceof Error ? error.message : String(error),
          };
          return createUnfilteredDecision(
            tweet.id,
            Math.round(performance.now() - startTime),
            tweet.vision
          );
        }
      }
    }

    return decide(categoryScores, tweet, settings, latencyMs);
  }

  /**
   * Evaluates with the TypeSafe Jev systemOne API (text, plus an optional
   * direct image attachment with a text-only fallback).
   */
  private async evaluateWithJev(
    tweet: TweetData,
    stateText: string,
    activeCategoryIds: CategoryId[]
  ): Promise<Record<CategoryId, number>> {
    const questions: Record<string, NoulQuestion> = {};
    for (const catId of activeCategoryIds) {
      const catDef = CATEGORY_MAP.get(catId);
      if (catDef) {
        questions[catId] = noul(catDef.instruction);
      }
    }

    const callSystemOne = async (useImage: boolean) => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Jev API timeout')), 8000)
      );
      const reqCall =
        useImage && tweet.attachedImageBytes
          ? this.client!.systemOne(
              {
                state: {
                  post: stateText,
                  attached_image: image(tweet.attachedImageBytes),
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
    if (tweet.attachedImageBytes) {
      try {
        response = await callSystemOne(true);
      } catch (imgErr) {
        console.warn(`[FilterEngine] Jev image evaluation failed for ${tweet.id}, falling back to text-only:`, imgErr);
        response = await callSystemOne(false);
      }
    } else {
      response = await callSystemOne(false);
    }

    const scores = {} as Record<CategoryId, number>;
    const confidences: Partial<Record<CategoryId, number>> = {};
    for (const catId of activeCategoryIds) {
      const ans = response.answers[catId];
      scores[catId] = ans?.type === 'noul' ? ans.noul : 0;
      const conf = (ans as { confidence?: unknown } | undefined)?.confidence;
      if (typeof conf === 'number') confidences[catId] = conf;
    }
    this.lastRunMeta = { engine: 'jev', confidences };
    return scores;
  }

  /**
   * Evaluates with the Gemini Decisions API (Issue #18). When the tweet
   * carries attached image bytes (direct vision mode), they are sent as a
   * multimodal input part alongside the text. If the image request is
   * rejected with HTTP 400 (for example an image_safety block), the call is
   * retried once text-only instead of dropping the tweet to unfiltered.
   */
  private async evaluateWithDecisions(
    tweet: TweetData,
    stateText: string,
    activeCategoryIds: CategoryId[]
  ): Promise<Record<CategoryId, number>> {
    const questions: Record<string, { type: 'noul'; instructions: string }> = {};
    for (const catId of activeCategoryIds) {
      const catDef = CATEGORY_MAP.get(catId);
      if (catDef) {
        questions[catId] = { type: 'noul', instructions: catDef.instruction };
      }
    }

    let data: DecisionsResponse;
    let imageAttached = false;
    let imageFallback = false;
    const imageBytes = tweet.attachedImageBytes;
    if (imageBytes) {
      const parts: DecisionsInputPart[] = [
        { type: 'text', text: stateText },
        {
          type: 'image',
          data: bytesToBase64(imageBytes),
          mime_type: 'image/jpeg',
          resolution: 'low',
        },
      ];
      try {
        data = await this.callDecisions(parts, questions);
        imageAttached = true;
      } catch (err) {
        if ((err as DecisionsHttpError).status !== 400) {
          throw err;
        }
        console.warn(
          `[FilterEngine] Decisions image evaluation failed for ${tweet.id}, falling back to text-only:`,
          err
        );
        data = await this.callDecisions(stateText, questions);
        imageFallback = true;
      }
    } else {
      data = await this.callDecisions(stateText, questions);
    }

    const scores = {} as Record<CategoryId, number>;
    const confidences: Partial<Record<CategoryId, number>> = {};
    for (const catId of activeCategoryIds) {
      const ans = data.answers?.[catId];
      scores[catId] = ans?.type === 'noul' && typeof ans.noul === 'number' ? ans.noul : 0;
      if (ans && typeof ans.confidence === 'number') confidences[catId] = ans.confidence;
    }
    this.lastRunMeta = { engine: 'decisions', confidences, imageAttached, imageFallback };
    return scores;
  }

  /**
   * One POST to the Decisions API. Throws a DecisionsHttpError carrying the
   * HTTP status (and API error code) on failure so callers can classify it.
   */
  private async callDecisions(
    input: DecisionsInput,
    questions: Record<string, { type: 'noul'; instructions: string }>
  ): Promise<DecisionsResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DECISIONS_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(DECISIONS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.geminiApiKey ?? '',
        },
        body: JSON.stringify({ model: DECISIONS_MODEL, input, questions }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Decisions API timeout');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const data = (await response.json().catch(() => null)) as
      | DecisionsResponse
      | DecisionsErrorBody
      | null;
    if (!response.ok || !data || !('answers' in data) || !data.answers) {
      const apiError = (data as DecisionsErrorBody | null)?.error;
      const detail = apiError?.message ?? `HTTP ${response.status}`;
      const error = new Error(
        `Decisions API error (${response.status}): ${detail}`
      ) as DecisionsHttpError;
      error.status = response.status;
      error.apiCode = apiError?.code;
      throw error;
    }
    return data;
  }

  /**
   * Runs one minimal real evaluation to report how far API connectivity
   * actually gets (Issue #16): key presence alone is not "connected".
   */
  async testConnection(): Promise<ApiConnectionTestResult> {
    if (this.mockMode) {
      return { level: 'no-key', latencyMs: 0, engine: this.engine };
    }
    return this.engine === 'decisions'
      ? this.testConnectionDecisions()
      : this.testConnectionJev();
  }

  private async testConnectionJev(): Promise<ApiConnectionTestResult> {
    if (!this.client) {
      return { level: 'no-key', latencyMs: 0, engine: 'jev' };
    }

    const startTime = performance.now();
    const elapsed = () => Math.round(performance.now() - startTime);

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Jev API timeout (connection test)')), 10000)
      );
      const response = await Promise.race([
        this.client.systemOne({
          state: '[投稿者]: @jev_x_test\n\n[本文]:\nこれは接続確認用のテスト文です。',
          questions: { probe: noul('この文は接続確認のためのテスト文である') },
        }),
        timeoutPromise,
      ]);

      const ans = (response as { answers?: Record<string, unknown> }).answers?.probe as
        | { type?: string; noul?: unknown }
        | undefined;
      if (ans && ans.type === 'noul' && typeof ans.noul === 'number') {
        return { level: 'ok', latencyMs: elapsed(), engine: 'jev' };
      }
      return {
        level: 'evaluation-failed',
        latencyMs: elapsed(),
        error: '応答に評価結果（noul）が含まれていませんでした',
        engine: 'jev',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      if (
        lower.includes('401') ||
        lower.includes('403') ||
        lower.includes('unauthorized') ||
        lower.includes('forbidden') ||
        lower.includes('api key') ||
        lower.includes('api_key')
      ) {
        return { level: 'auth-failed', latencyMs: elapsed(), error: message, engine: 'jev' };
      }
      if (
        error instanceof TypeError ||
        lower.includes('timeout') ||
        lower.includes('failed to fetch') ||
        lower.includes('network') ||
        lower.includes('load failed')
      ) {
        return { level: 'unreachable', latencyMs: elapsed(), error: message, engine: 'jev' };
      }
      return { level: 'evaluation-failed', latencyMs: elapsed(), error: message, engine: 'jev' };
    }
  }

  private async testConnectionDecisions(): Promise<ApiConnectionTestResult> {
    const startTime = performance.now();
    const elapsed = () => Math.round(performance.now() - startTime);

    try {
      const data = await this.callDecisions(
        '[投稿者]: @jev_x_test\n\n[本文]:\nこれは接続確認用のテスト文です。',
        { probe: { type: 'noul', instructions: 'この文は接続確認のためのテスト文である' } }
      );

      const ans = data.answers?.probe;
      if (ans && ans.type === 'noul' && typeof ans.noul === 'number') {
        return { level: 'ok', latencyMs: elapsed(), engine: 'decisions' };
      }
      return {
        level: 'evaluation-failed',
        latencyMs: elapsed(),
        error: '応答に評価結果（noul）が含まれていませんでした',
        engine: 'decisions',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as DecisionsHttpError).status;
      if (status === 401 || status === 403) {
        return { level: 'auth-failed', latencyMs: elapsed(), error: message, engine: 'decisions' };
      }
      const lower = message.toLowerCase();
      if (
        error instanceof TypeError ||
        lower.includes('timeout') ||
        lower.includes('failed to fetch') ||
        lower.includes('network') ||
        lower.includes('load failed')
      ) {
        return { level: 'unreachable', latencyMs: elapsed(), error: message, engine: 'decisions' };
      }
      return { level: 'evaluation-failed', latencyMs: elapsed(), error: message, engine: 'decisions' };
    }
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
