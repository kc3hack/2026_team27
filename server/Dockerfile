FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# モデルを事前ダウンロードしてキャッシュに保存
ENV HF_HOME=/app/.cache/huggingface
RUN node -e "import('@huggingface/transformers').then(m => m.pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' })).then(() => console.log('Model cached'))"

EXPOSE 3001

CMD ["node", "dist/index.js"]
