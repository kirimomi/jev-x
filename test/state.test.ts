import { describe, it, expect } from 'vitest';
import { buildTweetState } from '../src/core/filterEngine.js';
import { TweetData } from '../src/types/index.js';

describe('buildTweetState', () => {
  it('builds state for basic tweet', () => {
    const tweet: TweetData = {
      id: '1',
      authorUsername: 'test_user',
      text: 'Simple text',
    };
    const state = buildTweetState(tweet);
    expect(state).toContain('[投稿者]: @test_user');
    expect(state).toContain('[本文]:\nSimple text');
  });

  it('builds state with authorName', () => {
    const tweet: TweetData = {
      id: '2',
      authorUsername: 'test_user',
      authorName: 'Test Name',
      text: 'Hello',
    };
    const state = buildTweetState(tweet);
    expect(state).toContain('[投稿者]: Test Name (@test_user)');
  });

  it('includes reply, OGP, ALT, sensitive warning, and vision results when present', () => {
    const tweet: TweetData = {
      id: '3',
      authorUsername: 'user3',
      text: 'Full feature tweet',
      isReply: true,
      ogp: {
        title: 'OGP Title',
        description: 'OGP Desc',
        domain: 'example.com',
        url: 'https://example.com',
      },
      imageAlts: ['Alt 1', 'Alt 2'],
      hasSensitiveWarning: true,
      vision: {
        hasImages: true,
        imageCount: 1,
        exposureScore: 0.8,
        isLikelyNsfw: true,
        label: 'Explicit',
      },
    };
    const state = buildTweetState(tweet);
    expect(state).toContain('[投稿種別]: 他ユーザーへの返信 (リプライ)');
    expect(state).toContain('[リンクカード(OGP)]:');
    expect(state).toContain('- タイトル: OGP Title');
    expect(state).toContain('- ドメイン: example.com');
    expect(state).toContain('[画像説明(ALT)]: Alt 1, Alt 2');
    expect(state).toContain('[X公式フラグ]: センシティブ警告オーバーレイあり');
    expect(state).toContain('[画像解析(Vision)]: 露出度判定=Explicit (露出度スコア: 80%, NSFW疑い=高)');
  });
});
