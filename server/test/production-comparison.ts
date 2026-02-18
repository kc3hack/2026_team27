/**
 * 4構成の網羅比較
 *
 * A: base model + EFFECT_PHRASES (84 exemplars)
 * B: base model + training-data  (271 exemplars)
 * C: fine-tuned  + EFFECT_PHRASES (84 exemplars)
 * D: fine-tuned  + training-data  (271 exemplars)
 *
 * 各構成について最適 z を探索し、最大 F1 同士を比較する。
 * これにより「fine-tuning の追加価値」と「exemplar 拡張の追加価値」を分離して評価できる。
 */

import { pipeline } from "@huggingface/transformers";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EFFECT_PHRASES: Record<string, string[]> = {
  heat: ["熱い","燃えている","炎のように熱い","あっつい","燃える","燃えろ","ファイア","ファイヤー","炎","暑い","熱く","あつい"],
  cold: ["冷たい","凍りそう","氷みたいに冷たい","寒い","つめたい","凍る","凍れ","フリーズ","氷","冷たく"],
  electric: ["電気","雷が落ちる","ビリビリ","でんき","かみなり","サンダー","稲妻","雷"],
  light: ["明るい","光り輝く","ピカピカ光る","あかるい","光","ひかり","ライト","輝く","輝け","明るく"],
  friction_reduce: ["滑る","ツルツル","すべすべ","すべる","滑れ","つるつる滑る"],
  bounce: ["弾む","跳ねる","ボヨンボヨン","はずむ","バウンド","弾め","跳ねろ"],
  mass_heavy: ["重い","ずっしり重い","ヘビー","おもい","重く","重くなれ","ずっしり"],
  mass_light: ["軽い","ふわふわ浮く","軽やか","かるい","軽く","軽くなれ","ふわふわ"],
  speed_fast: ["速い","素早く動く","加速する","はやい","速く","早い","早く","スピード","加速"],
  speed_slow: ["遅い","ゆっくり動く","減速する","おそい","遅く","スロー","ゆっくり","減速"],
};

interface Exemplar { phrase: string; embedding: Float32Array; }

// テストケース (finetune-analysis.ts と同一)
const cases: [string, string][] = [
  ["熱い", "heat"], ["冷たい", "cold"], ["電気", "electric"],
  ["光", "light"], ["滑る", "friction_reduce"], ["弾む", "bounce"],
  ["太陽", "heat"], ["北極", "cold"], ["感電", "electric"],
  ["蛍", "light"], ["石鹸", "friction_reduce"], ["トランポリン", "bounce"],
  ["鉛", "mass_heavy"], ["風船", "mass_light"], ["チーター", "speed_fast"], ["カメ", "speed_slow"],
  ["焦げる", "heat"], ["窯", "heat"], ["火炎放射", "heat"],
  ["霜柱", "cold"], ["冷房", "cold"], ["かき氷", "cold"],
  ["電池", "electric"], ["ショート", "electric"],
  ["照明", "light"], ["フラッシュ", "light"],
  ["ローション", "friction_reduce"], ["アイスバーン", "friction_reduce"],
  ["弾性", "bounce"], ["反動", "bounce"],
  ["錨", "mass_heavy"], ["砲丸", "mass_heavy"],
  ["綿毛", "mass_light"], ["泡", "mass_light"],
  ["俊敏", "speed_fast"], ["韋駄天", "speed_fast"],
  ["牛歩", "speed_slow"], ["鈍い", "speed_slow"],
  ["こんにちは", ""], ["ありがとう", ""], ["やったー", ""],
  ["もう一回", ""], ["頑張れ", ""], ["了解", ""],
];

async function buildExemplars(
  extractor: any,
  phrases: Record<string, string[]>,
): Promise<Map<string, Exemplar[]>> {
  const map = new Map<string, Exemplar[]>();
  for (const [effect, pList] of Object.entries(phrases)) {
    const list: Exemplar[] = [];
    for (const p of pList) {
      const out = await extractor(`トピック: ${p}`, { pooling: "mean", normalize: true });
      list.push({ phrase: p, embedding: new Float32Array(out.data) });
    }
    map.set(effect, list);
  }
  return map;
}

function loadTrainingPhrases(): Record<string, string[]> {
  const dataPath = join(__dirname, "..", "data", "training-data.json");
  const raw = readFileSync(dataPath, "utf-8");
  const data: { examples: { text: string; label: string; is_positive: boolean }[] } = JSON.parse(raw);
  const phrases: Record<string, string[]> = {};
  for (const ex of data.examples) {
    if (!ex.is_positive) continue;
    if (!phrases[ex.label]) phrases[ex.label] = [];
    phrases[ex.label].push(ex.text);
  }
  return phrases;
}

