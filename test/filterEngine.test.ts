import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('sends attached_image and TypeSafe-Danger-Zone-Images header when attachedImageBytes is provided, and falls back to text-only on image error', async () => {
    const apiEngine = new FilterEngine({ apiKey: 'ts_test_key' });
    const evalSpy = vi.fn()
      // First call with image rejects (e.g., 400 Invalid image dimensions)
      .mockRejectedValueOnce(new Error('Invalid image'))
      // Second call (text-only fallback) resolves
      .mockResolvedValueOnce({
        answers: {
          adult_nsfw: { type: 'noul', noul: 0.05 },
          rage_bait: { type: 'noul', noul: 0.01 },
          toxic_venting: { type: 'noul', noul: 0.01 },
          scam_hustle: { type: 'noul', noul: 0.01 },
          affiliate_spam: { type: 'noul', noul: 0.01 },
          thread_bait: { type: 'noul', noul: 0.02 },
          ai_slop: { type: 'noul', noul: 0.91 },
          impression_zombie: { type: 'noul', noul: 0.02 },
        },
      });
    (apiEngine as any).client = { systemOne: evalSpy };

    const tweet: TweetData = {
      id: 'jev-img-1',
      authorUsername: 'ai_poster',
      text: 'おはようございます☀️',
      primaryImageUrl: 'https://pbs.twimg.com/media/abc123?format=jpg&name=small',
      attachedImageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    };

    const decision = await apiEngine.evaluateTweet(tweet, {
      ...defaultSettings,
      imageVisionMode: 'direct',
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

describe('FilterEngine (decisions engine, Issue #18)', () => {
  const slopTweet: TweetData = {
    id: 'dec-1',
    authorUsername: 'slop_creator',
    text: 'chatgptでai美女を自動生成して量産する方法！',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetchOk(answers: Record<string, { type: string; noul: number; confidence: number }>) {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ answers }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('maps Decisions API noul answers to category scores and records confidences', async () => {
    const fetchMock = stubFetchOk({
      adult_nsfw: { type: 'noul', noul: 0.01, confidence: 0.99 },
      ai_slop: { type: 'noul', noul: 0.93, confidence: 0.9 },
    });
    const engine = new FilterEngine({ engine: 'decisions', geminiApiKey: 'gemini_test_key' });
    expect(engine.mockMode).toBe(false);

    const decision = await engine.evaluateTweet(slopTweet, getDefaultUserSettings());
    expect(decision.shouldFilter).toBe(true);
    expect(decision.primaryReason).toBe('ai_slop');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(init.headers['x-goog-api-key']).toBe('gemini_test_key');
    const body = JSON.parse(init.body) as {
      model: string;
      input: string;
      questions: Record<string, { type: string; instructions: string }>;
    };
    expect(body.model).toBe('gemini-decision-1');
    expect(body.input).toContain('ai美女');
    expect(body.questions.ai_slop.type).toBe('noul');
    expect(body.questions.ai_slop.instructions).toContain('AI slop');

    expect(engine.lastRunMeta?.engine).toBe('decisions');
    expect(engine.lastRunMeta?.confidences.ai_slop).toBe(0.9);
  });

  it('sends the attached image as a multimodal input part (phase 2)', async () => {
    const fetchMock = stubFetchOk({
      ai_slop: { type: 'noul', noul: 0.95, confidence: 0.9 },
    });
    const engine = new FilterEngine({ engine: 'decisions', geminiApiKey: 'k' });
    const tweet: TweetData = {
      ...slopTweet,
      attachedImageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    };

    const decision = await engine.evaluateTweet(tweet, getDefaultUserSettings());
    expect(decision.shouldFilter).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body) as { input: unknown };
    expect(Array.isArray(body.input)).toBe(true);
    const parts = body.input as Array<Record<string, unknown>>;
    expect(parts[0].type).toBe('text');
    expect(parts[0].text).toContain('ai美女');
    expect(parts[1]).toEqual({
      type: 'image',
      data: '/9j/2Q==',
      mime_type: 'image/jpeg',
      resolution: 'low',
    });
    expect(engine.lastRunMeta?.imageAttached).toBe(true);
    expect(engine.lastRunMeta?.imageFallback).toBe(false);
  });

  it('retries text-only when the image request is rejected with 400 (phase 2)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'image_safety', message: 'Image blocked by safety' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          answers: { ai_slop: { type: 'noul', noul: 0.93, confidence: 0.9 } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const engine = new FilterEngine({ engine: 'decisions', geminiApiKey: 'k' });
    const tweet: TweetData = {
      ...slopTweet,
      attachedImageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    };

    const decision = await engine.evaluateTweet(tweet, getDefaultUserSettings());
    expect(decision.shouldFilter).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, retryInit] = fetchMock.mock.calls[1] as unknown as [string, { body: string }];
    const retryBody = JSON.parse(retryInit.body) as { input: unknown };
    expect(typeof retryBody.input).toBe('string');
    expect(engine.lastRunMeta?.imageAttached).toBe(false);
    expect(engine.lastRunMeta?.imageFallback).toBe(true);
  });

  it('falls back to unfiltered when the API returns a safety 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'safety', message: 'Request blocked due to safety violations' },
        }),
      }))
    );
    const engine = new FilterEngine({ engine: 'decisions', geminiApiKey: 'k' });
    const decision = await engine.evaluateTweet(slopTweet, getDefaultUserSettings());
    expect(decision.shouldFilter).toBe(false);
    expect(engine.lastRunMeta?.error).toContain('400');
  });

  it('uses mock evaluation and never calls fetch when no Gemini key is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const engine = new FilterEngine({ engine: 'decisions' });
    expect(engine.mockMode).toBe(true);

    const decision = await engine.evaluateTweet(slopTweet, getDefaultUserSettings());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(decision.shouldFilter).toBe(true);
    expect(decision.primaryReason).toBe('ai_slop');
  });

  it('testConnection reports ok / auth-failed / unreachable for the decisions engine', async () => {
    stubFetchOk({ probe: { type: 'noul', noul: 0.99, confidence: 0.99 } });
    const ok = await new FilterEngine({ engine: 'decisions', geminiApiKey: 'k' }).testConnection();
    expect(ok.level).toBe('ok');
    expect(ok.engine).toBe('decisions');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 403, message: 'API key not valid' } }),
      }))
    );
    const auth = await new FilterEngine({ engine: 'decisions', geminiApiKey: 'bad' }).testConnection();
    expect(auth.level).toBe('auth-failed');
    expect(auth.engine).toBe('decisions');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const unreach = await new FilterEngine({ engine: 'decisions', geminiApiKey: 'k' }).testConnection();
    expect(unreach.level).toBe('unreachable');
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
