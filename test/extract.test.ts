import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Set up chrome runtime mock before importing extractTweetData
const mockSendMessage = vi.fn().mockResolvedValue({ score: 0 });
(globalThis as any).chrome = {
  runtime: {
    id: 'mock-test-id',
    sendMessage: mockSendMessage,
  },
};

import { extractTweetData } from '../src/extension/content/index.js';

function loadFixture(filename: string): HTMLElement {
  const filePath = path.resolve(__dirname, 'fixtures', filename);
  const html = fs.readFileSync(filePath, 'utf-8');
  document.body.innerHTML = html;
  const article = document.body.querySelector('article');
  if (!article) throw new Error(`No article found in fixture ${filename}`);
  return article as HTMLElement;
}

describe('extractTweetData', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({ score: 0 });
  });

  it('extracts normal tweet fixture data', async () => {
    const article = loadFixture('tweet-normal.html');
    const data = await extractTweetData(article);

    expect(data.id).toBe('1000000000000000001');
    expect(data.authorUsername).toBe('yamada_taro');
    expect(data.authorName).toBe('山田太郎');
    expect(data.text).toContain('これは通常のテスト投稿です');
    expect(data.isReply).toBe(false);
    expect(data.hasSensitiveWarning).toBe(false);
  });

  it('extracts image tweet fixture data and ALT text', async () => {
    const article = loadFixture('tweet-with-image.html');
    const data = await extractTweetData(article);

    expect(data.id).toBe('1000000000000000002');
    expect(data.authorUsername).toBe('photo_user');
    expect(data.imageAlts).toContain('青空の下に広がる富士山の風景写真');
  });

  it('extracts OGP card details', async () => {
    const article = loadFixture('tweet-with-ogp.html');
    const data = await extractTweetData(article);

    expect(data.id).toBe('1000000000000000003');
    expect(data.authorUsername).toBe('news_bot');
    expect(data.ogp).toBeDefined();
    expect(data.ogp?.title).toBe('AI技術の最新動向と今後の展望');
    expect(data.ogp?.domain).toBe('tech.example.com');
    expect(data.ogp?.url).toBe('https://tech.example.com/ai-trends');
  });

  it('detects reply in Japanese UI', async () => {
    const article = loadFixture('tweet-reply.html');
    const data = await extractTweetData(article);

    expect(data.id).toBe('1000000000000000004');
    expect(data.isReply).toBe(true);
  });

  it('detects sensitive warning overlay via warning container or emptyState', async () => {
    const article = loadFixture('tweet-sensitive-warning.html');
    const data = await extractTweetData(article);

    expect(data.id).toBe('1000000000000000005');
    expect(data.hasSensitiveWarning).toBe(true);
    expect(data.vision?.label).toBe('WarningOverlay');
  });

  it('does NOT trigger hasSensitiveWarning when sensitive words appear only in tweetText or article text', async () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <time datetime="2026-01-01T00:00:00.000Z">
          <a href="/user/status/1000000000000000010">2026-01-01</a>
        </time>
        <div data-testid="tweetText">
          <span>このAPIは case-sensitive（大文字小文字を区別する）です。センシティブな設定に注意。</span>
        </div>
      </article>
    `;
    const article = document.body.querySelector('article') as HTMLElement;
    const data = await extractTweetData(article);

    expect(data.hasSensitiveWarning).toBe(false);
  });

  it('detects reply in English UI ("Replying to")', async () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <time datetime="2026-01-01T00:00:00.000Z">
          <a href="/user/status/1000000000000000011">2026-01-01</a>
        </time>
        <div id="id__abc123">
          <span>Replying to </span><a href="/someone">@someone</a>
        </div>
        <div data-testid="tweetText">
          <span>Thanks for the feedback!</span>
        </div>
      </article>
    `;
    const article = document.body.querySelector('article') as HTMLElement;
    const data = await extractTweetData(article);

    expect(data.isReply).toBe(true);
  });

  it('filters out generic English image alt ("Image 1") and detects English sensitive warning button', async () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <time datetime="2026-01-01T00:00:00.000Z">
          <a href="/user/status/1000000000000000012">2026-01-01</a>
        </time>
        <div data-testid="tweetPhoto">
          <img src="https://pbs.twimg.com/media/dummy.jpg" alt="Image 1" />
          <button><span>Show content</span></button>
        </div>
      </article>
    `;
    const article = document.body.querySelector('article') as HTMLElement;
    const data = await extractTweetData(article);

    expect(data.imageAlts).toBeUndefined();
    expect(data.hasSensitiveWarning).toBe(true);
  });
});
