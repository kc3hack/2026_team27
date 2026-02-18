import { pipeline } from "@huggingface/transformers";
import { EffectType, type ClassifyResult } from "./types.js";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, "..");

// モデル: 日本語特化 ruri-v3-30m (JMTEB 74.51, 256次元, 37Mパラメータ)
const BASE_MODEL_NAME = "sirasagi62/ruri-v3-30m-ONNX";
const FINE_TUNED_MODEL_DIR = join(SERVER_ROOT, "models", "fine-tuned-ruri-v3-30m-onnx");
const TRAINING_DATA_PATH = join(SERVER_ROOT, "data", "training-data.json");

// 統計的外れ値検出のパラメータ
// base model (q8):  mean≈0.87, std≈0.018 → z*std=0.027 なので minGap が閾値を支配
// fine-tuned (fp32): mean≈0.54, std≈0.142 → z*std=0.284 なので z が閾値を支配
// 各モデルの最適 F1: base=77.1%(z=0.5,gap=0.01), ft=85.7%(z=0.5,gap=0.01)
// 運用では precision 重視のため保守的に設定
const BASE_Z_THRESHOLD = 1.5;
const BASE_MIN_GAP = 0.03;
const FINETUNED_Z_THRESHOLD = 2.0;
const FINETUNED_MIN_GAP = 0.05;

// 各EffectTypeの代表フレーズ (フォールバック用)
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

interface Exemplar {
  phrase: string;
  embedding: Float32Array;
}

interface TrainingExample {
  text: string;
  label: string;
  is_positive: boolean;
}

export class EffectClassifier {
  private extractor: any = null;
  private exemplars = new Map<EffectType, Exemplar[]>();
  private zThreshold: number;
  private minGap: number;

  constructor(zThreshold?: number, minGap?: number) {
    // 明示指定がなければ initialize() でモデル種別に応じて自動設定
    this.zThreshold = zThreshold ?? BASE_Z_THRESHOLD;
    this.minGap = minGap ?? BASE_MIN_GAP;
  }

  async initialize(): Promise<void> {
    // fine-tuned モデルがあればそちらを使用、なければベースモデルにフォールバック
    const useFineTuned = existsSync(join(FINE_TUNED_MODEL_DIR, "onnx"));
    const modelPath = useFineTuned ? FINE_TUNED_MODEL_DIR : BASE_MODEL_NAME;
    console.log(`[EffectClassifier] Using ${useFineTuned ? "fine-tuned" : "base"} model: ${modelPath}`);

    // モデル種別に応じて閾値パラメータを自動設定 (コンストラクタで明示指定されていなければ)
    if (useFineTuned) {
      this.zThreshold = FINETUNED_Z_THRESHOLD;
      this.minGap = FINETUNED_MIN_GAP;
    }
    console.log(`[EffectClassifier] Threshold params: z=${this.zThreshold}, minGap=${this.minGap}`);

    console.log(`[EffectClassifier] Loading model...`);
    // fine-tuned モデルは fp32、ベースモデルは int8 量子化済み
    this.extractor = await pipeline("feature-extraction", modelPath, {
      dtype: useFineTuned ? "fp32" : "q8",
    });
    console.log("[EffectClassifier] Model loaded. Computing exemplar embeddings...");

    // training-data.json があればそこから positive 例を使用、なければ EFFECT_PHRASES にフォールバック
    const phrases = this.loadPhrases();

    for (const effectType of Object.values(EffectType)) {
      const effectPhrases = phrases[effectType];
      const exemplarList: Exemplar[] = [];
      for (const phrase of effectPhrases) {
        const embedding = await this.embed(phrase);
        exemplarList.push({ phrase, embedding });
      }
      this.exemplars.set(effectType, exemplarList);
    }

    const totalExemplars = Array.from(this.exemplars.values()).reduce((sum, e) => sum + e.length, 0);
    console.log(`[EffectClassifier] ${totalExemplars} exemplar embeddings computed. Ready.`);
  }

  async classify(text: string): Promise<ClassifyResult> {
    const startMs = performance.now();
    const embedding = await this.embed(text);

    // 各属性について全exemplarとの類似度を計算し、MAXを採用 (kNN, k=1)
    const rawScores: { effect: EffectType; similarity: number }[] = [];
    for (const [effectType, exemplarList] of this.exemplars) {
      let maxSim = -Infinity;
      for (const exemplar of exemplarList) {
        const sim = this.cosineSimilarity(embedding, exemplar.embedding);
        if (sim > maxSim) maxSim = sim;
      }
      rawScores.push({
        effect: effectType,
        similarity: maxSim,
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

  private loadPhrases(): Record<EffectType, string[]> {
    // training-data.json が存在すればそこから positive 例を読み込み
    if (existsSync(TRAINING_DATA_PATH)) {
      try {
        const raw = readFileSync(TRAINING_DATA_PATH, "utf-8");
        const data: { examples: TrainingExample[] } = JSON.parse(raw);
        const phrases: Partial<Record<EffectType, string[]>> = {};

        for (const example of data.examples) {
          if (!example.is_positive) continue;
          const effectType = example.label as EffectType;
          if (!Object.values(EffectType).includes(effectType)) continue;
          if (!phrases[effectType]) phrases[effectType] = [];
          phrases[effectType]!.push(example.text);
        }

        // 全属性にデータがあるか確認、足りなければ EFFECT_PHRASES で補完
        const result: Record<EffectType, string[]> = { ...EFFECT_PHRASES };
        for (const effectType of Object.values(EffectType)) {
          if (phrases[effectType] && phrases[effectType]!.length > 0) {
            result[effectType] = phrases[effectType]!;
          }
        }

        console.log(`[EffectClassifier] Loaded training data from ${TRAINING_DATA_PATH}`);
        return result;
      } catch (e) {
        console.warn(`[EffectClassifier] Failed to load training data, using default phrases:`, e);
      }
    }

    return EFFECT_PHRASES;
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
    const output = await this.extractor(`トピック: ${text}`, {
      pooling: "mean",
      normalize: true,
    });
    return new Float32Array(output.data);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }
}
