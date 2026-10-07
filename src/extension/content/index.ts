import './style.css';
import { TweetData, FilterDecision, OgpCardInfo } from '../../types/index.js';
import { CATEGORY_MAP } from '../../core/categories.js';
import { EvaluateTweetsRequest, EvaluateTweetsResponse } from '../messages.js';

console.log('[jev-x] 🚀 Content script injected and active on:', window.location.href);

const PROCESSED_ATTR = 'data-jev-processed';
const pendingTweets = new Map<string, HTMLElement>();
let batchTimer: number | null = null;
let tweetCounter = 0;

/**
 * Robustly extracts structured data from any tweet article element
 */
function extractTweetData(article: HTMLElement): TweetData {
  // 1. Tweet ID extraction with fallback
  let id = '';
  const timeEl = article.querySelector('time');
  const linkEl = timeEl?.closest('a') || article.querySelector('a[href*="/status/"]');
  const href = linkEl?.getAttribute('href') || '';
  const match = href.match(/\/status\/(\d+)/);
  if (match) {
    id = match[1];
  } else {
    tweetCounter++;
    id = `fallback-${Date.now()}-${tweetCounter}`;
  }

  // 2. Author username extraction
  const userEl = article.querySelector('div[data-testid="User-Name"]');
  const authorText = userEl?.textContent || '';
  const usernameMatch = authorText.match(/@(\w+)/);
  const authorUsername = usernameMatch ? usernameMatch[1] : 'unknown';
  const authorName = authorText.split('@')[0]?.trim() || undefined;

  // 3. Text extraction (primary: data-testid="tweetText", fallback: article textContent)
  const textEl = article.querySelector('div[data-testid="tweetText"]');
  let text = textEl?.textContent?.trim() || '';
  if (!text) {
    // Fallback: collect readable text inside article excluding user header
    text = article.innerText?.slice(0, 300) || '';
  }

  // 4. OGP card extraction
  let ogp: OgpCardInfo | undefined = undefined;
  const cardWrapper = article.querySelector('div[data-testid="card.wrapper"]');
  if (cardWrapper) {
    const cardTitle = cardWrapper.querySelector('[data-testid="card.layoutLarge.detail"] span, a span')?.textContent?.trim();
    const cardDomain = cardWrapper.querySelector('span[dir="ltr"]')?.textContent?.trim();
    const cardLink = cardWrapper.querySelector('a[role="link"]')?.getAttribute('href') || undefined;

    if (cardTitle || cardDomain) {
      ogp = {
        title: cardTitle || undefined,
        domain: cardDomain || undefined,
        url: cardLink,
      };
    }
  }

  // 5. Image ALTs
  const imageAlts: string[] = [];
  const images = article.querySelectorAll<HTMLImageElement>('div[data-testid="tweetPhoto"] img[alt], img[alt]');
  images.forEach((img) => {
    const alt = img.getAttribute('alt')?.trim();
    if (alt && !alt.startsWith('画像') && alt.length > 2) {
      imageAlts.push(alt);
    }
  });

  const isReply = Boolean(article.querySelector('div[id*="id__"]')?.textContent?.includes('返信先'));

  return {
    id,
    authorUsername,
    authorName,
    text,
    ogp,
    imageAlts: imageAlts.length > 0 ? imageAlts : undefined,
    isReply,
  };
}

/**
 * Injects accordion filter UI or debug inspection badge
 */
