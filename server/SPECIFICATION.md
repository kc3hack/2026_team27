# 音声認識 WebSocket サーバー 仕様書

## 概要

ゲームクライアントからストリーミングされる音声を Deepgram でリアルタイム音声認識し、認識されたテキストから **Embedding ベースの意味的類似度判定** でゲーム内の属性効果（EffectType）を判定して返す WebSocket API サーバー。

## 技術スタック

| 項目 | 技術 |
|------|------|
| ランタイム | Node.js 20 LTS |
| 言語 | TypeScript (ESM) |
| WebSocket | ws |
| 音声認識 | Deepgram (`@deepgram/sdk` v4) |
| 音声認識モデル | nova-3 (日本語: `ja`) |
| 属性判定 | `@huggingface/transformers` v3 (Transformers.js) |
| Embedding モデル | `Xenova/multilingual-e5-small` (384次元, int8量子化) |
| コンテナ | Docker + Docker Compose |
| 公開 | ngrok (SSL終端 + トンネル) |

## アーキテクチャ

```
┌──────────────┐  wss://        ┌──────────┐   ws://         ┌──────────┐
│ ゲーム       │ ──────────────→│  ngrok   │──────────────→│  Node.js │
│ クライアント │ audio stream   │ (SSL終端) │               │  (:3001)  │
│              │ ←──────────────│          │←──────────────│          │
│              │   JSON result  │          │               │          │
└──────────────┘                └──────────┘               └────┬─────┘
                                                                │
                                                       audio stream (WS)
                                                                │
                                                                ▼
                                                         ┌──────────┐
                                                         │ Deepgram │
                                                         │ STT API  │
                                                         └──────────┘
```

ngrok が SSL 終端とパブリック URL の発行を担う。Node.js は localhost で起動し、ngrok がトンネル経由で外部に公開する。

## 属性判定アーキテクチャ: Embedding ベース意味分類

### 仕組み

**起動時 (1回のみ)**:
1. `Xenova/multilingual-e5-small` モデルをロード (初回は HuggingFace Hub からダウンロード、以降キャッシュ)
2. 各 EffectType に対して複数の代表フレーズの埋め込み (embedding) を計算
3. フレーズ群の平均ベクトル (L2正規化済み) = そのEffectTypeの「重心 (centroid)」として保持

```
HEAT centroid = normalize(mean(embed("熱い"), embed("燃えている"), embed("炎のように熱い"), ...))
COLD centroid = normalize(mean(embed("冷たい"), embed("凍りそう"), embed("氷みたいに冷たい"), ...))
...
```

**ランタイム (各発話)**:
1. 入力テキストの埋め込みを計算 (~50-100ms)
2. 全 EffectType centroid とのコサイン類似度を計算 (<1ms)
3. 閾値 (threshold=0.5) 以上の効果を抽出
4. 排他ペアは信頼度 (similarity score) が高い方を採用

### 排他制御 (信頼度ベース)

| ペア |
|------|
| `heat` ↔ `cold` |
| `mass_heavy` ↔ `mass_light` |
| `speed_fast` ↔ `speed_slow` |

- 両方が閾値を超えた場合 → similarity score が高い方のみ採用
- 排他でないもの (例: `heat` + `bounce`) は併用 OK

## 逐次処理パイプライン

```
[interim text] ─→ debounce 150ms ─→ embedding計算 ─→ interim_effect送信(暫定)
[is_final text] ─→ 即座にembedding計算 ─→ セグメント結果を蓄積
[speech_final]  ─→ 蓄積したis_finalセグメントを結合 ─→ 最終判定 ─→ result送信
```

- **interim段階**: debounce して最新の interim テキストを分類し、暫定的な effects をクライアントに送信。ゲーム側で先行エフェクト表示が可能
- **is_final段階**: 確定セグメントを即座に分類、結果を蓄積。speech_final を待たずに処理開始
- **speech_final**: 全セグメントを集約し、最終的な WordDefinition を返却

## WebSocket プロトコル

### エンドポイント

```
ws://<host>/ws/stt
```

### クライアント → サーバー

#### 1. 音声データ (Binary)

- **形式**: Raw PCM (Linear16)
- **サンプルレート**: 16000 Hz
- **チャンネル**: 1 (モノラル)
- **ビット深度**: 16bit (signed, little-endian)
- **送信間隔**: 100ms〜250ms 間隔でチャンクを送信

#### 2. 制御メッセージ (JSON)

```json
{
  "type": "control",
  "action": "stop"
}
```

| action | 説明 |
|--------|------|
| `stop` | ストリーミング終了を通知。Deepgram 接続を閉じる |

### サーバー → クライアント

#### 1. 暫定効果 (interim段階で送信、変更される可能性あり)

```json
{
  "type": "interim_effect",
  "text": "あつい燃え",
  "effects": [{ "effect": "heat", "confidence": 0.82 }]
}
```

#### 2. 認識結果 (speech_final 時に送信)

```json
{
  "type": "result",
  "data": {
    "id": "uuid-v4",
    "text": "熱い燃えろ",
    "voiceIntensity": 72,
    "effects": ["heat"]
  }
}
```

#### 3. 中間テキスト (リアルタイム)

```json
{
  "type": "interim",
  "text": "あつ"
}
```

#### 4. エラー

```json
{
  "type": "error",
  "message": "Deepgram connection failed"
}
```