function classify(
  embedding: Float32Array,
  exemplars: Map<string, Exemplar[]>,
): { scores: { effect: string; sim: number }[]; mean: number; std: number } {
  const scores: { effect: string; sim: number }[] = [];
  for (const [effect, exList] of exemplars) {
    let maxSim = -Infinity;
    for (const ex of exList) {
      let dot = 0;
      for (let i = 0; i < embedding.length; i++) dot += embedding[i] * ex.embedding[i];
      if (dot > maxSim) maxSim = dot;
    }
    scores.push({ effect, sim: maxSim });
  }
  const sims = scores.map(s => s.sim);
  const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
  const std = Math.sqrt(sims.reduce((a, b) => a + (b - mean) ** 2, 0) / sims.length);
  scores.sort((a, b) => b.sim - a.sim);
  return { scores, mean, std };
}

interface EvalResult {
  tp: number; fp: number; fn: number; tn: number;
  prec: number; rec: number; f1: number;
  details: { text: string; expected: string; hit: boolean; topEffect: string; topSim: number; thr: number; gap: number }[];
}

function evaluate(
  embeddings: Float32Array[],
  exemplars: Map<string, Exemplar[]>,
  z: number,
  minGap: number,
): EvalResult {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const details: EvalResult["details"] = [];
  for (let i = 0; i < cases.length; i++) {
    const [text, expected] = cases[i];
    const r = classify(embeddings[i], exemplars);
    const thr = r.mean + Math.max(z * r.std, minGap);
    const passed = r.scores.filter(s => s.sim > thr).map(s => s.effect);
    const hit = expected === "" ? passed.length === 0 : passed.includes(expected);
    if (expected !== "") { if (hit) tp++; else fn++; }
    else { if (hit) tn++; else fp++; }
    details.push({ text, expected, hit, topEffect: r.scores[0].effect, topSim: r.scores[0].sim, thr, gap: r.scores[0].sim - thr });
  }
  const prec = tp / (tp + fp) || 0;
  const rec = tp / (tp + fn) || 0;
  const f1 = 2 * prec * rec / (prec + rec) || 0;
  return { tp, fp, fn, tn, prec, rec, f1, details };
}

function findOptimalZ(
  embeddings: Float32Array[],
  exemplars: Map<string, Exemplar[]>,
): { z: number; minGap: number; result: EvalResult } {
  let best = { z: 0, minGap: 0, result: null as EvalResult | null };
  for (const mg of [0.01, 0.02, 0.03, 0.05, 0.08]) {
    for (const z of [0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5]) {
      const r = evaluate(embeddings, exemplars, z, mg);
      if (!best.result || r.f1 > best.result.f1) {
        best = { z, minGap: mg, result: r };
      }
    }
  }
  return best as { z: number; minGap: number; result: EvalResult };
}

function pad(s: string, n: number): string {
  let w = 0;
  for (const c of s) w += c.charCodeAt(0) > 0x7f ? 2 : 1;
  return s + " ".repeat(Math.max(0, n - w));
}