function applyFilterUI(
  article: HTMLElement,
  decision: FilterDecision,
  showDebugBadges: boolean,
  showFoldBanner: boolean = true
) {
  // 1. Filter matched
  if (decision.shouldFilter) {
    if (!showFoldBanner) {
      // Complete hide mode: completely hide post without any banner
      article.style.display = 'none';
      const existingBanner = article.parentElement?.querySelector(`.jev-filter-banner[data-target="${decision.tweetId}"]`);
      existingBanner?.remove();
      return;
    }

    // Fold mode (with accordion banner)
    const categoryDef = decision.primaryReason ? CATEGORY_MAP.get(decision.primaryReason) : null;
    const icon = categoryDef?.badgeIcon || '🛡️';
    const name = categoryDef?.name || decision.primaryReason || 'フィルタ対象';
    const scorePct = decision.primaryProbability
      ? `(${(decision.primaryProbability * 100).toFixed(0)}%)`
      : '';

    article.classList.add('jev-post-folded');

    // Create Filter Banner if not already present
    let banner = article.parentElement?.querySelector(`.jev-filter-banner[data-target="${decision.tweetId}"]`) as HTMLElement;
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'jev-filter-banner';
      banner.setAttribute('data-target', decision.tweetId);

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

      article.parentElement?.insertBefore(banner, article);
    }
  }

  // 2. Inspection/Debug badge (Always display if showDebugBadges is true)
  if (showDebugBadges) {
    if (!article.querySelector('.jev-inspect-badge')) {
      const inspectBadge = document.createElement('div');
      inspectBadge.className = `jev-inspect-badge ${decision.shouldFilter ? 'filtered' : ''}`;
      // Fallback styling in case CSS fails to load
      inspectBadge.style.cssText = decision.shouldFilter
        ? 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;margin:4px 0;background:rgba(244,33,46,0.15);border:1px solid #f4212e;color:#f4212e;border-radius:6px;font-size:11px;font-weight:600;'
        : 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;margin:4px 0;background:rgba(0,186,124,0.15);border:1px solid #00ba7c;color:#00ba7c;border-radius:6px;font-size:11px;font-weight:600;';

      if (decision.shouldFilter) {
        const catName = decision.primaryReason ? (CATEGORY_MAP.get(decision.primaryReason)?.name || decision.primaryReason) : '';
        const pct = decision.primaryProbability ? `${(decision.primaryProbability * 100).toFixed(0)}%` : '';
        inspectBadge.innerHTML = `<span>🚫 判定: <b>${catName}</b> ${pct} (${decision.latencyMs}ms)</span>`;
      } else {
        let topCat = '';
        let topScore = 0;
        if (decision.allScores) {
          for (const [k, v] of Object.entries(decision.allScores)) {
            if (v > topScore) {
              topScore = v;
              topCat = k;
            }
          }
        }
        const topInfo = topCat ? ` (最高: ${CATEGORY_MAP.get(topCat as any)?.name || topCat} ${(topScore * 100).toFixed(0)}%)` : '';
        inspectBadge.innerHTML = `<span>✅ 判定: <b>SAFE</b>${topInfo} [${decision.latencyMs}ms]</span>`;
      }

      // Insertion target: before tweetText, or inside User-Name row, or at top of article
      const textEl = article.querySelector('div[data-testid="tweetText"]');
      if (textEl?.parentElement) {
        textEl.parentElement.insertBefore(inspectBadge, textEl);
      } else {
        const userEl = article.querySelector('div[data-testid="User-Name"]');
        if (userEl?.parentElement) {
          userEl.parentElement.appendChild(inspectBadge);
        } else {
          article.prepend(inspectBadge);
        }
      }
    }
  }
}

/**
 * Process batch of collected tweets
 */
async function processBatch() {
  if (pendingTweets.size === 0) return;

  const currentBatch = Array.from(pendingTweets.entries());
  pendingTweets.clear();

  const tweetDataList: TweetData[] = [];
  const validElements: HTMLElement[] = [];

  for (const [, element] of currentBatch) {
    const data = extractTweetData(element);
    tweetDataList.push(data);
    validElements.push(element);
  }

  if (tweetDataList.length === 0) return;

  try {
    const req: EvaluateTweetsRequest = {
      type: 'EVALUATE_TWEETS',
      tweets: tweetDataList,
    };

    const res: EvaluateTweetsResponse = await chrome.runtime.sendMessage(req);
    if (res && res.decisions) {
      const showBadges = res.showDebugBadges !== false;
      const showFoldBanner = res.showFoldBanner !== false;
      console.log(`[jev-x] Evaluated ${res.decisions.length} tweets (showBadges: ${showBadges}, showFoldBanner: ${showFoldBanner})`);

      res.decisions.forEach((decision, index) => {
        const el = validElements[index];
        if (el) {
          applyFilterUI(el, decision, showBadges, showFoldBanner);
        }
      });
    }
  } catch (error) {
    console.error('[jev-x content] Batch evaluation error:', error);
  }
}

function scheduleBatch(tweetId: string, element: HTMLElement) {
  pendingTweets.set(tweetId, element);

  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  batchTimer = window.setTimeout(() => {
    batchTimer = null;
    processBatch();
  }, 150);
}

function scanTweets() {
  const articles = document.querySelectorAll<HTMLElement>(`article[data-testid="tweet"]:not([${PROCESSED_ATTR}])`);

  if (articles.length > 0) {
    console.log(`[jev-x] 🔎 Detected ${articles.length} new tweets to scan.`);
    articles.forEach((article) => {
      article.setAttribute(PROCESSED_ATTR, 'true');
      const data = extractTweetData(article);
      scheduleBatch(data.id, article);
    });
  }
}

// Observe DOM changes
const observer = new MutationObserver(() => {
  scanTweets();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Run initial scan
setTimeout(scanTweets, 500);
setTimeout(scanTweets, 1500);
