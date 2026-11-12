import { TweetData, UserFilterSettings, FilterDecision } from '../../types/index.js';
import { EvaluateTweetsRequest, EvaluateTweetsResponse, EvaluateTweetsResultMessage } from '../messages.js';
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

// ---- Pushed-result delivery (Issue #17) ----
// On some browsers (Orion on iPad) the sendMessage response addressed to a
// content script is dropped even though the background evaluated and called
// sendResponse. The background therefore also pushes the result to the tab
// via chrome.tabs.sendMessage; processBatch accepts whichever arrives first.
interface EvaluationPayload {
  decisions: FilterDecision[];
  showDebugBadges?: boolean;
  showFoldBanner?: boolean;
  via: 'response' | 'push';
}

const pendingResults = new Map<string, (payload: EvaluationPayload | null) => void>();
let resultListenerInstalled = false;
let requestCounter = 0;

function makeRequestId(): string {
  requestCounter += 1;
  return `eval-${Date.now()}-${requestCounter}`;
}

function installResultListener(): void {
  if (resultListenerInstalled) return;
  resultListenerInstalled = true;
  try {
    chrome.runtime.onMessage.addListener((message: EvaluateTweetsResultMessage, _sender, sendResponse) => {
      if (message?.type !== 'EVALUATE_TWEETS_RESULT') return;
      sendResponse({ received: true });
      const resolve = pendingResults.get(message.requestId);
      if (resolve) {
        pendingResults.delete(message.requestId);
        resolve({
          decisions: message.decisions,
          showDebugBadges: message.showDebugBadges,
          showFoldBanner: message.showFoldBanner,
          via: 'push',
        });
      }
    });
  } catch {
    // Losing the listener only removes the fallback path; never break scanning.
  }
}

function waitForPushedResult(requestId: string, timeoutMs: number): Promise<EvaluationPayload | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pendingResults.delete(requestId);
      resolve(null);
    }, timeoutMs);
    pendingResults.set(requestId, (payload) => {
      window.clearTimeout(timer);
      resolve(payload);
    });
  });
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
    if (!chrome.runtime?.id) {
      markDiag('content.error', 'chrome.runtime.id unavailable before send');
      return;
    }

    installResultListener();
    const requestId = makeRequestId();
    const req: EvaluateTweetsRequest = {
      type: 'EVALUATE_TWEETS',
      tweets: tweetDataList,
      requestId,
    };

    // Register the push waiter before sending so a fast push cannot be missed.
    const pushPromise = waitForPushedResult(requestId, 60000);
    markDiag('content.send', `tweets=${tweetDataList.length} requestId=${requestId}`);

    let payload: EvaluationPayload | null = null;
    try {
      const res: EvaluateTweetsResponse = await chrome.runtime.sendMessage(req);
      if (res && res.decisions) {
        payload = {
          decisions: res.decisions,
          showDebugBadges: res.showDebugBadges,
          showFoldBanner: res.showFoldBanner,
          via: 'response',
        };
      } else {
        markDiag(
          'content.error',
          `response without decisions: ${JSON.stringify(res)?.slice(0, 200) ?? String(res)} (waiting for push)`
        );
      }
    } catch (error: any) {
      if (error?.message?.includes('Extension context invalidated')) {
        return;
      }
      markDiag('content.error', `sendMessage failed: ${error?.message ?? String(error)} (waiting for push)`);
      logger.error('Batch evaluation error:', error);
    }

    if (!payload) {
      payload = await pushPromise;
    } else {
      // The response won; a late push will be acked but ignored.
      pendingResults.delete(requestId);
    }

    if (!payload) {
      markDiag('content.error', `no result via response or push (requestId=${requestId})`);
      return;
    }

    markDiag('content.response', `decisions=${payload.decisions.length} via=${payload.via}`);
    const showBadges = payload.showDebugBadges !== false;
    const showFoldBanner = payload.showFoldBanner !== false;
    lastDisplayOptions = { showDebugBadges: showBadges, showFoldBanner };
    logger.debug(`Evaluated ${payload.decisions.length} tweets (showBadges: ${showBadges}, showFoldBanner: ${showFoldBanner})`);

    payload.decisions.forEach((decision, index) => {
      const el = validElements[index];
      if (el) {
        renderedArticles.add(el);
        decisionMap.set(el, decision);
        applyFilterUI(el, decision, showBadges, showFoldBanner);
      }
    });
  } catch (error: any) {
    if (error?.message?.includes('Extension context invalidated')) {
      return;
    }
    markDiag('content.error', `batch failed: ${error?.message ?? String(error)}`);
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
