import { describe, it, expect, beforeEach } from 'vitest';
import { applyFilterUI } from '../src/extension/content/ui/render.js';
import { FilterDecision } from '../src/types/index.js';

describe('applyFilterUI badge display', () => {
  let article: HTMLElement;
  let avatar: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="Tweet-User-Avatar"></div>
        <div data-testid="tweetText">Hello World</div>
      </article>
    `;
    article = document.body.querySelector('article')!;
    avatar = article.querySelector('[data-testid="Tweet-User-Avatar"]')!;
  });

  it('displays highest category emoji and 2-digit number when tweet is safe', () => {
    const decision: FilterDecision = {
      tweetId: 't-123',
      shouldFilter: false,
      matchedCategories: [],
      latencyMs: 15,
      evaluatedAt: Date.now(),
      allScores: {
        rage_bait: 0.34,
        ai_slop: 0.12,
        scam_hustle: 0.05,
      },
    };

    applyFilterUI(article, decision, true, true);

    const badge = avatar.querySelector('.jev-inspect-badge');
    expect(badge).toBeTruthy();

    const iconSpan = badge?.querySelector('.jev-inspect-icon');
    expect(iconSpan).toBeTruthy();

    const badgeIcon = iconSpan?.querySelector('.badge-icon');
    const badgeScore = iconSpan?.querySelector('.badge-score');

    expect(badgeIcon?.textContent).toBe('🔥');
    expect(badgeScore?.textContent).toBe('34');

    const tooltip = badge?.querySelector('.jev-inspect-tooltip');
    expect(tooltip?.textContent).toContain('🔥 セーフ');
    expect(tooltip?.textContent).toContain('34%');
  });

  it('pads single-digit score with leading zero', () => {
    const decision: FilterDecision = {
      tweetId: 't-124',
      shouldFilter: false,
      matchedCategories: [],
      latencyMs: 10,
      evaluatedAt: Date.now(),
      allScores: {
        adult_nsfw: 0.05,
      },
    };

    applyFilterUI(article, decision, true, true);

    const iconSpan = avatar.querySelector('.jev-inspect-icon');
    expect(iconSpan?.querySelector('.badge-icon')?.textContent).toBe('🔞');
    expect(iconSpan?.querySelector('.badge-score')?.textContent).toBe('05');
  });

  it('displays fallback ✅00 when all scores are zero or empty', () => {
    const decision: FilterDecision = {
      tweetId: 't-125',
      shouldFilter: false,
      matchedCategories: [],
      latencyMs: 8,
      evaluatedAt: Date.now(),
      allScores: {
        rage_bait: 0,
        ai_slop: 0,
      },
    };

    applyFilterUI(article, decision, true, true);

    const iconSpan = avatar.querySelector('.jev-inspect-icon');
    expect(iconSpan?.querySelector('.badge-icon')?.textContent).toBe('✅');
    expect(iconSpan?.querySelector('.badge-score')?.textContent).toBe('00');
  });

  it('displays 🚫 icon when tweet is filtered', () => {
    const decision: FilterDecision = {
      tweetId: 't-126',
      shouldFilter: true,
      primaryReason: 'ai_slop',
      primaryProbability: 0.88,
      matchedCategories: [{ categoryId: 'ai_slop', probability: 0.88, threshold: 0.5, matched: true }],
      latencyMs: 20,
      evaluatedAt: Date.now(),
    };

    applyFilterUI(article, decision, true, true);

    const badge = avatar.querySelector('.jev-inspect-badge');
    expect(badge?.classList.contains('filtered')).toBe(true);

    const iconSpan = badge?.querySelector('.jev-inspect-icon');
    expect(iconSpan?.textContent).toBe('🚫');
  });
});
