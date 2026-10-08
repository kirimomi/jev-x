export const ATTRS = {
  PROCESSED: 'data-jev-processed',
  RECHECKED: 'data-jev-rechecked',
  TARGET: 'data-target',
} as const;

export const SELECTORS = {
  TWEET: 'article[data-testid="tweet"]',
  TIME: 'time',
  STATUS_LINK: 'a[href*="/status/"]',
  USER_NAME: 'div[data-testid="User-Name"]',
  USER_AVATAR: 'div[data-testid="Tweet-User-Avatar"]',
  TWEET_TEXT: 'div[data-testid="tweetText"]',
  TWEET_PHOTO: 'div[data-testid="tweetPhoto"]',
  CARD_WRAPPER: 'div[data-testid="card.wrapper"], div[data-testid*="card"]',
  CARD_DETAIL: '[data-testid="card.layoutLarge.detail"] span, a div[dir="auto"] span, a span',
  CARD_DOMAIN: 'span[dir="ltr"]',
  CARD_LINK: 'a[role="link"], a[href]',
  EMPTY_STATE: '[data-testid="emptyState"]',
  SENSITIVE: '[data-testid*="sensitive"]',
  CONTENT_IMAGES:
    'div[data-testid="tweetPhoto"] img, div[data-testid="card.wrapper"] img, div[data-testid*="card"] img, img[src*="pbs.twimg.com/media/"], img[src*="pbs.twimg.com/card_img/"]',
  INSPECT_BADGE: '.jev-inspect-badge',
  FILTER_BANNER: '.jev-filter-banner',
} as const;

export const LOCALE_TEXTS = {
  REPLY_PREFIXES: ['返信先', 'Replying to'],
  ALT_IMAGE_PREFIXES: ['画像', 'Image'],
  SHOW_BUTTON_TEXTS: ['表示する', 'Show', 'View'],
  SENSITIVE_WARNINGS: [
    'センシティブな内容',
    'センシティブなメディア',
    'Sensitive content',
    '閲覧注意',
    'センシティブ',
    'Sensitive',
  ],
} as const;
