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
