import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TypeSafeClient, image, noul, type NoulQuestion } from '@typesafe-ai/sdk';
import { CATEGORY_MAP } from '../src/core/categories.js';

interface ImageTestCase {
  id: string;
  title: string;
  author: string;
  text: string;
  imageSource: string; // local file path or https://pbs.twimg.com/... URL
  expectedTarget: string;
}

const DEFAULT_CASES: ImageTestCase[] = [
  {
    id: 'case-1-ai-beauty',
    title: 'AI美女ポートレート + 無害な挨拶文（本文にAI表記なし）',
    author: 'mina_daily_life (@mina_model_xx)',
    text: 'おはようございます☀️ 今日も一日お仕事がんばりましょう！カフェでひと休み中です☕️',
    imageSource: path.resolve(process.cwd(), 'scripts/fixtures/images/ai_beauty_portrait.jpg'),
    expectedTarget: 'AI生成画像 / AI Slop 検知（テキストのみでは0%になるケース）',
  },
  {
    id: 'case-2-ai-anime',
    title: '量産型AIアニメイラスト + 短文（本文にAI表記なし）',
    author: 'illust_gallery_99 (@illust_gallery_99)',
    text: '新作できました✨ 気に入ったらいいね＆フォローお願いします！',
    imageSource: path.resolve(process.cwd(), 'scripts/fixtures/images/ai_anime_slop.jpg'),
    expectedTarget: 'AI生成イラスト / AI Slop 検知',
  },
  {
    id: 'case-3-scam-banner',
    title: '文字入り情報商材バナー画像 + 絵文字のみの本文',
    author: 'kasegu_meister (@kasegu_meister)',
    text: '👇👇👇🔥🔥🔥',
    imageSource: path.resolve(process.cwd(), 'scripts/fixtures/images/scam_banner.jpg'),
    expectedTarget: '画像内文字（月収100万円達成等）からの情報商材(scam_hustle)検知',
  },
  {
    id: 'case-4-normal-food',
    title: '通常の実写風ラーメン写真 + 日常ツイート（誤検知チェック用コントロール）',
    author: 'ramen_taro (@ramen_taro)',
    text: 'お昼は近所の醤油ラーメン。スープが染みる〜ごちそうさまでした！',
    imageSource: path.resolve(process.cwd(), 'scripts/fixtures/images/normal_food_photo.jpg'),
    expectedTarget: 'すべて低スコア（SAFE / 誤検知しないこと）',
  },
];

/**
 * Normalizes an X image URL to ?format=jpg&name=small so it satisfies Jev's JPEG & 280..1568px constraints
 */
function normalizeTwitterImageUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    if (u.hostname.includes('twimg.com')) {
      u.searchParams.set('format', 'jpg');
      if (!u.searchParams.has('name') || u.searchParams.get('name') === 'orig' || u.searchParams.get('name') === 'large') {
        u.searchParams.set('name', 'small');
      }
      return u.toString();
    }
  } catch {
    // ignore
  }
  return urlStr;
}

