import { CategoryDefinition, CategoryId, UserFilterSettings } from '../types/index.js';

export const FILTER_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'adult_nsfw',
    name: 'アダルト / センシティブ',
    description: '露骨な性的・成人向けテキスト、風俗・裏垢・パパ活等の宣伝誘導',
    instruction: 'Is this post explicitly adult, sexually suggestive, pornographic, or promoting sex work/dating scams (NSFW)?',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🔞',
  },
  {
    id: 'ai_slop',
    name: 'AI Slop (低品質AI生成)',
    description: '粗製乱造された低品質AI画像/動画、ChatGPTによる無機質なまとめ・解説・スパム投稿',
    instruction: 'Is this post low-quality automated AI-generated slop, AI spam, or generic churned-out chatbot content?',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🤖',
  },
  {
    id: 'impression_zombie',
    name: 'インプレゾンビ',
    description: 'バズポストの丸パクリ・無断転載、他人の投稿への無意味なコピペリプ、絵文字だけのリプ、脈絡のない外国語リプ',
    instruction: 'Is this post an impression zombie reply, copied stolen tweet, meaningless emoji-only spam, or irrelevant automated engagement bait?',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🧟',
  },
  {
    id: 'thread_bait',
    name: 'ツリー・続き物誘導 (Engagement Bait)',
    description: '「最後にとんでもないオチが…👇」「続きはツリー/プロフで」「知らなきゃ損する7選」などの露骨な引き伸ばし・滞在時間稼ぎ',
    instruction: 'Is this post clickbait designed to force users to open a thread or profile (e.g., "shocking ending below 👇", "read full story in profile", "save this thread")?',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🧵',
  },
  {
    id: 'rage_bait',
    name: '炎上・対立煽り (Rage Bait)',
    description: 'ジェンダー、世代、地域、特定界隈などを標的にし、意図的に読者の怒りや分断を煽る投稿',
    instruction: 'Is this post deliberately inciting anger, culture wars, gender hostility, or toxic conflict for engagement (rage bait)?',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🔥',
  },
  {
    id: 'scam_hustle',
    name: '情報商材・怪しい副業',
    description: '「誰でも月100万」「無料プレゼント」「Brain」「儲かるプロンプト」等の誇大広告・勧誘',
    instruction: 'Is this post promoting get-rich-quick schemes, shady info-products, deceptive financial promises, or scam giveaways?',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '💸',
  },
  {
    id: 'toxic_venting',
    name: '過度な愚痴・攻撃的怨嗟',
    description: '他者や社会への口汚い罵倒、呪詛、見ているだけで気が滅入る過剰なネガティブ感情の吐き出し',
    instruction: 'Is this post excessively hostile, toxic harassment, bitter cursing, or deeply unpleasant verbal abuse?',
    defaultThreshold: 0.5,
    defaultEnabled: false,
    badgeIcon: '☣️',
  },
  {
    id: 'preachy_guru',
    name: 'ビジネス構文・自己啓発ポエム',
    description: '「優秀な人ほど〇〇しない」「これは残酷な真実ですが…」といった改行多用説教・マウント構文',
    instruction: 'Is this post preachy self-help lecturing, condescending business guru posturing, or formulaic motivational advice?',
    defaultThreshold: 0.5,
    defaultEnabled: false,
    badgeIcon: '👔',
  },
  {
    id: 'affiliate_spam',
    name: 'アフィリエイト・ステマ投稿',
    description: 'セール告知やまとめを装った純粋な小遣い稼ぎリンク、リプ欄誘導',
    instruction: 'Is this post predominantly an affiliate link promotion, disguised stealth marketing, or Amazon commission link bait?',
    defaultThreshold: 0.5,
    defaultEnabled: false,
    badgeIcon: '🛒',
  },
  {
    id: 'spoilers',
    name: 'ネタバレ (Spoilers)',
    description: 'アニメ・漫画・映画・ゲームの最新話や結末に関する言及',
    instruction: 'Does this post reveal critical plot spoilers, endings, or surprise twists for popular movies, anime, manga, or games?',
    defaultThreshold: 0.5,
    defaultEnabled: false,
    badgeIcon: '⚠️',
  },
];

export const CATEGORY_MAP = new Map<CategoryId, CategoryDefinition>(
  FILTER_CATEGORIES.map((cat) => [cat.id, cat])
);

/**
 * Generates default user settings from category definitions
 */
export function getDefaultUserSettings(): UserFilterSettings {
  const categories = {} as Record<CategoryId, { enabled: boolean; threshold: number }>;
  for (const cat of FILTER_CATEGORIES) {
    categories[cat.id] = {
      enabled: cat.defaultEnabled,
      threshold: cat.defaultThreshold,
    };
  }
  return {
    categories,
    globalEnabled: true,
    showDebugBadges: true,
    showFoldBanner: true,
    requireMediaForAdult: false, // by default allow user to toggle
    enableImageVision: true,
    settingsVersion: 2,
    globalSensitivityMultiplier: 1.0,
  };
}
