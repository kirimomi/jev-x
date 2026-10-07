# jev-x 仕様書 & 設計方針

本ドキュメントは、TypeSafe AIの意思決定AIモデル **Jev** を活用したX（旧Twitter）コンテンツフィルタリングシステム `jev-x` の詳細仕様および設計方針を定めます。

---

## 1. システム全体像

### 1.1 背景と目的
現代のX（旧Twitter）はインプレッション収益化に伴い、AI Slop、インプレゾンビ、露骨なツリー誘導、過激な対立煽り等のノイズが増加しています。
従来の正規表現や単語ミュートでは文脈を捉えたフィルタリングが難しく、従来のLLM（GPT等）ではタイムラインのリアルタイム処理に耐えうる速度とコストを達成できません。

本プロジェクトでは、**非自己回帰型で高速（sub-500ms）・低コスト・構造化出力に特化した「Jev」** を採用し、ユーザーの好みに応じた快適なタイムライン閲覧環境を実現します。

### 1.2 技術スタック
- **判定エンジン**: Jev (TypeSafe AI) API (`@typesafe-ai/sdk`)
- **ブラウザ拡張機能 (PC)**: Chrome Extension (Manifest V3, TypeScript, Vite)
- **UI/スタイリング**: Vanilla CSS / Tailwind CSS (軽量重視)
- **ストレージ/キャッシュ**: `chrome.storage.local` / `IndexedDB`
- **モバイル展開**: WebExtension Polyfill (iOS Safari機能拡張 / Android Firefox・Kiwi)

---

## 2. フィルタカテゴリ一覧と判定基準

各カテゴリは個別に有効化/無効化（Toggle）および感度しきい値（Threshold: 0.0〜1.0、デフォルト0.7）を設定可能です。

| ID | カテゴリ名 | 判定プロンプト指針 |
| :--- | :--- | :--- |
| `adult_nsfw` | アダルト / センシティブ | 露骨な性的・成人向けテキスト、風俗・裏垢・パパ活等の宣伝誘導 |
| `ai_slop` | AI Slop | 生成AIによる粗悪で無機質なまとめ、botによる低品質なAI画像/動画・テキスト |
| `impression_zombie` | インプレゾンビ | バズツイートの文言コピペ、他言語（アラビア語等）の脈絡のない返信、絵文字のみの無意味なリプライ |
| `thread_bait` | ツリー・続き物誘導 | 「最後にとんでもない結末が👇」「続きはツリーで」「プロフへ」等の過剰なクリック誘導・引き伸ばし |
| `rage_bait` | 炎上・対立煽り | ジェンダー、世代、地域、界隈などを標的にし、読者の怒りや分断を煽ってインプレッションを稼ぐ投稿 |
| `scam_hustle` | 情報商材・怪しい副業 | 「誰でも月100万」「無料プレゼント」「Brain」「儲かるプロンプト」等の誇大広告・勧誘 |
| `toxic_venting` | 過度な愚痴・攻撃的怨嗟 | 攻撃的な個人攻撃、社会への一方的で過激な罵倒・呪詛など、読者に過度な精神的負荷を与える投稿 |
| `preachy_guru` | ビジネス構文・自己啓発 | 「優秀な人ほど〇〇しない」「これが本質ですが」等の上から目線の説教・マウント構文・過剰な改行 |
| `affiliate_spam` | アフィリエイト・ステマ | セール告知やまとめを装った純粋な小遣い稼ぎリンク、リプ欄誘導 |
| `spoilers` | ネタバレ | 話題の映画・アニメ・漫画・ゲームの最新展開や結末の暴露 |

---

## 3. Jev 判定スキーマ設計

Jevの特徴である「State（対象テキスト・コンテキスト）」に対する「Questions（並列評価）」を利用します。
ユーザーがONにしているカテゴリのみをリクエストに含めることで、処理速度とトークン消費を最小化します。

### 3.1 評価コンテキスト（State）の構成
ポスト本文だけでなく、**OGPリンクカード情報（タイトル・説明・ドメイン）** や画像ALTテキストを包括したリッチなコンテキストを構築します。これにより、「本文は短文だがリンク先が露骨な情報商材/AI Slop/釣り記事」といったケースを高精度に判定できます。

```typescript
// Jevへ渡すState（評価対象テキスト）の生成ロジック
const state = [
  `[投稿者]: @${authorUsername}`,
  `[本文]: ${tweetText}`,
  hasOgp ? [
    `[リンクカード(OGP)]`,
    `  - タイトル: ${ogp.title}`,
    `  - 概要: ${ogp.description}`,
    `  - ドメイン: ${ogp.domain}`
  ].join('\n') : '',
  imageAlts.length > 0 ? `[画像ALT]: ${imageAlts.join(', ')}` : ''
].filter(Boolean).join('\n\n');
```