async function loadImageBytes(source: string): Promise<{ bytes: Uint8Array; sizeKb: number; resolvedSource: string }> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const normalized = normalizeTwitterImageUrl(source);
    const res = await fetch(normalized);
    if (!res.ok) {
      throw new Error(`Failed to fetch image URL (${res.status}): ${normalized}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, sizeKb: Math.round((buf.byteLength / 1024) * 10) / 10, resolvedSource: normalized };
  }
  const buf = await fs.readFile(source);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return { bytes, sizeKb: Math.round((bytes.byteLength / 1024) * 10) / 10, resolvedSource: source };
}

async function runExperiment() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    console.error('❌ .env に TYPESAFE_API_KEY が設定されていません。');
    process.exit(1);
  }

  const client = new TypeSafeClient({ apiKey });

  // Build questions: existing categories + dedicated AI-generated visual question
  const questions: Record<string, NoulQuestion> = {
    ai_slop_existing: noul(CATEGORY_MAP.get('ai_slop')!.instruction),
    ai_generated_visual: noul(
      'Does `attached_image` appear to be an AI-generated image (e.g., an AI-generated beauty/influencer portrait, AI anime illustration, or synthetic diffusion artwork with glossy AI rendering characteristics)?'
    ),
    scam_hustle: noul(CATEGORY_MAP.get('scam_hustle')!.instruction),
    adult: noul(CATEGORY_MAP.get('adult_nsfw')!.instruction),
    impression_zombie: noul(CATEGORY_MAP.get('impression_zombie')!.instruction),
  };

  // Optional CLI argument to test a custom image URL or local file
  const customImgArg = process.argv[2];
  const customTextArg = process.argv[3] || 'これすごい！';
  const cases: ImageTestCase[] = customImgArg
    ? [
        {
          id: 'custom-case',
          title: 'カスタム指定画像テスト',
          author: 'custom_user (@custom_user)',
          text: customTextArg,
          imageSource: customImgArg,
          expectedTarget: 'ユーザー指定画像の評価',
        },
      ]
    : DEFAULT_CASES;

  const modelsToTest = ['jev-latest', 'jev-preview'];

  console.log('='.repeat(80));
  console.log('🔬 Jev 画像判定（Vision）性能・転送量・レイテンシ検証実験');
  console.log('='.repeat(80));

  for (const tc of cases) {
    console.log(`\n📌 [${tc.id}] ${tc.title}`);
    console.log(`   投稿者: ${tc.author}`);
    console.log(`   本文: "${tc.text}"`);
    console.log(`   狙い: ${tc.expectedTarget}`);

    const { bytes, sizeKb, resolvedSource } = await loadImageBytes(tc.imageSource);
    console.log(`   画像ソース: ${path.basename(resolvedSource)} (サイズ: ${sizeKb} KB)`);

    // 1. Baseline: Text-only evaluation on jev-latest
    const t0 = performance.now();
    const textOnlyRes = await client.systemOne({
      model: 'jev-latest',
      state: {
        author: tc.author,
        text: tc.text,
      },
      questions: {
        ai_slop_existing: questions.ai_slop_existing,
        scam_hustle: questions.scam_hustle,
        adult: questions.adult,
      },
    });
    const textLatency = Math.round(performance.now() - t0);
    console.log(
      `\n   [ベースライン: テキストのみ (${textOnlyRes.model})]` +
        ` ⏱️ ${textLatency}ms | 🪙 input_tokens: ${textOnlyRes.usage.input_tokens}`
    );
    console.log(
      `     - ai_slop: ${(textOnlyRes.answers.ai_slop_existing.noul * 100).toFixed(1)}%` +
        ` | scam_hustle: ${(textOnlyRes.answers.scam_hustle.noul * 100).toFixed(1)}%` +
        ` | adult: ${(textOnlyRes.answers.adult.noul * 100).toFixed(1)}%`
    );

    // 2. With Image on each model
    for (const modelName of modelsToTest) {
      const start = performance.now();
      try {
        const imgRes = await client.systemOne(
          {
            model: modelName,
            state: {
              author: tc.author,
              text: tc.text,
              attached_image: image(bytes),
            },
            questions,
          },
          {
            headers: { 'TypeSafe-Danger-Zone-Images': 'true' },
          }
        );
        const elapsed = Math.round(performance.now() - start);
        const tokenDiff =
          imgRes.usage.input_tokens !== null && textOnlyRes.usage.input_tokens !== null
            ? `+${imgRes.usage.input_tokens - textOnlyRes.usage.input_tokens} tokens`
            : '';

        console.log(
          `\n   [画像あり: ${modelName} (実モデル: ${imgRes.model})]` +
            ` ⏱️ ${elapsed}ms (+${elapsed - textLatency}ms) | 🪙 input_tokens: ${imgRes.usage.input_tokens} (${tokenDiff})`
        );
        console.log(
          `     - 🤖 ai_slop(既存プロンプト): ${(imgRes.answers.ai_slop_existing.noul * 100).toFixed(1)}%`
        );
        console.log(
          `     - 🎨 ai_generated_visual(AI画像特化質問): ${(imgRes.answers.ai_generated_visual.noul * 100).toFixed(1)}%`
        );
        console.log(
          `     - 💸 scam_hustle(情報商材): ${(imgRes.answers.scam_hustle.noul * 100).toFixed(1)}%`
        );
        console.log(
          `     - 🔞 adult(センシティブ): ${(imgRes.answers.adult.noul * 100).toFixed(1)}%`
        );
        console.log(
          `     - 🧟 impression_zombie: ${(imgRes.answers.impression_zombie.noul * 100).toFixed(1)}%`
        );
      } catch (err: any) {
        console.error(`   ❌ [${modelName}] エラー:`, err?.message || err);
      }
    }
    console.log('\n' + '-'.repeat(80));
  }
}

runExperiment().catch((err) => {
  console.error('Experiment failed:', err);
  process.exit(1);
});
