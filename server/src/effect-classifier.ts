import { pipeline } from "@huggingface/transformers";
import { EffectType, type ClassifyResult } from "./types.js";

const MODEL_NAME = "Xenova/multilingual-e5-small";
// 統計的外れ値検出のパラメータ
const DEFAULT_Z_THRESHOLD = 1.5; // 平均から何σ以上離れたスコアを採用するか
const DEFAULT_MIN_GAP = 0.03;    // 平均との最低差分 (σが小さい=全部似てる場合に全棄却する)

// 各EffectTypeの代表フレーズ
const EFFECT_PHRASES: Record<EffectType, string[]> = {
  [EffectType.HEAT]: [
    "熱い",
    "燃えている",
    "炎のように熱い",
    "あっつい",
    "燃える",
    "燃えろ",
    "ファイア",
    "ファイヤー",
    "炎",
    "暑い",
    "熱く",
    "あつい",
  ],
  [EffectType.COLD]: [
    "冷たい",
    "凍りそう",
    "氷みたいに冷たい",
    "寒い",
    "つめたい",
    "凍る",
    "凍れ",
    "フリーズ",
    "氷",
    "冷たく",
  ],
  [EffectType.ELECTRIC]: [
    "電気",
    "雷が落ちる",
    "ビリビリ",
    "でんき",
    "かみなり",
    "サンダー",
    "稲妻",
    "雷",
  ],
  [EffectType.LIGHT]: [
    "明るい",
    "光り輝く",
    "ピカピカ光る",
    "あかるい",
    "光",
    "ひかり",
    "ライト",
    "輝く",
    "輝け",
    "明るく",
  ],
  [EffectType.FRICTION_REDUCE]: [
    "滑る",
    "ツルツル",
    "すべすべ",
    "すべる",
    "滑れ",
    "つるつる滑る",
  ],
  [EffectType.BOUNCE]: [
    "弾む",
    "跳ねる",
    "ボヨンボヨン",
    "はずむ",
    "バウンド",
    "弾め",
    "跳ねろ",
  ],
  [EffectType.MASS_HEAVY]: [
    "重い",
    "ずっしり重い",
    "ヘビー",
    "おもい",
    "重く",
    "重くなれ",
    "ずっしり",
  ],
  [EffectType.MASS_LIGHT]: [
    "軽い",
    "ふわふわ浮く",
    "軽やか",
    "かるい",
    "軽く",
    "軽くなれ",
    "ふわふわ",
  ],
  [EffectType.SPEED_FAST]: [
    "速い",
    "素早く動く",
    "加速する",
    "はやい",
    "速く",
    "早い",
    "早く",
    "スピード",
    "加速",
  ],
  [EffectType.SPEED_SLOW]: [
    "遅い",
    "ゆっくり動く",
    "減速する",
    "おそい",
    "遅く",
    "スロー",
    "ゆっくり",
    "減速",
  ],
};

// 排他ペア: 両方閾値を超えた場合、信頼度が高い方を採用
const EXCLUSIVE_PAIRS: [EffectType, EffectType][] = [
  [EffectType.HEAT, EffectType.COLD],
  [EffectType.MASS_HEAVY, EffectType.MASS_LIGHT],
  [EffectType.SPEED_FAST, EffectType.SPEED_SLOW],
];

export class EffectClassifier {
  private extractor: any = null;
  private centroids = new Map<EffectType, Float32Array>();
  private zThreshold: number;
  private minGap: number;

  constructor(zThreshold = DEFAULT_Z_THRESHOLD, minGap = DEFAULT_MIN_GAP) {
    this.zThreshold = zThreshold;
    this.minGap = minGap;
  }

  async initialize(): Promise<void> {
    console.log(`[EffectClassifier] Loading model: ${MODEL_NAME}...`);
    this.extractor = await pipeline("feature-extraction", MODEL_NAME, {
      dtype: "q8",
    });
    console.log("[EffectClassifier] Model loaded. Computing centroids...");

    for (const effectType of Object.values(EffectType)) {
      const phrases = EFFECT_PHRASES[effectType];
      const embeddings = await Promise.all(
        phrases.map((p) => this.embed(p)),
      );
      this.centroids.set(effectType, this.meanVector(embeddings));
    }

    console.log("[EffectClassifier] Centroids computed. Ready.");
  }

  async classify(text: string): Promise<ClassifyResult> {
    const startMs = performance.now();
    const embedding = await this.embed(text);

    // 全centroidとの類似度を計算
    const rawScores: { effect: EffectType; similarity: number }[] = [];
    for (const [effectType, centroid] of this.centroids) {
      rawScores.push({
        effect: effectType,
        similarity: this.cosineSimilarity(embedding, centroid),
      });
    }

    // 平均と標準偏差を計算
    const sims = rawScores.map((s) => s.similarity);
    const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
    const variance =
      sims.reduce((a, b) => a + (b - mean) ** 2, 0) / sims.length;
    const std = Math.sqrt(variance);

    // 動的閾値: 平均 + max(z * σ, minGap)
    const dynamicThreshold =
      mean + Math.max(this.zThreshold * std, this.minGap);

    // スコア降順ソート
    rawScores.sort((a, b) => b.similarity - a.similarity);

    const allScores = rawScores.map((s) => ({
      effect: s.effect,
      similarity: s.similarity,
      passed: s.similarity > dynamicThreshold,
    }));

    let effects = rawScores
      .filter((s) => s.similarity > dynamicThreshold)
      .map((s) => ({ effect: s.effect, confidence: s.similarity }));

    effects = this.applyExclusivePairs(effects);

    const classifyMs = performance.now() - startMs;

    return {
      effects,
      debug: {
        allScores,
        mean,
        std,
        threshold: dynamicThreshold,
        classifyMs,
      },
    };
  }

  private applyExclusivePairs(
    results: { effect: EffectType; confidence: number }[],
  ): { effect: EffectType; confidence: number }[] {
    const excluded = new Set<EffectType>();

    for (const [a, b] of EXCLUSIVE_PAIRS) {
      const matchA = results.find((r) => r.effect === a);
      const matchB = results.find((r) => r.effect === b);

      if (matchA && matchB) {
        if (matchA.confidence >= matchB.confidence) {
          excluded.add(b);
        } else {
          excluded.add(a);
        }
      }
    }

    return results.filter((r) => !excluded.has(r.effect));
  }

  private async embed(text: string): Promise<Float32Array> {
    if (!this.extractor) throw new Error("Model not initialized");
    const output = await this.extractor(`query: ${text}`, {
      pooling: "mean",
      normalize: true,
    });
    return new Float32Array(output.data);
  }

  private meanVector(vectors: Float32Array[]): Float32Array {
    if (vectors.length === 0) throw new Error("Empty vectors");
    const dim = vectors[0].length;
    const mean = new Float32Array(dim);

    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        mean[i] += vec[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      mean[i] /= vectors.length;
    }

    // L2正規化
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += mean[i] * mean[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < dim; i++) {
      mean[i] /= norm;
    }

    return mean;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }
}
