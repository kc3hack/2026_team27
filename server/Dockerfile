FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# data/ と models/ は訓練パイプライン実行後に存在する (任意)
# ビルド前に mkdir -p data models しておくこと
# fine-tuned モデルがなければランタイムでベースモデルにフォールバックする
RUN mkdir -p data models

# モデルを事前ダウンロードしてキャッシュに保存
ENV HF_HOME=/app/.cache/huggingface
RUN node -e "import('@huggingface/transformers').then(m => m.pipeline('feature-extraction', 'sirasagi62/ruri-v3-30m-ONNX', { dtype: 'q8' })).then(() => console.log('Model cached'))"

EXPOSE 3001

CMD ["node", "dist/index.js"]
