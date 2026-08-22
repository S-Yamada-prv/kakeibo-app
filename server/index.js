import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const port = Number(process.env.PORT || 8787);
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return callback(new Error('JPG、PNG、WEBP、GIF形式の画像を選択してください。'));
    }
    callback(null, true);
  },
});
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

app.use(cors());
app.use(express.json());

app.post('/api/analyze-receipt', upload.single('receipt'), async (request, response) => {
  if (!request.file) {
    return response.status(400).json({ error: 'レシート画像を選択してください。' });
  }
  if (!anthropic) {
    return response.status(503).json({ error: 'サーバーにANTHROPIC_API_KEYが設定されていません。' });
  }

  try {
    // Claudeには画像とJSON形式の指示を渡し、画面側で扱いやすい構造に統一する。
    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: 'あなたは日本のレシートを正確に読み取る家計簿アシスタントです。必ず指定されたJSONだけを返してください。',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: request.file.mimetype, data: request.file.buffer.toString('base64') },
          },
          {
            type: 'text',
            text: `レシートから店舗名、購入日、商品名、金額、カテゴリを読み取ってください。カテゴリは「食費」「日用品」「外食」「交通費」「医療費」「その他」のいずれかに分類します。割引・値引き・クーポンは金額を必ず負数（例: -100）として商品行に含めてください。JSONのみで返してください。形式: {"store":"店舗名","date":"YYYY-MM-DD","items":[{"name":"商品名","amount":123,"category":"食費"}]}`,
          },
        ],
      }],
    });

    const text = message.content.find((part) => part.type === 'text')?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error('Claudeの応答をJSONとして解釈できませんでした。');
    const receipt = JSON.parse(json);

    return response.json({
      store: String(receipt.store || '不明な店舗'),
      date: /^\d{4}-\d{2}-\d{2}$/.test(receipt.date) ? receipt.date : new Date().toISOString().slice(0, 10),
      items: Array.isArray(receipt.items) ? receipt.items.map((item) => ({
        name: String(item.name || '名称不明'),
        // 割引は負数のまま保持し、合計金額から差し引けるようにする。
        amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0,
        category: String(item.category || 'その他'),
      })) : [],
    });
  } catch (error) {
    console.error('レシート解析エラー:', error);
    if (error?.status === 400 && error.message.includes('credit balance')) {
      return response.status(503).json({ error: 'Claude APIの利用残高が不足しています。Anthropic ConsoleのPlans & Billingで残高を追加してください。' });
    }
    if (error?.status === 401) {
      return response.status(503).json({ error: 'Claude APIキーが無効です。.envのANTHROPIC_API_KEYを確認してください。' });
    }
    if (error?.status === 404) {
      return response.status(503).json({ error: '指定したClaudeモデルが利用できません。.envのCLAUDE_MODELを確認してください。' });
    }
    return response.status(502).json({ error: 'Claude APIとの通信に失敗しました。しばらく待って再試行してください。' });
  }
});

// multerの画像形式・容量エラーを、画面で表示できるJSONに変換する。
app.use((error, _request, response, next) => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: '画像サイズは10MB以下にしてください。' });
  }
  if (error.message?.includes('形式の画像')) {
    return response.status(415).json({ error: error.message });
  }
  return response.status(500).json({ error: '画像の受付に失敗しました。' });
});

app.listen(port, () => console.log(`API server listening on http://localhost:${port}`));
