# TypeGPU Demos

TypeGPUを使ったWebGPUデモ集です。

**デモサイト**: [https://sonicmoov-nakazaki.github.io/AdventCalendar2025TypeGPUDemo/](https://sonicmoov-nakazaki.github.io/AdventCalendar2025TypeGPUDemo/)

## デモ一覧

| デモ | 説明 | タグ |
|------|------|------|
| [Triangle](triangle.html) | TypeGPUと素のWebGPU APIを比較した三角形描画 | 基本 |
| [Particle Simulation](particle.html) | 重力物理シミュレーションを使ったGPUパーティクルシステム | Compute Shader |
| [Snow Dome](snowdome.html) | 雪が降り注ぐ3Dスノードーム | 3D / Compute Shader |

## セットアップ

```bash
# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

## 必要な環境

- **Node.js**: 18以上
- **ブラウザ**: Chrome 113+ または Edge 113+（WebGPU対応）

## ファイル構成

```
playground/
├── src/
│   ├── triangle-typegpu.ts  # TypeGPU版三角形
│   ├── triangle-webgpu.ts   # WebGPU版三角形
│   ├── particle.ts          # パーティクルシミュレーション
│   └── snowdome/            # スノードーム
│       └── index.ts
├── index.html               # デモ一覧ページ
├── triangle.html            # 三角形デモ
├── particle.html            # パーティクルデモ
├── snowdome.html            # スノードームデモ
├── vite.config.ts           # Vite設定
├── tsconfig.json            # TypeScript設定
└── package.json             # 依存関係
```

## 使い方

1. `npm run dev`で開発サーバーを起動
2. ブラウザで http://localhost:5173 を開く
3. 各デモカードをクリックして実行

## トラブルシューティング

### WebGPUが動作しない

- Chrome/Edgeの最新版を使用しているか確認
- `chrome://flags`で`#enable-unsafe-webgpu`を有効化（古いバージョンの場合）

### TypeScript エラー

- `@webgpu/types`がインストールされているか確認
- `tsconfig.json`に`"types": ["@webgpu/types"]`があるか確認

## デプロイ

GitHub Pagesへの自動デプロイが設定されています。

### 初回セットアップ

1. GitHubでリポジトリを作成
2. Settings → Pages → Source を「GitHub Actions」に変更
3. `main`ブランチにプッシュすると自動でデプロイ

### 手動ビルド

```bash
npm run build
```

`dist/`フォルダにビルド結果が出力されます。
