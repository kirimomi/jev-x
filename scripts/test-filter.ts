import 'dotenv/config';
import { FilterEngine } from '../src/core/filterEngine.js';
import { getDefaultUserSettings, CATEGORY_MAP } from '../src/core/categories.js';
import { CategoryId, TweetData } from '../src/types/index.js';

interface BenchmarkCase {
  expectedFilter: boolean;
  expectedCategory?: CategoryId;
  note: string;
  tweet: TweetData;
}

// Benchmark test suite covering confusing Safe (False Positive candidates) and Filtered targets across all 8 categories
const BENCHMARK_CASES: BenchmarkCase[] = [
  // --- SAFE (誤検知してはいけない境界ケース) ---
  {
    expectedFilter: false,
    note: '日常のエンジニア投稿',
    tweet: {
      id: 'safe-001-normal-dev',
      authorUsername: 'tarou_tech',
      authorName: 'タロウ@エンジニア',
      text: '今夜はTypeScriptの型パズルを解いていたらこんな時間になってしまった。明日のリリースに向けて早く寝よう。',
    },
  },
  {
    expectedFilter: false,
    note: 'アダルト・エロ等の単語を含むAI規制・技術解説ニュース (adult_nsfw / ai_slop 誤爆防止)',
    tweet: {
      id: 'safe-002-grok-nsfw-news',
      authorUsername: 'ai_news_jp',
      authorName: 'AI技術ニュース',
      text: 'xAIのGrok Imagineの画像生成モデル、他社と比べてアダルト規制やセンシティブ判定のフィルタリング基準がどう設計されているのか技術的に興味深い。エロ目的ではなく表現の自由と安全性のバランスについての議論が必要。',
    },
  },
  {
    expectedFilter: false,
    note: 'ディープフェイクポルノ等の規制法案に関する報道 (adult_nsfw 誤爆防止)',
    tweet: {
      id: 'safe-003-policy-news',
      authorUsername: 'tech_policy_watch',
      authorName: 'IT法務ウォッチ',
      text: '生成AIによるディープフェイクポルノや非同意の性的画像（NCII）に対するプラットフォーム側の規制強化法案が可決された。エロ表現全般ではなく悪質な権利侵害を対象としているのが特徴。',
    },
  },
  {
    expectedFilter: false,
    note: '1/4 を含む通常の有益な技術解説ツリー (thread_bait 誤爆防止)',
    tweet: {
      id: 'safe-004-tech-thread',
      authorUsername: 'ts_compiler_fan',
      authorName: 'TypeScript解説',
      text: 'TypeScript 5.8の型推論パフォーマンス改善について、コンパイラ内部の変更点をまとめました (1/4)\n\nまず条件型の遅延評価がどう変わったかを見ていきます。',
    },
  },
  {
    expectedFilter: false,
    note: 'Amazonリンクを含むが単なる個人の買い物報告・純粋なレビュー (affiliate_spam 誤爆防止)',
    tweet: {
      id: 'safe-005-amazon-personal-review',
      authorUsername: 'kaden_lover',
      authorName: 'タカシ',
      text: 'デスク周りの配線がゴチャゴチャしてたので、AmazonでAnkerのマグネットケーブルホルダーを買ってみた。普通に便利で満足。',
      ogp: {
        title: 'Anker Magnetic Cable Holder マグネット式ケーブルホルダー',
        domain: 'amazon.co.jp',
        url: 'https://www.amazon.co.jp/dp/B08XXXXXX',
      },
    },
  },
  {
    expectedFilter: false,
    note: '日常の軽い愚痴・ぼやき (toxic_venting / rage_bait 誤爆防止)',
    tweet: {
      id: 'safe-006-mild-grumble',
      authorUsername: 'commuter_tokyo',
      authorName: '会社員A',
      text: '朝から電車遅延で満員電車キツすぎる…月曜からこれはさすがに疲れるなあ。帰ったらアイス食べよう。',
    },
  },
  {
    expectedFilter: false,
    note: 'ジェンダー・社会制度に関する冷静なデータ言及 (rage_bait 誤爆防止)',
    tweet: {
      id: 'safe-007-calm-commentary',
      authorUsername: 'econ_observer',
      authorName: '経済ニュースメモ',
      text: '男女の育休取得率の推移データを見ると、制度自体の整備だけでなく職場内の業務代替体制や評価制度の設計がボトルネックになっていることが分かる。',
    },
  },
  {
    expectedFilter: false,
    note: '文脈のある通常の短いリプライ (impression_zombie 誤爆防止)',
    tweet: {
      id: 'safe-008-normal-reply',
      authorUsername: 'friend_user',
      authorName: '友人B',
      text: '現地めちゃくちゃ楽しそう！気をつけて行ってきてね🙌',
      isReply: true,
    },
  },

  // --- FILTERED (確実に検出すべき各カテゴリの代表・境界ケース) ---
  {
    expectedFilter: true,
    expectedCategory: 'adult_nsfw',
    note: '隠語やプロフ誘導を使った裏垢・パパ活勧誘',
    tweet: {
      id: 'filter-001-adult-uraaka',
      authorUsername: 'ura_mio_xx',
      authorName: 'みお🍑裏垢',
      text: '今夜ひとり寂しいから誰か通話かオナ電しよ…♡ 普段は言えないえっちなことしたい人はプロフのリンクからカカオ追加してね🔞 都内でパパ活も募集中です',
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'rage_bait',
    note: '世代・男女対立を煽る Rage Bait',
    tweet: {
      id: 'filter-002-rage-bait',
      authorUsername: 'daily_debate_jp',
      authorName: '物申すマン',
      text: 'これだから最近のZ世代は使えないんだよ。残業少し頼んだだけでパワハラ扱いとか民度低すぎ。男も女も自分の権利ばっか主張して甘えるのもいい加減にしろ。',
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'toxic_venting',
    note: '口汚い罵倒・呪詛・攻撃的怨嗟',
    tweet: {
      id: 'filter-003-toxic-venting',
      authorUsername: 'dark_curse_99',
      authorName: '病み垢',
      text: 'あいつマジで生きてる価値ないだろ今すぐ死ねよゴミが。顔見るだけで吐き気するし全員地獄に落ちて消えろクソ人間どもが',
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'scam_hustle',
    note: '月100万・Brain・無料配布系の情報商材勧誘',
    tweet: {
      id: 'filter-004-scam-with-ogp',
      authorUsername: 'crypto_fire_king',
      authorName: '爆益ニキ',
      text: '完全自動で月100万稼ぐプロンプトとノウハウを今だけ無料配布します！このBrainを読めば初心者でも即日人生激変します。配布終了まであと3時間。',
      ogp: {
        title: '【完全放置で月100万】初心者でもコピペで即金化する錬金術プロンプトパック',
        description: '累計3000部突破！今だけ無料プレゼント実施中。誰でも簡単に不労所得を達成。',
        domain: 'b-rain-info-market.xyz',
        url: 'https://b-rain-info-market.xyz/special-deal',
      },
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'affiliate_spam',
    note: 'セール煽り・リプ欄アフィリンク誘導スパム',
    tweet: {
      id: 'filter-005-affiliate-spam',
      authorUsername: 'otoku_matome_bot',
      authorName: 'お得セール速報🔥',
      text: '【Amazonセール終了間近】これだけは絶対買え！買わないと損する神アイテムまとめ🔥 在庫切れ前に急げ！お得な商品リンクはすべてリプ欄に貼っておきました👇 #PR',
      ogp: {
        title: 'Amazonタイムセール祭り 対象商品リンク',
        domain: 'amzn.to',
        url: 'https://amzn.to/3XXXXXX',
      },
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'thread_bait',
    note: '「〇〇7選」「最後にとんでもないオチが👇」のツリー誘導',
    tweet: {
      id: 'filter-006-thread-bait',
      authorUsername: 'biz_growth_tips',
      authorName: 'ビジネス思考法',
      text: '年収300万から3000万になった私が「20代で捨てた悪習慣7選」。\n\n特に7つ目は99%の人が気づいていません。\n最後にとんでもないオチが待っています…👇（ツリーへ続く 1/8）',
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'thread_bait',
    note: '「残酷な真実」「優秀な人ほど〜」のX攻略・ビジネス説教構文（旧 preachy_guru 統合分）',
    tweet: {
      id: 'filter-007-preachy-guru',
      authorUsername: 'ceo_mindset_jp',
      authorName: '外資系コンサル社長',
      text: '残酷な真実を言います。\n\n仕事ができない人ほど「頑張ります」と言い、\n本当に優秀な人ほど「仕組み」を作ります。\n\n凡人は努力で解決しようとし、一流は環境を変える。\nこの本質に気づけない人は一生搾取される側です。\n忘れないようにブクマして毎日見返してください。',
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'ai_slop',
    note: 'ChatGPT量産記事＋AI美女画像のAI Slop投稿',
    tweet: {
      id: 'filter-008-ai-slop',
      authorUsername: 'ai_hacks_daily',
      authorName: 'AIで脱サラ研究所',
      text: '【衝撃】ChatGPTに〇〇と聞いたら1秒でブログ記事が100本量産できた件。AI美女画像と組み合わせて自動収益化する方法をまとめました。時代に乗り遅れたくない人は必見。',
      imageAlts: ['Midjourneyで生成されたリアルなAI美女が微笑んでいる画像'],
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'impression_zombie',
    note: '絵文字のみのインプレゾンビリプライ',
    tweet: {
      id: 'filter-009-impression-zombie-emoji',
      authorUsername: 'random_bot_99',
      authorName: 'John',
      text: '😂😂😂😂😂👏👏',
      isReply: true,
    },
  },
  {
    expectedFilter: true,
    expectedCategory: 'impression_zombie',
    note: '脈絡のないアラビア語ボットによるインプレゾンビリプライ',
    tweet: {
      id: 'filter-010-impression-zombie-foreign',
      authorUsername: 'ahmed_99281',
      authorName: 'Ahmed ☑️',
      text: 'سبحان الله وبحمده سبحان الله العظيم 🙏✨',
      isReply: true,
    },
  },
];

async function runTest() {
  console.log('='.repeat(78));
  console.log('🧪 jev-x 判定エンジンの精度検証ベンチマーク (filterEngine benchmark)');
  console.log('='.repeat(78));

  const forceMock = process.argv.includes('--mock');
  const apiKey = process.env.TYPESAFE_API_KEY;
  const isKeyAvailable = Boolean(apiKey && apiKey !== 'your_typesafe_api_key_here' && !forceMock);

  console.log(`\nモード: ${isKeyAvailable ? '🟢 Jev 実APIモード (TypeSafe API)' : '🟡 モック (疑似判定) モード'}`);
  if (!isKeyAvailable && !forceMock) {
    console.log('※ .env に有効な TYPESAFE_API_KEY が未設定のため、自動的にモックで実行します。');
  }

  const engine = new FilterEngine({
    apiKey: isKeyAvailable ? apiKey : undefined,
    mockMode: !isKeyAvailable,
  });

  const settings = getDefaultUserSettings();

  console.log('\n[有効なカテゴリ (全8カテゴリ・デフォルトON)]');
  const activeCategories = Object.entries(settings.categories)
    .filter(([_, conf]) => conf.enabled)
    .map(
      ([id, conf]) =>
        `  ${CATEGORY_MAP.get(id as CategoryId)?.badgeIcon || '🛡️'} ${id.padEnd(18)} | ${CATEGORY_MAP.get(id as CategoryId)?.name} (閾値: ${conf.threshold})`
    );
  console.log(activeCategories.join('\n'));

  console.log('\n' + '-'.repeat(78));
  console.log(`📋 ベンチマークケース ${BENCHMARK_CASES.length} 件の評価を開始...`);
  console.log('-'.repeat(78) + '\n');

  const tweets = BENCHMARK_CASES.map((c) => c.tweet);
  const startTime = performance.now();
  const decisions = await engine.evaluateBatch(tweets, settings);
  const totalElapsed = Math.round(performance.now() - startTime);

  let correctCount = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  decisions.forEach((decision, index) => {
    const bench = BENCHMARK_CASES[index];
    const tweet = bench.tweet;
    const isCorrectFilter = decision.shouldFilter === bench.expectedFilter;
    const isExpectedCategoryMatched =
      !bench.expectedCategory ||
      decision.matchedCategories.some((m) => m.categoryId === bench.expectedCategory);
    const passed = isCorrectFilter && isExpectedCategoryMatched;

    if (passed) {
      correctCount++;
    } else if (!bench.expectedFilter && decision.shouldFilter) {
      falsePositives++;
    } else {
      falseNegatives++;
    }

    const statusIcon = passed ? '✅ [PASS]' : '❌ [FAIL]';
    const filterBadge = decision.shouldFilter ? '🚫 FILTERED' : '🟢 SAFE';
    console.log(`${statusIcon} ${filterBadge} | ${tweet.id} (${bench.note})`);
    console.log(`   本文: "${tweet.text.slice(0, 55).replace(/\n/g, ' ')}..."`);

    if (decision.allScores) {
      const top3 = Object.entries(decision.allScores)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 3)
        .map(([k, v]) => `${k}:${((v ?? 0) * 100).toFixed(0)}%`)
        .join(', ');
      console.log(`   📊 上位スコア: ${top3}`);
    }

    if (decision.shouldFilter) {
      const reasonDef = decision.primaryReason ? CATEGORY_MAP.get(decision.primaryReason) : null;
      console.log(
        `   🛡️ 主判定: ${reasonDef?.badgeIcon} ${reasonDef?.name || decision.primaryReason} ` +
          `(${(decision.primaryProbability! * 100).toFixed(1)}%)` +
          (bench.expectedCategory ? ` [期待: ${bench.expectedCategory}]` : '')
      );
    }

    console.log(`   ⏱️ ${decision.latencyMs}ms\n`);
  });

  console.log('='.repeat(78));
  console.log(
    `🏁 検証結果: ${correctCount}/${BENCHMARK_CASES.length} 件パス ` +
      `(誤検知 FP: ${falsePositives}件 / 見逃し FN: ${falseNegatives}件)`
  );
  console.log(
    `⏱️ 総バッチ処理時間: ${totalElapsed}ms (平均: ${(totalElapsed / BENCHMARK_CASES.length).toFixed(1)}ms/件)`
  );
  console.log('='.repeat(78));
}

runTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
