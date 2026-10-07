import './style.css';
import { TweetData, FilterDecision, OgpCardInfo } from '../../types/index.js';
import { CATEGORY_MAP } from '../../core/categories.js';
import { EvaluateTweetsRequest, EvaluateTweetsResponse } from '../messages.js';

const PROCESSED_ATTR = 'data-jev-processed';
const pendingTweets = new Map<string, HTMLElement>();
let batchTimer: number | null = null;

/**
 * Extracts structured data including OGP card from a tweet DOM element
 */
function extractTweetData(article: HTMLElement): TweetData | null {
  // Extract Tweet ID from permalink
  const timeEl = article.querySelector('time');
  const linkEl = timeEl?.closest('a');
  const href = linkEl?.getAttribute('href') || '';
  const match = href.match(/\/status\/(\d+)/);
  if (!match) return null;
  const id = match[1];

  // Extract author
  const userEl = article.querySelector('div[data-testid="User-Name"]');
  const authorText = userEl?.textContent || '';
  const usernameMatch = authorText.match(/@(\w+)/);
  const authorUsername = usernameMatch ? usernameMatch[1] : 'unknown';

  // Extract tweet text
  const textEl = article.querySelector('div[data-testid="tweetText"]');
  const text = textEl?.textContent || '';

  // Extract OGP card information
  let ogp: OgpCardInfo | undefined = undefined;
  const cardWrapper = article.querySelector('div[data-testid="card.wrapper"]');
  if (cardWrapper) {
    const cardTitle = cardWrapper.querySelector('[data-testid="card.layoutLarge.detail"] span, a span')?.textContent;
    const cardDomain = cardWrapper.querySelector('span[dir="ltr"]')?.textContent;
    const cardLink = cardWrapper.querySelector('a[role="link"]')?.getAttribute('href');

    if (cardTitle || cardDomain) {
      ogp = {
        title: cardTitle || undefined,
        domain: cardDomain || undefined,
        url: cardLink || undefined,
      };
    }
  }

  // Extract Image ALT texts
  const imageAlts: string[] = [];
  const images = article.querySelectorAll<HTMLImageElement>('div[data-testid="tweetPhoto"] img[alt]');
  images.forEach((img) => {
    const alt = img.getAttribute('alt');
    if (alt && !alt.startsWith('画像')) {
      imageAlts.push(alt);
    }
  });

  // Check if reply
  const isReply = Boolean(article.querySelector('div[id*="id__"]')?.textContent?.includes('返信先'));

  return {
    id,
    authorUsername,
    text,
    ogp,
    imageAlts: imageAlts.length > 0 ? imageAlts : undefined,
    isReply,
  };
}

/**
 * Applies accordion filter UI to a tweet
 */
function applyFilterUI(article: HTMLElement, decision: FilterDecision) {
  if (!decision.shouldFilter) return;

  const categoryDef = decision.primaryReason ? CATEGORY_MAP.get(decision.primaryReason) : null;
  const icon = categoryDef?.badgeIcon || '🛡️';
  const name = categoryDef?.name || decision.primaryReason || 'フィルタ対象';
  const scorePct = decision.primaryProbability
    ? `(${(decision.primaryProbability * 100).toFixed(0)}%)`
    : '';

  // Wrap the tweet content or fold directly
  article.classList.add('jev-post-folded');

  // Create Filter Banner
  const banner = document.createElement('div');
  banner.className = 'jev-filter-banner';

  banner.innerHTML = `
    <div class="jev-filter-info">
      <span class="jev-filter-badge">${icon} ${name} ${scorePct}</span>
      <span class="jev-filter-desc">として折りたたみました</span>
    </div>
    <div class="jev-filter-actions">
      <button class="jev-toggle-btn" type="button">表示する ▼</button>
    </div>
  `;

  const toggleBtn = banner.querySelector('.jev-toggle-btn') as HTMLButtonElement;
  let isFolded = true;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    isFolded = !isFolded;
    if (isFolded) {
      article.classList.add('jev-post-folded');
      article.classList.remove('jev-post-unfolded');
      toggleBtn.textContent = '表示する ▼';
    } else {
      article.classList.remove('jev-post-folded');
      article.classList.add('jev-post-unfolded');
      toggleBtn.textContent = 'たたむ ▲';
    }
  });

  // Insert banner before the folded tweet article
  article.parentElement?.insertBefore(banner, article);
}

/**
 * Flushes pending batch tweets to background worker for Jev evaluation
 */
async function processBatch() {
  if (pendingTweets.size === 0) return;

  const currentBatch = Array.from(pendingTweets.entries());
  pendingTweets.clear();

  const tweetDataList: TweetData[] = [];
  const validElements: HTMLElement[] = [];

  for (const [, element] of currentBatch) {
    const data = extractTweetData(element);
    if (data && data.text) {
      tweetDataList.push(data);
      validElements.push(element);
    }
  }

  if (tweetDataList.length === 0) return;

  try {
    const req: EvaluateTweetsRequest = {
      type: 'EVALUATE_TWEETS',
      tweets: tweetDataList,
    };

    const res: EvaluateTweetsResponse = await chrome.runtime.sendMessage(req);
    if (res && res.decisions) {
      res.decisions.forEach((decision, index) => {
        const el = validElements[index];
        if (el) {
          applyFilterUI(el, decision);
        }
      });
    }
  } catch (error) {
    console.error('[jev-x content] Batch evaluation failed:', error);
  }
}

/**
 * Schedule batch execution with 200ms debounce
 */
function scheduleBatch(tweetId: string, element: HTMLElement) {
  pendingTweets.set(tweetId, element);

  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  batchTimer = window.setTimeout(() => {
    batchTimer = null;
    processBatch();
  }, 200);
}

/**
 * Scan DOM for unhandled tweets
 */
function scanTweets() {
  const articles = document.querySelectorAll<HTMLElement>(`article[data-testid="tweet"]:not([${PROCESSED_ATTR}])`);

  articles.forEach((article) => {
    article.setAttribute(PROCESSED_ATTR, 'true');
    const data = extractTweetData(article);
    if (data) {
      scheduleBatch(data.id, article);
    }
  });
}

// Observe timeline DOM
const observer = new MutationObserver(() => {
  scanTweets();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial scan
scanTweets();
console.log('[jev-x] Content script active and observing timeline.');
