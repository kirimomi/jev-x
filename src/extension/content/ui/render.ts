import { FilterDecision } from '../../../types/index.js';
import { CATEGORY_MAP } from '../../../core/categories.js';
import { ATTRS, SELECTORS } from '../dom/selectors.js';
import { formatVisionInfo, formatPercent } from './format.js';

/**
 * Applies accordion filter UI or debug inspection badge to a tweet element using safe DOM APIs.
 * Fully idempotent: cleans up old banner/classes if decision transitions from filtered to safe,
 * or updates existing banner/badge in-place when rechecked or settings changed.
 */
export function applyFilterUI(
  article: HTMLElement,
  decision: FilterDecision,
  showDebugBadges: boolean,
  showFoldBanner: boolean = true
): void {
  const textTime = `${decision.latencyMs}ms`;
  const imgTime = decision.visionResult?.latencyMs !== undefined ? ` | ${decision.visionResult.latencyMs}ms` : '';
  const timeStr = `${textTime}${imgTime}`;

  // Find any existing banner associated with this tweet
  const existingBanner = article.parentElement?.querySelector(
    `${SELECTORS.FILTER_BANNER}[${ATTRS.TARGET}="${decision.tweetId}"]`
  ) as HTMLElement | null;

  // 1. Tweet should NOT be filtered
  if (!decision.shouldFilter) {
    // Clean up any folded state and banner
    article.classList.remove('jev-post-folded', 'jev-post-unfolded');
    article.removeAttribute('data-jev-folded');
    if (article.style.display === 'none') {
      article.style.display = '';
    }
    if (existingBanner) {
      existingBanner.remove();
    }
  } else {
    // 2. Tweet SHOULD be filtered
    if (!showFoldBanner) {
      // Complete hide mode: hide post completely and remove banner
      article.style.display = 'none';
      article.classList.remove('jev-post-folded', 'jev-post-unfolded');
    article.removeAttribute('data-jev-folded');
      if (existingBanner) {
        existingBanner.remove();
      }
    } else {
      // Fold mode (with accordion banner)
      if (article.style.display === 'none') {
        article.style.display = '';
      }

      const categoryDef = decision.primaryReason ? CATEGORY_MAP.get(decision.primaryReason) : null;
      const icon = categoryDef?.badgeIcon || '🛡️';
      const name = categoryDef?.name || decision.primaryReason || 'フィルタ対象';
      const scorePct = decision.primaryProbability
        ? `(${formatPercent(decision.primaryProbability)})`
        : '';

      // If already unfolded by the user, keep unfolded state; otherwise folded
      const isCurrentlyUnfolded = article.classList.contains('jev-post-unfolded') || article.getAttribute('data-jev-folded') === 'false';
      if (!isCurrentlyUnfolded) {
        article.classList.add('jev-post-folded');
        article.setAttribute('data-jev-folded', 'true');
      } else {
        article.setAttribute('data-jev-folded', 'false');
      }

      let banner = existingBanner;
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'jev-filter-banner';
        banner.setAttribute(ATTRS.TARGET, decision.tweetId);

        const filterInfo = document.createElement('div');
        filterInfo.className = 'jev-filter-info';

        const filterBadge = document.createElement('span');
        filterBadge.className = 'jev-filter-badge';

        const filterDesc = document.createElement('span');
        filterDesc.className = 'jev-filter-desc';
        filterDesc.textContent = 'として折りたたみました';

        filterInfo.appendChild(filterBadge);
        filterInfo.appendChild(document.createTextNode(' '));
        filterInfo.appendChild(filterDesc);

        const filterActions = document.createElement('div');
        filterActions.className = 'jev-filter-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'jev-toggle-btn';
        toggleBtn.type = 'button';
        toggleBtn.textContent = isCurrentlyUnfolded ? 'たたむ ▲' : '表示する ▼';
        filterActions.appendChild(toggleBtn);

        banner.appendChild(filterInfo);
        banner.appendChild(filterActions);

        let isFolded = !isCurrentlyUnfolded;
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();

          isFolded = !isFolded;
          if (isFolded) {
            article.classList.add('jev-post-folded');
            article.classList.remove('jev-post-unfolded');
            article.setAttribute('data-jev-folded', 'true');
            toggleBtn.textContent = '表示する ▼';
          } else {
            article.classList.remove('jev-post-folded');
            article.classList.add('jev-post-unfolded');
            article.setAttribute('data-jev-folded', 'false');
            toggleBtn.textContent = 'たたむ ▲';
          }
        });

        article.parentElement?.insertBefore(banner, article);
      }

      // Update banner content in-place
      const filterBadge = banner.querySelector('.jev-filter-badge');
      if (filterBadge) {
        filterBadge.textContent = `${icon} ${name} ${scorePct}`.trim();
      }

      // Handle inspect badge inside banner info
      let bannerBadge = banner.querySelector(SELECTORS.INSPECT_BADGE) as HTMLElement | null;
      if (showDebugBadges) {
        const visionInfo = formatVisionInfo(decision.visionResult);
        const pctStr = decision.primaryProbability ? formatPercent(decision.primaryProbability) : '';
        const badgeText = `🚫 ${pctStr}${visionInfo} (${timeStr})`.trim();

        if (!bannerBadge) {
          bannerBadge = document.createElement('span');
          bannerBadge.className = 'jev-inspect-badge filtered';
          bannerBadge.style.marginLeft = '8px';
          const badgeInnerSpan = document.createElement('span');
          bannerBadge.appendChild(badgeInnerSpan);
          const filterInfo = banner.querySelector('.jev-filter-info');
          if (filterInfo) {
            filterInfo.appendChild(bannerBadge);
          }
        }
        const inner = bannerBadge.querySelector('span') || bannerBadge;
        inner.textContent = badgeText;
      } else if (bannerBadge) {
        bannerBadge.remove();
      }
    }
  }

  // 3. Inspection/Debug badge on the article itself
  let articleBadge = article.querySelector(SELECTORS.INSPECT_BADGE) as HTMLElement | null;
  if (!showDebugBadges) {
    if (articleBadge) {
      articleBadge.remove();
    }
  } else {
    if (!articleBadge) {
      articleBadge = document.createElement('div');
      articleBadge.className = 'jev-inspect-badge';
      const span = document.createElement('span');
      articleBadge.appendChild(span);

      // Insertion target: before tweetText, or inside User-Name row, or at top of article
      const textEl = article.querySelector(SELECTORS.TWEET_TEXT);
      if (textEl?.parentElement) {
        textEl.parentElement.insertBefore(articleBadge, textEl);
      } else {
        const userEl = article.querySelector(SELECTORS.USER_NAME);
        if (userEl?.parentElement) {
          userEl.parentElement.appendChild(articleBadge);
        } else {
          article.prepend(articleBadge);
        }
      }
    }

    // Update article badge styling & contents
    articleBadge.className = `jev-inspect-badge ${decision.shouldFilter ? 'filtered' : ''}`;
    const span = articleBadge.querySelector('span') || articleBadge;
    span.textContent = ''; // Clear prior children safely

    const visionInfo = formatVisionInfo(decision.visionResult);
    if (decision.shouldFilter) {
      const catName = decision.primaryReason
        ? CATEGORY_MAP.get(decision.primaryReason)?.name || decision.primaryReason
        : '';
      const pct = decision.primaryProbability ? ` ${formatPercent(decision.primaryProbability)}` : '';

      span.appendChild(document.createTextNode('🚫 判定: '));
      const b = document.createElement('b');
      b.textContent = catName;
      span.appendChild(b);
      span.appendChild(document.createTextNode(`${pct}${visionInfo} (${timeStr})`));
    } else {
      let topCat = '';
      let topScore = 0;
      if (decision.allScores) {
        for (const [k, v] of Object.entries(decision.allScores)) {
          if (typeof v === 'number' && v > topScore) {
            topScore = v;
            topCat = k;
          }
        }
      }
      const topCatName = topCat ? CATEGORY_MAP.get(topCat as any)?.name || topCat : '';
      const topInfo = topCat ? ` (${topCatName} ${formatPercent(topScore)})` : '';

      span.appendChild(document.createTextNode(`✅${topInfo}${visionInfo} [${timeStr}]`));
    }
  }
}
