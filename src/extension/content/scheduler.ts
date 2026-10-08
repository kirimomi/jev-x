import { TweetData, UserFilterSettings, FilterDecision } from '../../types/index.js';
import { EvaluateTweetsRequest, EvaluateTweetsResponse } from '../messages.js';
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
      tweetDataList.push(data);
      validElements.push(element);
    } catch (e) {
      logger.warn('Error extracting tweet data:', e);
    }
  }

  if (tweetDataList.length === 0) return;

  try {
    const req: EvaluateTweetsRequest = {
      type: 'EVALUATE_TWEETS',
      tweets: tweetDataList,
    };

    if (!chrome.runtime?.id) {
      return;
    }

    const res: EvaluateTweetsResponse = await chrome.runtime.sendMessage(req);
    if (res && res.decisions) {
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
    }
  } catch (error: any) {
    if (error?.message?.includes('Extension context invalidated')) {
      return;
    }
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

  const hasImages = findContentImages(article).length > 0;
  if (hasImages) {
    article.setAttribute(ATTRS.RECHECKED, 'true');
    const id = getTweetId(article);
    scheduleBatch(id, article);
  }
}

export function scanTweets(): void {
  const articles = document.querySelectorAll<HTMLElement>(`${SELECTORS.TWEET}:not([${ATTRS.PROCESSED}])`);

  if (articles.length > 0) {
    logger.debug(`Detected ${articles.length} new tweets to scan.`);
    articles.forEach((article) => {
      article.setAttribute(ATTRS.PROCESSED, 'true');
      const id = getTweetId(article);
      scheduleBatch(id, article);
    });
  }

  document.querySelectorAll<HTMLElement>(`${SELECTORS.TWEET}[${ATTRS.PROCESSED}]`).forEach((article) => {
    recheckTweetImages(article);
  });
}

export function throttledScan(): void {
  if (scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scanTweets();
  }, 200);
}
