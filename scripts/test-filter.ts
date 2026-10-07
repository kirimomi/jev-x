import 'dotenv/config';
import { FilterEngine } from '../src/core/filterEngine.js';
import { getDefaultUserSettings, CATEGORY_MAP } from '../src/core/categories.js';
import { TweetData } from '../src/types/index.js';

// Sample test tweets representing diverse timeline scenarios
const SAMPLE_TWEETS: TweetData[] = [
  {
    id: 'tweet-001-normal',
    authorUsername: 'tarou_tech',
    authorName: 'タロウ@エンジニア',
    text: '今夜はTypeScriptの型パズルを解いていたらこんな時間になってしまった。明日のリリースに向けて早く寝よう。',
  },
  {
    id: 'tweet-002-ai-slop',
    authorUsername: 'ai_hacks_daily',
    authorName: 'AIで脱サラ研究所',
    text: '【衝撃】ChatGPTに〇〇と聞いたら1秒でブログ記事が100本量産できた件。AI美女画像と組み合わせて自動収益化する方法をまとめました。時代に乗り遅れたくない人は必見。',
    imageAlts: ['Midjourneyで生成されたリアルなAI美女が微笑んでいる画像'],
  },
  {
    id: 'tweet-003-impression-zombie',
    authorUsername: 'random_bot_99',
    authorName: 'John',
    text: '😂😂😂😂😂👏👏',
    isReply: true,
  },
  {
    id: 'tweet-004-thread-bait',
    authorUsername: 'biz_growth_tips',
    authorName: 'ビジネス思考法',
    text: '年収300万から3000万になった私が「20代で捨てた悪習慣7選」。\n\n特に7つ目は99%の人が気づいていません。\n最後にとんでもないオチが待っています…👇（ツリーへ続く 1/8）',
  },
  {
    id: 'tweet-005-scam-with-ogp',
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
  {
    id: 'tweet-006-rage-bait',
    authorUsername: 'daily_debate_jp',
    authorName: '物申すマン',
    text: 'これだから最近のZ世代は使えないんだよ。残業少し頼んだだけでパワハラ扱いとか民度低すぎ。甘えるのもいい加減にしろ。',
  },
  {
    id: 'tweet-007-spoiler',
    authorUsername: 'movie_fan_leak',
    authorName: '映画ネタバレ速報',
    text: '劇場版の最新作見てきたけど、まさか中盤で主人公の親友が死亡するとは思わなかった…！黒幕の正体は完全にあの人じゃん。',
  },
];

async function runTest() {
  console.log('='.repeat(70));
  console.log('🧪 jev-x 判定エンジンの検証テスト (filterEngine test)');
  console.log('='.repeat(70));

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
  // rage_bait と spoilers もテストのために有効化してみる
  settings.categories['rage_bait'].enabled = true;
  settings.categories['spoilers'].enabled = true;

  console.log('\n[有効なカテゴリ]');
  const activeCategories = Object.entries(settings.categories)
    .filter(([_, conf]) => conf.enabled)
    .map(([id, conf]) => `${CATEGORY_MAP.get(id as any)?.badgeIcon || '🛡️'} ${CATEGORY_MAP.get(id as any)?.name} (閾値: ${conf.threshold})`);
  console.log(activeCategories.join('\n'));

  console.log('\n' + '-'.repeat(70));
  console.log(`📋 サンプルツイート ${SAMPLE_TWEETS.length} 件の評価を開始...`);
  console.log('-'.repeat(70) + '\n');

  const startTime = performance.now();
  const decisions = await engine.evaluateBatch(SAMPLE_TWEETS, settings);
  const totalElapsed = Math.round(performance.now() - startTime);

  decisions.forEach((decision, index) => {
    const tweet = SAMPLE_TWEETS[index];
    const icon = decision.shouldFilter ? '🚫 [FILTERED]' : '✅ [SAFE]';
    console.log(`${icon} Tweet ID: ${tweet.id}`);
    console.log(`   投稿者: ${tweet.authorName || ''} (@${tweet.authorUsername})`);
    console.log(`   本文冒頭: "${tweet.text.slice(0, 45).replace(/\n/g, ' ')}..."`);

    if (tweet.ogp) {
      console.log(`   🔗 OGP: "${tweet.ogp.title}" (${tweet.ogp.domain})`);
    }

    if (decision.shouldFilter) {
      const reasonDef = decision.primaryReason ? CATEGORY_MAP.get(decision.primaryReason) : null;
      console.log(
        `   🛡️ 主な判定理由: ${reasonDef?.badgeIcon} ${reasonDef?.name || decision.primaryReason} ` +
        `(確信度: ${(decision.primaryProbability! * 100).toFixed(1)}%)`
      );

      if (decision.matchedCategories.length > 1) {
        const others = decision.matchedCategories
          .map((m) => `${m.categoryId}(${(m.probability * 100).toFixed(0)}%)`)
          .join(', ');
        console.log(`   📌 その他該当: ${others}`);
      }
    }

    console.log(`   ⏱️ 所要時間: ${decision.latencyMs}ms`);
    console.log('');
  });

  console.log('='.repeat(70));
  const filteredCount = decisions.filter((d) => d.shouldFilter).length;
  console.log(`🏁 テスト完了: 全${SAMPLE_TWEETS.length}件中、${filteredCount}件をフィルタ対象として検知`);
  console.log(`⏱️ 総バッチ処理時間: ${totalElapsed}ms (平均: ${(totalElapsed / SAMPLE_TWEETS.length).toFixed(1)}ms/件)`);
  console.log('='.repeat(70));
}

runTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
