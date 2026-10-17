# jev-x

> **Jev (TypeSafe AI)** を活用した、X (旧Twitter) のリアルタイム・コンテンツフィルタリング Chrome 拡張機能

---

## 🚀 インストール方法

> **⚠️ 注意: Jev (TypeSafe AI) のAPIキーが必要です**
> 拡張機能をインストール後、設定画面から API キーを入力してください。

1. **[Releases ページ](https://github.com/kirimomi/jev-x/releases)** から最新版の ZIP ファイルをダウンロードして解凍します。
2. Google Chrome で `chrome://extensions/` を開き、右上の **「デベロッパー モード」** を ON にします。
3. **「パッケージ化されていない拡張機能を読み込む」** から解凍したフォルダを選択します。

---

## 🛠️ 開発・ビルド方法

Node.js (20+) および npm (10+) 環境が必要です。

```bash
# 依存関係のインストール
npm ci

# ビルド（dist/ に拡張機能一式を出力）
npm run build

# ユニットテスト・Lint
npm test
npm run lint

# 判定エンジンの精度検証ベンチマーク（要 .env に TYPESAFE_API_KEY）
npm run test:filter
```

詳細な仕様やアーキテクチャについては [`doc/SPECIFICATION.md`](doc/SPECIFICATION.md) および [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md) を参照してください。
