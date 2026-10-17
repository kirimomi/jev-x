import { CategoryDefinition, CategoryId, UserFilterSettings } from '../types/index.js';

export const FILTER_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'adult_nsfw',
    name: 'アダルト / センシティブ',
    description: '露骨な性的・成人向け表現、エロ画像、風俗・裏垢・パパ活等の宣伝誘導（※ニュースや規制議論は除外）',
    instruction:
      'Does this post contain sexually explicit or pornographic content, erotic/high-exposure NSFW imagery (including Explicit/high-NSFW vision flags or sensitive warnings), or solicitation for sex work, secret NSFW accounts (裏垢), or compensated dating (パパ活)? Exclude news reporting, technical or policy discussions about AI/censorship, or mere mentions of adult/NSFW words without explicit content or solicitation.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🔞',
  },
  {
    id: 'rage_bait',
    name: '炎上・対立煽り (Rage Bait)',
    description: '男女論、世代、地域、特定界隈などを標的にし、意図的に読者の怒りや分断・議論を煽る投稿',
    instruction:
      'Is this post rage bait that deliberately provokes outrage, gender wars, generational conflict, or polarized tribal fighting for engagement? Exclude calm social commentary, neutral news reporting, or constructive debate.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🔥',
  },
  {
    id: 'toxic_venting',
    name: '暴言・過度な愚痴・呪詛',
    description: '他者や社会への口汚い罵倒、悪質な個人攻撃、見ているだけで気が滅入る過剰な怨嗟の吐き出し',
    instruction:
      'Does this post contain severe verbal abuse, slurs, death wishes, malicious personal attacks, or intensely toxic cursing and hostility? Exclude mild everyday complaints about work/life, casual slang, or ordinary critical opinions.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '☣️',
  },
  {
    id: 'scam_hustle',
    name: '情報商材・怪しい副業勧誘',
    description: '「誰でも月100万」「無料配布」「Brain / LINE誘導」「儲かるプロンプト」等の誇大広告・プレゼント詐欺',
    instruction:
      'Is this post promoting get-rich-quick schemes, shady info-products (e.g., Brain/Tips/LINE funnels), deceptive side-hustle earnings claims, or fake cash/prompt giveaways (including promotional text in attached banners or link cards)? Exclude legitimate business news, career discussions, or normal financial topics.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '💸',
  },
  {
    id: 'affiliate_spam',
    name: 'アフィリエイト・宣伝スパム',
    description: 'セール煽りやまとめを装った小遣い稼ぎリンク・リプ欄誘導（※個人の純粋な買い物報告やレビューは除外）',
    instruction:
      'Is this post commercial affiliate spam, stealth marketing, or commission-hunting product promotion (such as exaggerated "must-buy sale items" posts pushing affiliate links in replies)? Exclude genuine personal shopping reports, honest individual product reviews, or normal item recommendations.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🛒',
  },
  {
    id: 'thread_bait',
    name: 'X攻略構文・ツリー誘導',
    description: '「最後にとんでもないオチが👇」「知らなきゃ損する〇選」等の引き伸ばしや、「優秀な人ほど〜」等の説教・マウント構文',
    instruction:
      'Does this post use manipulative X engagement-bait templates (e.g., "shocking ending below 👇", "read profile/thread", "must-save top N list") or formulaic, condescending self-help/business-guru lecturing ("successful people never...", "harsh truth:") designed to farm impressions and bookmarks? Exclude informative multi-part explanations, technical threads, or genuine personal reflections.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🧵',
  },
  {
    id: 'ai_slop',
    name: 'AI Slop (低品質AI生成)',
    description: '粗製乱造されたAI美女・量産型AIイラスト、ChatGPTによる無機質なコピペ解説・スパム投稿（※AI技術議論は除外）',
    instruction:
      'Is this post mass-produced AI slop—such as generic chatbot-generated filler/spam text, or does it feature a synthetic AI-generated image (like a glossy AI beauty portrait or mass-produced AI anime illustration) posted for engagement farming? Exclude news, technical explanations, developer discussions, or critiques about AI models and tools.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🤖',
  },
  {
    id: 'impression_zombie',
    name: 'インプレゾンビ',
    description: 'バズポストの丸パクリ・無断転載、絵文字だけのリプ、脈絡のない外国語・ボットによるインプレ稼ぎリプ',
    instruction:
      'Is this post an "impression zombie" spam reply or plagiarized bot post on Japanese X—such as a meaningless emoji-only reply, an out-of-context foreign-script/bot reply (e.g., Arabic, Hindi, or generic one-word English replies), or a copy-pasted viral tweet used for impression farming? Exclude genuine conversational replies or normal reactions with context.',
    defaultThreshold: 0.5,
    defaultEnabled: true,
    badgeIcon: '🧟',
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
    enableImageVision: true,
    imageVisionMode: 'local',
    settingsVersion: 3,
    globalSensitivityMultiplier: 1.0,
  };
}
