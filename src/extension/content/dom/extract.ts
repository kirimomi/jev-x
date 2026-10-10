import { TweetData, OgpCardInfo } from '../../../types/index.js';
import { evaluateTweetVision } from '../vision.js';
import { SELECTORS, LOCALE_TEXTS } from './selectors.js';

let fallbackCounter = 0;

/**
 * Extracts status ID from tweet article or generates a unique fallback ID
 */
export function getTweetId(article: HTMLElement): string {
  const timeEl = article.querySelector(SELECTORS.TIME);
  const linkEl = timeEl?.closest('a') || article.querySelector(SELECTORS.STATUS_LINK);
  const href = linkEl?.getAttribute('href') || '';
  const match = href.match(/\/status\/(\d+)/);
  if (match) {
    return match[1];
  }
  fallbackCounter++;
  return `fallback-${Date.now()}-${fallbackCounter}`;
}

/**
 * Finds all content images inside a tweet, excluding user avatar icons
 */
export function findContentImages(article: HTMLElement): HTMLImageElement[] {
  return Array.from(
    article.querySelectorAll<HTMLImageElement>(SELECTORS.CONTENT_IMAGES)
  ).filter((img) => {
    const isAvatar = Boolean(img.closest(SELECTORS.USER_AVATAR));
    return !isAvatar;
  });
}

/**
 * Robustly extracts structured data and image analysis from any tweet article element
 */
export async function extractTweetData(article: HTMLElement): Promise<TweetData> {
  // 1. Tweet ID
  const id = getTweetId(article);

  // 2. Author username extraction
  const userEl = article.querySelector(SELECTORS.USER_NAME);
  const authorText = userEl?.textContent || '';
  const usernameMatch = authorText.match(/@(\w+)/);
  const authorUsername = usernameMatch ? usernameMatch[1] : 'unknown';
  const authorName = authorText.split('@')[0]?.trim() || undefined;

  // 3. Text extraction (primary: data-testid="tweetText", fallback: article textContent)
  const textEls = article.querySelectorAll(SELECTORS.TWEET_TEXT);
  let text = textEls[0]?.textContent?.trim() || '';
  let quoteText: string | undefined = undefined;

  if (textEls.length > 1) {
    quoteText = Array.from(textEls)
      .slice(1)
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .join(' ') || undefined;
  }

  if (!text) {
    text = (article as HTMLElement).innerText?.slice(0, 300) || '';
  }

  // 4. OGP / Link card extraction
  let ogp: OgpCardInfo | undefined = undefined;
  const cardWrapper = article.querySelector(SELECTORS.CARD_WRAPPER);
  if (cardWrapper) {
    const cardTitle =
      cardWrapper.querySelector(SELECTORS.CARD_DETAIL)?.textContent?.trim() ||
      cardWrapper.querySelector('a div[dir="auto"]')?.textContent?.trim();

    const cardDomain =
      cardWrapper.querySelector(SELECTORS.CARD_DOMAIN)?.textContent?.trim() ||
      article.querySelector(`a[href*="http"] ${SELECTORS.CARD_DOMAIN}`)?.textContent?.trim();

    const cardLink = cardWrapper.querySelector(SELECTORS.CARD_LINK)?.getAttribute('href') || undefined;

    if (cardTitle || cardDomain) {
      ogp = {
        title: cardTitle || undefined,
        domain: cardDomain || undefined,
        url: cardLink,
      };
    }
  }

  // 5. Image elements (Tweet photos + Link card / OGP thumbnails)
  const imageAlts: string[] = [];
  const allImgs = findContentImages(article);

  allImgs.forEach((img) => {
    const alt = img.getAttribute('alt')?.trim();
    if (
      alt &&
      !LOCALE_TEXTS.ALT_IMAGE_PREFIXES.some((prefix) => alt.startsWith(prefix)) &&
      alt.length > 2
    ) {
      imageAlts.push(alt);
    }
  });

  // 6. X official sensitive warning overlay detection (targeted to overlay elements only)
  let hasSensitiveWarning = false;
  if (article.querySelector(SELECTORS.EMPTY_STATE) || article.querySelector(SELECTORS.SENSITIVE)) {
    hasSensitiveWarning = true;
  } else {
    const mediaContainers = article.querySelectorAll(
      'div[data-testid="tweetPhoto"], [data-testid="videoComponent"], div[aria-labelledby]'
    );
    for (const container of mediaContainers) {
      const cText = container.textContent || '';
      if (LOCALE_TEXTS.SENSITIVE_WARNINGS.some((warning) => cText.includes(warning))) {
        hasSensitiveWarning = true;
        break;
      }
      const btnSpan = container.querySelector('button span');
      const btnText = btnSpan?.textContent || '';
      if (LOCALE_TEXTS.SHOW_BUTTON_TEXTS.some((btn) => btnText.includes(btn))) {
        hasSensitiveWarning = true;
        break;
      }
    }
  }

  // 7. Client-side Vision Analysis
  const vision = await evaluateTweetVision(article, allImgs, hasSensitiveWarning);

  const replyContainers = article.querySelectorAll('div[id*="id__"]');
  let isReply = false;
  for (const el of replyContainers) {
    const replyText = el.textContent || '';
    if (LOCALE_TEXTS.REPLY_PREFIXES.some((prefix) => replyText.includes(prefix))) {
      isReply = true;
      break;
    }
  }

  return {
    id,
    authorUsername,
    authorName,
    text,
    ogp,
    quoteText,
    imageAlts: imageAlts.length > 0 ? imageAlts : undefined,
    isReply,
    hasSensitiveWarning,
    vision,
  };
}
