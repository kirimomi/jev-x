import { TweetData, CategoryId } from '../types/index.js';

interface MockKeywordRule {
  keywords: string[];
  score: number;
}

export const MOCK_KEYWORDS: Record<CategoryId, MockKeywordRule> = {
  adult_nsfw: {
    keywords: [
      '裏垢', 'オナ', 'エロ', 'nsfw', 'パパ活', 'マン凸', '巨乳', '無修正',
      '出会い', 'サブスク', 'オナレコ', '凸', 'p活', '18禁', 'ファンティア',
      'fantia', 'myfans', 'onlyfans',
    ],
    score: 0.95,
  },
  ai_slop: {
    keywords: [
      'ai美女', 'chatgpt', 'gpt', 'ai生成', 'slop', 'midjourney',
      'プロンプト', '画像生成', '自動化', '量産', '生成ai',
    ],
    score: 0.92,
  },
  impression_zombie: {
    keywords: [],
    score: 0.96,
  },
  thread_bait: {
    keywords: [
      '最後にとんでもない', '続きはツリー', 'プロフへ', '👇', '1/', 'ツリー',
      'リプ欄', '保存', 'ブクマ', 'まとめました', '選', '知らなきゃ損',
    ],
    score: 0.88,
  },
  scam_hustle: {
    keywords: [
      '月100万', 'brain', 'プレゼント企画', 'プロンプト配布', '誰でも稼げる',
      '副業', '無料配布', 'フォロワー限定', 'tips', '不労所得', '完全自動',
    ],
    score: 0.94,
  },
  rage_bait: {
    keywords: [
      '男はこれだから', '女の敵', 'z世代', '民度', '害悪', '炎上',
      'フェミ', '弱男', '晒し', 'クソリプ', '老害',
    ],
    score: 0.89,
  },
  toxic_venting: {
    keywords: [
      '死ね', 'ゴミすぎる', '消えろ', 'クソが', '最悪', 'ウザい', 'イライラ', '鬱',
    ],
    score: 0.91,
  },
  preachy_guru: {
    keywords: [
      '優秀な人ほど', '残酷な真実', '30代で気づいたこと', '本質', '思考法', '成功者', '習慣',
    ],
    score: 0.86,
  },
  affiliate_spam: {
    keywords: [
      'セールでこれだけは買え', 'リプ欄にお得', 'amzn.to', 'amazon', 'クーポン', 'ポイント還元', '楽天',
    ],
    score: 0.93,
  },
  spoilers: {
    keywords: [
      'の結末', 'が死亡', 'ネタバレ', 'ラストシーン',
    ],
    score: 0.90,
  },
};

/**
 * Mock evaluator that matches tweets against keyword rules for fast offline test evaluation
 */
export function mockEvaluate(
  tweet: TweetData,
  activeCategoryIds: CategoryId[]
): Record<CategoryId, number> {
  const scores = {} as Record<CategoryId, number>;
  
  // Combine all texts for keyword searching in the mock evaluator
  const parts = [tweet.text];
  if (tweet.quoteText) parts.push(tweet.quoteText);
  if (tweet.ogp?.title) parts.push(tweet.ogp.title);
  if (tweet.ogp?.description) parts.push(tweet.ogp.description);
  
  const textToSearch = parts.join(' ').toLowerCase();

  for (const catId of activeCategoryIds) {
    scores[catId] = 0.05; // baseline low probability
  }

  for (const catId of activeCategoryIds) {
    if (catId === 'adult_nsfw') {
      if (tweet.hasSensitiveWarning || tweet.vision?.isLikelyNsfw) {
        scores.adult_nsfw = 0.98;
      } else if (MOCK_KEYWORDS.adult_nsfw.keywords.some((kw) => textToSearch.includes(kw))) {
        scores.adult_nsfw = MOCK_KEYWORDS.adult_nsfw.score;
      }
    } else if (catId === 'impression_zombie') {
      // For impression zombies, we usually only care about the main reply text length/emoji
      if (
        tweet.isReply &&
        (tweet.text.length < 15 ||
          /^[\p{Emoji}\s]+$/u.test(tweet.text) ||
          /[\u0600-\u06FF]/.test(tweet.text) ||
          /^(nice|great|good|wow|cool|awesome|lol)/i.test(tweet.text))
      ) {
        scores.impression_zombie = MOCK_KEYWORDS.impression_zombie.score;
      }
    } else {
      const rule = MOCK_KEYWORDS[catId];
      if (rule && rule.keywords.some((kw) => textToSearch.includes(kw))) {
        scores[catId] = rule.score;
      }
    }
  }

  return scores;
}
