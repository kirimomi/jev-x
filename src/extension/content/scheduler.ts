import { TweetData, UserFilterSettings, FilterDecision } from '../../types/index.js';
import { EvaluateTweetsRequest, EvaluateTweetsResponse } from '../messages.js';
import { markDiag } from '../diag.js';
import { logger } from '../../shared/logger.js';
import { decide } from '../../core/decision.js';
import { ATTRS, SELECTORS } from './dom/selectors.js';
import { getTweetId, findContentImages, extractTweetData } from './dom/extract.js';
import { applyFilterUI } from './ui/render.js';

const pendingTweets = new Map<string, HTMLElement>();
let batchTimer: number | null = null;
let scanTimer: number | null = null;

// Track decisions per article element for instant re-rendering upon settings change
const renderedArticles = new Set<HTMLElement>();
const decisionMap = new WeakMap<HTMLElement, FilterDecision>();
let lastDisplayOptions = {
  showDebugBadges: true,
  showFoldBanner: true,
};

/**
 * Re-applies updated settings to currently rendered posts without network calls
 */
export function reapplySettingsToRenderedPosts(
  newSettings: UserFilterSettings,
  tweetDataMap?: Map<string, TweetData>
): void {
  lastDisplayOptions = {
    showDebugBadges: newSettings.showDebugBadges !== false,
    showFoldBanner: newSettings.showFoldBanner !== false,
  };

  for (const article of Array.from(renderedArticles)) {
    if (!document.body.contains(article)) {
      renderedArticles.delete(article);
      continue;
    }

    const prevDecision = decisionMap.get(article);
    if (!prevDecision) continue;

    // If we have cached raw scores, recalculate decision immediately with new settings
    let updatedDecision = prevDecision;
    if (prevDecision.allScores) {
      const dummyTweet: TweetData = {
        id: prevDecision.tweetId,
        authorUsername: '',
        text: '',
        vision: prevDecision.visionResult,
        hasSensitiveWarning: prevDecision.visionResult?.label === 'WarningOverlay',
      };
      // We import decide dynamically or directly
      updatedDecision = {
        ...prevDecision,
        ...decide(prevDecision.allScores, dummyTweet, newSettings, prevDecision.latencyMs),
      };
      decisionMap.set(article, updatedDecision);
    }

    applyFilterUI(
      article,
      updatedDecision,
      lastDisplayOptions.showDebugBadges,
      lastDisplayOptions.showFoldBanner
    );
  }
}

/**
 * Process batch of collected tweets
 */
export async function processBatch(): Promise<void> {
  if (pendingTweets.size === 0) return;

  const currentBatch = Array.from(pendingTweets.entries());
  pendingTweets.clear();

  const tweetDataList: TweetData[] = [];
  const validElements: HTMLElement[] = [];

  for (const [, element] of currentBatch) {
    try {
      const data = await extractTweetData(element);
      if (data.vision?.hasImages || data.primaryImageUrl) {
        element.setAttribute(ATTRS.RECHECKED, 'true');
      }
      tweetDataList.push(data);
      validElements.push(element);
    } catch (e) {
      logger.warn('Error extracting tweet data:', e);
    }
  }

  if (tweetDataList.length === 0) {
    markDiag('content.error', `all ${currentBatch.length} extractions failed`);
    return;
  }

  try {
    const req: EvaluateTweetsRequest = {
      type: 'EVALUATE_TWEETS',
      tweets: tweetDataList,
    };

    if (!chrome.runtime?.id) {
      markDiag('content.error', 'chrome.runtime.id unavailable before send');
      return;
    }

    markDiag('content.send', `tweets=${tweetDataList.length}`);
    const res: EvaluateTweetsResponse = await chrome.runtime.sendMessage(req);
    if (res && res.decisions) {
      markDiag('content.response', `decisions=${res.decisions.length}`);
      const showBadges = res.showDebugBadges !== false;
      const showFoldBanner = res.showFoldBanner !== false;
      lastDisplayOptions = { showDebugBadges: showBadges, showFoldBanner };
      logger.debug(`Evaluated ${res.decisions.length} tweets (showBadges: ${showBadges}, showFoldBanner: ${showFoldBanner})`);

      res.decisions.forEach((decision, index) => {
        const el = validElements[index];
        if (el) {
          renderedArticles.add(el);
          decisionMap.set(el, decision);
          applyFilterUI(el, decision, showBadges, showFoldBanner);
        }
      });
    } else {
      markDiag(
        'content.error',
        `response without decisions: ${JSON.stringify(res)?.slice(0, 200) ?? String(res)}`
      );
    }
  } catch (error: any) {
    if (error?.message?.includes('Extension context invalidated')) {
      return;
    }
    markDiag('content.error', `sendMessage failed: ${error?.message ?? String(error)}`);
    logger.error('Batch evaluation error:', error);
  }
}

export function scheduleBatch(tweetId: string, element: HTMLElement): void {
  pendingTweets.set(tweetId, element);

  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  batchTimer = window.setTimeout(() => {
    batchTimer = null;
    processBatch();
  }, 150);
}

export function recheckTweetImages(article: HTMLElement): void {
  if (article.getAttribute(ATTRS.RECHECKED) === 'true') {
    return;
  }

  const id = getTweetId(article);
  if (pendingTweets.has(id)) {
    return;
  }

  const hasImages = findContentImages(article).length > 0;
  if (hasImages) {
    article.setAttribute(ATTRS.RECHECKED, 'true');
    scheduleBatch(id, article);
  }
}

let scanMarkCount = 0;

export function scanTweets(): void {
  // First, check already-processed tweets for late-loaded images
  document.querySelectorAll<HTMLElement>(`${SELECTORS.TWEET}[${ATTRS.PROCESSED}]`).forEach((article) => {
    recheckTweetImages(article);
  });

  // Then discover new tweets
  const articles = document.querySelectorAll<HTMLElement>(`${SELECTORS.TWEET}:not([${ATTRS.PROCESSED}])`);

  // Diagnostics: record every scan that finds posts, plus the first few
  // empty scans (so "injected but nothing matched" is distinguishable from
  // "scan never ran"). Unconditional recording would flood the ring buffer
  // because scans are mutation-driven.
  if (articles.length > 0 || scanMarkCount < 3) {
    scanMarkCount++;
    markDiag('content.scan', `found=${articles.length}`);
  }

  if (articles.length > 0) {
    logger.debug(`Detected ${articles.length} new tweets to scan.`);
    articles.forEach((article) => {
      article.setAttribute(ATTRS.PROCESSED, 'true');
      if (findContentImages(article).length > 0) {
        article.setAttribute(ATTRS.RECHECKED, 'true');
      }
      const id = getTweetId(article);
      scheduleBatch(id, article);
    });
  }
}

export function throttledScan(): void {
  if (scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scanTweets();
  }, 200);
}