async function main() {
  const ftDir = join(__dirname, "..", "models", "fine-tuned-ruri-v3-30m-onnx");
  if (!existsSync(join(ftDir, "onnx"))) {
    console.error("Fine-tuned model not found");
    process.exit(1);
  }

  // モデルロード
  console.log("Loading base model...");
  const baseExt = await pipeline("feature-extraction", "sirasagi62/ruri-v3-30m-ONNX", { dtype: "q8" });
  console.log("Loading fine-tuned model...");
  const ftExt = await pipeline("feature-extraction", ftDir, { dtype: "fp32" });

  // exemplar 構築 (4種)
  console.log("Building exemplars...");
  const trainingPhrases = loadTrainingPhrases();
  const baseEffectEx = await buildExemplars(baseExt, EFFECT_PHRASES);
  const baseTrainEx = await buildExemplars(baseExt, trainingPhrases);
  const ftEffectEx = await buildExemplars(ftExt, EFFECT_PHRASES);
  const ftTrainEx = await buildExemplars(ftExt, trainingPhrases);

  const baseEffectCount = Array.from(baseEffectEx.values()).reduce((s, e) => s + e.length, 0);
  const baseTrainCount = Array.from(baseTrainEx.values()).reduce((s, e) => s + e.length, 0);
  console.log(`Exemplar counts: EFFECT_PHRASES=${baseEffectCount}, training-data=${baseTrainCount}`);

  // 全テストケースの embedding を事前計算
  console.log("Computing test embeddings...");
  const baseEmbs: Float32Array[] = [];
  const ftEmbs: Float32Array[] = [];
  for (const [text] of cases) {
    baseEmbs.push(new Float32Array((await baseExt(`トピック: ${text}`, { pooling: "mean", normalize: true })).data));
    ftEmbs.push(new Float32Array((await ftExt(`トピック: ${text}`, { pooling: "mean", normalize: true })).data));
  }

  // 4構成の最適パラメータ探索
  console.log("\nSearching optimal parameters...\n");

  const configs = [
    { name: "A: base + EFFECT_PHRASES", embs: baseEmbs, exs: baseEffectEx },
    { name: "B: base + training-data",  embs: baseEmbs, exs: baseTrainEx },
    { name: "C: ft   + EFFECT_PHRASES", embs: ftEmbs,   exs: ftEffectEx },
    { name: "D: ft   + training-data",  embs: ftEmbs,   exs: ftTrainEx },
  ];

  const results: { name: string; z: number; minGap: number; result: EvalResult }[] = [];

  for (const cfg of configs) {
    const opt = findOptimalZ(cfg.embs, cfg.exs);
    results.push({ name: cfg.name, ...opt });
  }

  // ====== 結果表示 ======
  console.log("=" .repeat(100));
  console.log("4構成の最適 F1 比較");
  console.log("=".repeat(100));
  console.log(
    pad("構成", 30) + pad("z", 6) + pad("gap", 6) +
    pad("TP", 5) + pad("FP", 5) + pad("FN", 5) + pad("TN", 5) +
    pad("Prec", 8) + pad("Rec", 8) + pad("F1", 8)
  );
  console.log("-".repeat(100));
  for (const r of results) {
    console.log(
      pad(r.name, 30) +
      pad(r.z.toFixed(1), 6) + pad(r.minGap.toFixed(2), 6) +
      pad(String(r.result.tp), 5) + pad(String(r.result.fp), 5) +
      pad(String(r.result.fn), 5) + pad(String(r.result.tn), 5) +
      pad((r.result.prec * 100).toFixed(1) + "%", 8) +
      pad((r.result.rec * 100).toFixed(1) + "%", 8) +
      pad((r.result.f1 * 100).toFixed(1) + "%", 8)
    );
  }

  // ====== 貢献度分析 ======
  console.log("\n" + "=".repeat(100));
  console.log("貢献度分析 (F1 の差分)");
  console.log("=".repeat(100));

  const [a, b, c, d] = results.map(r => r.result.f1 * 100);
  console.log(`\nベースライン:           A (base + EFFECT_PHRASES)  = ${a.toFixed(1)}%`);
  console.log(`exemplar 拡張の効果:    B - A = ${(b - a).toFixed(1)}pp  (base + training-data = ${b.toFixed(1)}%)`);
  console.log(`fine-tuning の効果:     C - A = ${(c - a).toFixed(1)}pp  (ft + EFFECT_PHRASES = ${c.toFixed(1)}%)`);
  console.log(`両方の効果:             D - A = ${(d - a).toFixed(1)}pp  (ft + training-data = ${d.toFixed(1)}%)`);
  console.log(`\n*** fine-tuning の追加価値 (exemplar 拡張済みの上に) ***`);
  console.log(`D - B = ${(d - b).toFixed(1)}pp`);
  console.log(`（${b.toFixed(1)}% → ${d.toFixed(1)}%: exemplar 拡張だけで達成できる水準に対する fine-tuning の上乗せ）`);

  // ====== ケース別差分: B vs D ======
  console.log("\n" + "=".repeat(100));
  console.log("ケース別差分: B (base+training-data) vs D (ft+training-data)");
  console.log("=".repeat(100));

  const optB = findOptimalZ(baseEmbs, baseTrainEx);
  const optD = findOptimalZ(ftEmbs, ftTrainEx);
  const detailB = evaluate(baseEmbs, baseTrainEx, optB.z, optB.minGap);
  const detailD = evaluate(ftEmbs, ftTrainEx, optD.z, optD.minGap);

  console.log(`\nB params: z=${optB.z}, minGap=${optB.minGap}`);
  console.log(`D params: z=${optD.z}, minGap=${optD.minGap}\n`);

  console.log(pad("入力", 14) + pad("期待", 16) + pad("B結果", 6) + pad("D結果", 6) + " 判定  備考");
  console.log("-".repeat(100));

  let improved: string[] = [];
  let degraded: string[] = [];

  for (let i = 0; i < cases.length; i++) {
    const [text, expected] = cases[i];
    const bHit = detailB.details[i].hit;
    const dHit = detailD.details[i].hit;
    const verdict = bHit === dHit ? (bHit ? "=o" : "=x") : (dHit ? "+改善" : "-悪化");

    let note = "";
    if (!bHit) note += `B:top=${detailB.details[i].topEffect}(${detailB.details[i].gap.toFixed(3)}) `;
    if (!dHit) note += `D:top=${detailD.details[i].topEffect}(${detailD.details[i].gap.toFixed(3)}) `;

    if (dHit && !bHit) improved.push(`"${text}" (${expected || "空"})`);
    if (!dHit && bHit) degraded.push(`"${text}" (${expected || "空"})`);

    console.log(
      pad(`"${text}"`, 14) + pad(expected || "(空)", 16) +
      pad(bHit ? "o" : "x", 6) + pad(dHit ? "o" : "x", 6) +
      ` ${verdict}  ${note}`
    );
  }

  console.log(`\n改善: ${improved.length}件 ${improved.join(", ")}`);
  console.log(`悪化: ${degraded.length}件 ${degraded.join(", ")}`);
}

main().catch(console.error);