#### 5. 接続確立

```json
{
  "type": "connected",
  "message": "STT session started"
}
```

## データ型定義

### EffectType

```typescript
enum EffectType {
  // 環境効果
  HEAT = "heat",
  COLD = "cold",
  ELECTRIC = "electric",
  LIGHT = "light",
  FRICTION_REDUCE = "friction_reduce",
  BOUNCE = "bounce",

  // 自己効果
  MASS_HEAVY = "mass_heavy",
  MASS_LIGHT = "mass_light",
  SPEED_FAST = "speed_fast",
  SPEED_SLOW = "speed_slow",
}
```

### EffectConfidence

```typescript
interface EffectConfidence {
  effect: EffectType;
  confidence: number; // コサイン類似度 (0.0 - 1.0)
}
```

### WordDefinition

```typescript
interface WordDefinition {
  id: string;            // UUID v4
  text: string;          // 認識テキスト（例: 「熱い」「速い」）
  voiceIntensity: number; // 声の大きさ (0-100)
  effects: EffectType[]; // 判定された効果（複数可）
}
```

### 声の大きさ (voiceIntensity)

- Deepgram のレスポンスには音量情報が含まれないため、**サーバー側で音声 PCM データから RMS (Root Mean Square) を計算**する
- 各音声チャンクの RMS 値を蓄積し、発話完了時に平均化
- RMS 値を 0〜100 のスケールに正規化して `voiceIntensity` として返却
- 正規化: `intensity = Math.min(100, Math.round((rms / MAX_RMS_THRESHOLD) * 100))`
  - `MAX_RMS_THRESHOLD = 8000` (16bit PCM の場合、最大値 32767 の約 25%)

## ゲームバックエンドとしての注意事項

### レイテンシ

- WebSocket による常時接続で TCP ハンドシェイクを省略
- Deepgram のストリーミング API でリアルタイム認識（バッチ処理ではない）
- `endpointing: 300` (300ms の無音で発話区切りを検出) により低遅延で結果を返却
- Embedding 推論は ~50-100ms/文 で十分高速

### 接続管理

- 各クライアント接続ごとに独立した Deepgram セッションを生成
- クライアント切断時は対応する Deepgram 接続を即座にクリーンアップ
- 異常切断（ネットワーク断等）にはハートビート (ping/pong) で検知

### スケーラビリティ

- ステートレス設計: 各 WebSocket 接続が独立しているため水平スケーリング可能
- Embedding モデルは起動時にメモリにロード、全接続で共有
- ngrok の複数トンネルやロードバランサーで分散可能

### エラーハンドリング

- Deepgram 接続エラー時はクライアントに `error` メッセージを送信
- 自動再接続は行わない（ゲームのセッション単位で管理するため）

## ディレクトリ構成

```
server/
├── src/
│   ├── index.ts              # エントリポイント (HTTP + WebSocket)
│   ├── ws-handler.ts         # WebSocket 接続ハンドラ (逐次処理パイプライン)
│   ├── deepgram-client.ts    # Deepgram STT クライアント
│   ├── effect-classifier.ts  # Embedding ベース属性判定
│   ├── audio-analyzer.ts     # 音声強度 (RMS) 計算
│   └── types.ts              # 型定義
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
├── .env
├── .gitignore
└── SPECIFICATION.md
```

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `DEEPGRAM_API_KEY` | Deepgram API キー | (必須) |
| `PORT` | サーバーポート | `3001` |
| `DEEPGRAM_MODEL` | 音声認識モデル | `nova-3` |
| `DEEPGRAM_LANGUAGE` | 認識言語 | `ja` |
| `LOG_LEVEL` | ログレベル | `info` |
| `NGROK_AUTHTOKEN` | ngrok 認証トークン | (必須) |
| `NGROK_DOMAIN` | ngrok 固定ドメイン | (必須) |

## デプロイ

### セットアップ

```bash
cp .env.example .env
# .env を編集: DEEPGRAM_API_KEY, NGROK_AUTHTOKEN, NGROK_DOMAIN を設定
```

`NGROK_DOMAIN` は [ngrok Dashboard > Domains](https://dashboard.ngrok.com/domains) で取得。無料枠で固定ドメインが1つ発行される。

### ローカル開発 (ホットリロード、ngrok なし)

```bash
npm install
npm run dev   # localhost:3001 で起動
```

### Docker 起動 (ローカル + ngrok 自動公開)

```bash
docker compose up -d
```

これ一発で以下が自動的に立ち上がる:

| サービス | ポート | 用途 |
|---------|--------|------|
| **app** | `localhost:3001` | ローカルテスト用 (`ws://localhost:3001/ws/stt`) |
| **ngrok** | `localhost:4040` | ngrok 管理UI (公開URLの確認) |
| **ngrok tunnel** | `wss://${NGROK_DOMAIN}` | 外部公開 (`wss://${NGROK_DOMAIN}/ws/stt`) |

- app の healthcheck が通ってから ngrok が起動する (モデルロード完了を待つ)
- 公開 URL は `http://localhost:4040` または `curl http://localhost:4040/api/tunnels` で確認

### 接続先の使い分け

```
ローカルテスト:  ws://localhost:3001/ws/stt
外部公開 (本番): wss://${NGROK_DOMAIN}/ws/stt
ヘルスチェック:  curl http://localhost:3001/health
```
