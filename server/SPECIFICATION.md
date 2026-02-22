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
| Embedding モデル | `sirasagi62/ruri-v3-30m-ONNX` (256次元, int8量子化, JMTEB 74.51) |
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
1. `sirasagi62/ruri-v3-30m-ONNX` モデルをロード (fine-tuned モデルがあればそちらを優先)
2. 各 EffectType に対して複数の代表フレーズ (exemplar) の埋め込み (embedding) を個別に計算・保持
3. `data/training-data.json` があればその positive 例を exemplar として使用、なければデフォルトフレーズにフォールバック

```
HEAT exemplars = [embed("熱い"), embed("燃えている"), embed("炎のように熱い"), ...]
COLD exemplars = [embed("冷たい"), embed("凍りそう"), embed("氷みたいに冷たい"), ...]
...
```

**ランタイム (各発話)**:
1. 入力テキストの埋め込みを計算 (~15-60ms)
2. 全 EffectType の全 exemplar とのコサイン類似度を計算し、各属性の MAX スコアを採用 (kNN, k=1) (<1ms)
3. 動的閾値による外れ値検出で効果を抽出
4. 排他ペアは信頼度 (similarity score) が高い方を採用

### 動的閾値 (統計的外れ値検出)

固定閾値ではなく、入力ごとに全centroidとの類似度分布から動的に閾値を算出する。
多言語 Embedding モデルでは日本語テキスト同士のベースライン類似度が高い (0.85-0.90) ため、固定閾値では無関係なテキストでも全属性がヒットしてしまう。

```
threshold = mean + max(z × σ, minGap)
```

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `z` | 1.5 | 平均から何σ以上のスコアを採用するか |
| `minGap` | 0.03 | 平均との最低差分。σが小さい (= 全属性に均等に類似) 場合に全棄却する |

- 「こんにちは」→ 全属性 ~0.89, σ≈0.007 → threshold ≈ 0.92 → 何もヒットしない
- 「燃えろ」→ heat=0.95, 他 ~0.87, σ≈0.03 → threshold ≈ 0.915 → heat のみヒット

### 排他制御 (信頼度ベース)

| ペア |
|------|
| `heat` ↔ `cold` |
| `mass_heavy` ↔ `mass_light` |
| `speed_fast` ↔ `speed_slow` |

- 両方が閾値を超えた場合 → similarity score が高い方のみ採用
- 排他でないもの (例: `heat` + `bounce`) は併用 OK

## 処理パイプライン

```
[interim text]  ──→ テキスト転送のみ (分類しない)
[is_final text] ──→ 確定セグメントを蓄積 (分類しない)
[speech_final]  ──→ 全セグメント結合 → 1回だけ classify → result 送信
```

- **interim**: Deepgram の中間認識結果をそのままクライアントに転送。ゲーム側でテキストプレビュー表示に利用
- **is_final**: 確定したセグメントを蓄積するだけ。分類は行わない
- **speech_final**: 蓄積した全セグメントを結合し、1回だけ Embedding 分類を実行。テキスト・属性・音声強度をまとめて `result` として送信

属性判定はテキスト確定後に意味を持つため (ゲーム側の描画がテキスト+属性のセットで動作する)、speech_final 時の1回で十分。分類は ~15-60ms なので遅延は無視できる。

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

#### 1. 接続確立

```json
{
  "type": "connected",
  "message": "STT session started",
  "ts": 1708156800000
}
```

#### 2. 中間テキスト (リアルタイム)

```json
{
  "type": "interim",
  "text": "あつ",
  "ts": 1708156801000
}
```

#### 3. 認識結果 (speech_final 時に送信)

テキスト・属性判定・音声強度が確定した最終結果。

```json
{
  "type": "result",
  "data": {
    "id": "uuid-v4",
    "text": "熱い燃えろ",
    "voiceIntensity": 72,
    "effects": ["heat"]
  },
  "debug": {
    "allScores": [
      { "effect": "heat", "similarity": 0.9523, "passed": true },
      { "effect": "cold", "similarity": 0.8701, "passed": false }
    ],
    "mean": 0.8834,
    "std": 0.0287,
    "threshold": 0.9265,
    "classifyMs": 42.3
  },
  "ts": 1708156802000
}
```

`debug` フィールドは開発時の分類パラメータ確認用。全属性の MAX exemplar スコア分布、動的閾値、分類所要時間を含む。

#### 4. エラー

```json
{
  "type": "error",
  "message": "Deepgram connection failed",
  "ts": 1708156803000
}
```

全メッセージに `ts` (サーバー側 Unix タイムスタンプ ms) を付与。クライアント側でメッセージ間隔の計測に利用。

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
- Embedding 分類は speech_final 時に1回のみ実行、~15-60ms で遅延は無視できる

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
- 分類エラー時は effects を空配列にして result を返却 (テキストは失わない)
- 自動再接続は行わない（ゲームのセッション単位で管理するため）

## ディレクトリ構成

```
server/
├── src/
│   ├── index.ts              # エントリポイント (HTTP + WebSocket)
│   ├── ws-handler.ts         # WebSocket 接続ハンドラ
│   ├── deepgram-client.ts    # Deepgram STT クライアント
│   ├── effect-classifier.ts  # Embedding ベース属性判定 (kNN + 動的閾値)
│   ├── audio-analyzer.ts     # 音声強度 (RMS) 計算
│   └── types.ts              # 型定義
├── data/
│   └── training-data.json         # 訓練データ (gitignored)
├── models/                        # fine-tuned ONNX モデル出力 (gitignored)
├── Dockerfile
├── docker-compose.yml
├── test-client.html          # ブラウザ用テストクライアント
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

### テスト

`test-client.html` をブラウザで開き、Start ボタンを押してマイクで発話する。

- 左パネル: メッセージログ (INTERIM / RESULT + メッセージ間隔)
- 右パネル: 分類デバッグ (全属性スコアバーチャート、動的閾値ライン、分類所要時間)

### 接続先の使い分け

```
ローカルテスト:  ws://localhost:3001/ws/stt
外部公開 (本番): wss://${NGROK_DOMAIN}/ws/stt
ヘルスチェック:  curl http://localhost:3001/health
```
