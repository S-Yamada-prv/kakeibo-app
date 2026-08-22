# Receipt Ledger

レシート画像をClaude APIで読み取り、購入品・カテゴリ・支出推移を管理するReact家計簿アプリです。

## セットアップ

```bash
npm install
copy .env.example .env
```

`.env` に `ANTHROPIC_API_KEY` を設定してください。APIキーはNode.jsサーバーからのみ利用され、ブラウザへ公開されません。

## 起動

```bash
npm run dev
```

フロントエンドは `http://localhost:5173`、解析APIは `http://localhost:8787` で起動します。

## GitHub Pages への公開

`main` ブランチへ push すると、GitHub Actions が Vite のビルドと Pages へのデプロイを実行します。GitHub リポジトリの Settings > Pages で、Source を **GitHub Actions** に設定してください。

GitHub Pages は静的ホスティングのため、レシート画像の Claude 解析 API は実行できません。解析機能も公開する場合は、Node.js サーバーを別途デプロイし、Actions のビルド時に `VITE_API_URL` をその API の URL に設定してください。API キーは Pages 側へ設定しないでください。