### 3.2 リクエスト例（TypeScript想定）
```typescript
import { JevClient } from '@typesafe-ai/sdk';

const jev = new JevClient({ apiKey: userApiKey });

// ユーザーが有効化しているカテゴリのみ抽出
const activeCategories = getActiveCategories(); // 例: ['ai_slop', 'impression_zombie', 'thread_bait']

const questions = activeCategories.map(cat => ({
  id: cat.id,
  type: 'score', // 0.0 〜 1.0 の確信度
  prompt: cat.detectionPrompt
}));

// バッチ実行
const response = await jev.evaluate({
  state: state,
  questions: questions
});

// レスポンス処理
for (const [catId, score] of Object.entries(response.scores)) {
  if (score >= getThreshold(catId)) {
    return { shouldFilter: true, reason: catId, score };
  }
}
```

---

## 4. クライアントアーキテクチャ (Chrome拡張)

### 4.1 Content Script
- **DOM監視**: `MutationObserver` で `article[data-testid="tweet"]` を検知。
- **抽出データ**:
  - ツイートの一意識別子（Tweet ID / URLパーマリンク）
  - 投稿者名・スクリーンネーム（`@handle`）
  - ツイート本文テキスト
  - **OGPカード情報**:
    - `[data-testid="card.wrapper"]` 等からタイトル、説明文、ドメイン、URLを抽出
  - **画像ALT属性**: `img[alt]` テキスト
  - リプライ関係（親ツイートへの返信かどうか）
- **UI制御（アコーディオン式 たたむ／開く）**:
  - **完全消去ではなく「折りたたみ表示」を採用**:
    - レイアウト崩れやTLジャンプ（ガタつき）を防ぐ。
    - 誤判定時や興味がある場合にいつでも確認可能にする。
  - **初期状態（フィルタ対象判定時）**:
    - ポスト本体の要素を非表示（折りたたみ）化。
    - コンパクトな **Jev Filter Bar** を挿入:
      `[🛡️ AI Slop (94%) として非表示にしました] ──── [ 表示する ▼ ]`
  - **展開時（「表示する ▼」クリック時）**:
    - アコーディオン形式でポスト本体がスムーズに展開表示。
    - Filter Bar は上部に小さく固定され、ボタンが `[ たたむ ▲ ]` に変化。
  - **再折りたたみ時（「たたむ ▲」クリック時）**:
    - 再度ポスト本体が折りたたまれ、初期のコンパクト表示に戻る。
  - **誤判定フィードバック**:
    - Filter Bar 内に「常に表示（このユーザー/ポストを除外）」ボタンを設置。

### 4.2 Background Service Worker
- APIキーを安全に保持し、Content Scriptからの判定要求を取りまとめて Jev API へ中継。
- **デバウンス & バッチ処理**: スクロールによって一度に5〜10件検知されたツイートを束ねて、1往復のAPIコールで並列判定。

### 4.3 キャッシュレイヤー (IndexedDB)
- 同一ツイートに対する重複判定を防ぐため、`tweetId` をキーに結果（Safe / Masked + 理由 + スコア）をローカル保存。
- ユーザーが手動で「再判定」「誤判定（ホワイトリスト化）」できる仕組みを整備。

---

## 5. モバイル（スマホ）展開戦略

スマートフォンからフィルタ済みタイムラインを見るためのアプローチと採用方針です。

### 5.1 検討アプローチの比較
1. **モバイルWeb拡張機能 (採用アプローチ)**
   - **iOS**: Safari Web Extension（App Store配布またはTestFlight / 開発者モード）。
   - **Android**: Firefox for Android または Kiwi Browser（Chrome拡張を直接インストール可能）。
   - **UX**: モバイルブラウザで `x.com` にアクセスし、「ホーム画面に追加」してPWA化すれば、公式アプリと大差ない操作感でフルフィルタリングが有効。
   - **コード共通化**: Chrome拡張のManifest V3 / WebExtensionsコードの90%以上をそのまま再利用可能。

2. **設定・キャッシュのクラウド同期 (オプション拡張)**
   - PCで作成した「NG設定」「ホワイトリスト」をモバイルブラウザ側にも共有するため、軽量なストレージ（Cloudflare Workers KV または Supabase）を連携可能にする。

3. **公式ネイティブアプリの通信改変 (非推奨・不採用)**
   - SSL Pinning回避や証明書インストールが必要となり、アプリの更新で恒常的に破損するため採用しない。

---

## 6. セキュリティとプライバシー

- **APIキーの保護**: 拡張機能の `chrome.storage.sync` または `local` に暗号化/ローカル保持し、第三者サーバーへは送信しない。
- **データ送信の最小化**: ツイート判定に必要なテキストのみを Jev API に送信し、ユーザー自身の個人情報や閲覧履歴は外部送信しない。
