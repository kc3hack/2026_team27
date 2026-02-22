/**
 * fine-tuning 効果の詳細分析
 *
 * 同一条件 (z=1.5, minGap=0.03, EFFECT_PHRASES exemplar) で
 * base model と fine-tuned model の raw スコアを全件比較し、
 * embedding 空間の変化を可視化する。
 */

import { pipeline } from "@huggingface/transformers";
import { EffectType } from "../src/types.js";
import { existsSync } from "fs";
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

const Z = 1.5;
const MIN_GAP = 0.03;

interface Exemplar { phrase: string; embedding: Float32Array; }

async function buildExemplars(
  extractor: any,
  prefix: string,
): Promise<Map<string, Exemplar[]>> {
  const map = new Map<string, Exemplar[]>();
  for (const [effect, phrases] of Object.entries(EFFECT_PHRASES)) {
    const list: Exemplar[] = [];
    for (const p of phrases) {
      const out = await extractor(`${prefix}${p}`, { pooling: "mean", normalize: true });
      list.push({ phrase: p, embedding: new Float32Array(out.data) });
    }
    map.set(effect, list);
  }
  return map;
}

function classify(
  embedding: Float32Array,
  exemplars: Map<string, Exemplar[]>,
): { scores: { effect: string; sim: number; bestPhrase: string }[]; mean: number; std: number; threshold: number } {
  const scores: { effect: string; sim: number; bestPhrase: string }[] = [];
  for (const [effect, exList] of exemplars) {
    let maxSim = -Infinity;
    let bestPhrase = "";
    for (const ex of exList) {
      let dot = 0;
      for (let i = 0; i < embedding.length; i++) dot += embedding[i] * ex.embedding[i];
      if (dot > maxSim) { maxSim = dot; bestPhrase = ex.phrase; }
    }
    scores.push({ effect, sim: maxSim, bestPhrase });
  }
  const sims = scores.map((s) => s.sim);
  const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
  const variance = sims.reduce((a, b) => a + (b - mean) ** 2, 0) / sims.length;
  const std = Math.sqrt(variance);
  const threshold = mean + Math.max(Z * std, MIN_GAP);
  scores.sort((a, b) => b.sim - a.sim);
  return { scores, mean, std, threshold };
}

// テストケース: 訓練データにも EFFECT_PHRASES にもない未知表現
const cases: [string, string][] = [
  // 直接表現 (コントロール群: 両モデルで正解すべき)
  ["熱い", "heat"], ["冷たい", "cold"], ["電気", "electric"],
  ["光", "light"], ["滑る", "friction_reduce"], ["弾む", "bounce"],
  // 間接参照 (exemplar にある → kNN で拾える)
  ["太陽", "heat"], ["北極", "cold"], ["感電", "electric"],
  ["蛍", "light"], ["石鹸", "friction_reduce"], ["トランポリン", "bounce"],
  ["鉛", "mass_heavy"], ["風船", "mass_light"], ["チーター", "speed_fast"], ["カメ", "speed_slow"],
  // 未知表現 (exemplar にない → fine-tuning の汎化力が問われる)
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
  // 負例 (何もヒットしないべき)
  ["こんにちは", ""], ["ありがとう", ""], ["やったー", ""],
  ["もう一回", ""], ["頑張れ", ""], ["了解", ""],
];

async function main() {
  // ---- base model ----
  console.log("Loading base model (sirasagi62/ruri-v3-30m-ONNX, q8)...");
  const baseExtractor = await pipeline("feature-extraction", "sirasagi62/ruri-v3-30m-ONNX", { dtype: "q8" });
  const baseExemplars = await buildExemplars(baseExtractor, "トピック: ");

  // ---- fine-tuned model ----
  const ftDir = join(__dirname, "..", "models", "fine-tuned-ruri-v3-30m-onnx");
  if (!existsSync(join(ftDir, "onnx"))) {
    console.error("Fine-tuned model not found");
    process.exit(1);
  }
  console.log("Loading fine-tuned model (fp32)...");
  const ftExtractor = await pipeline("feature-extraction", ftDir, { dtype: "fp32" });
  const ftExemplars = await buildExemplars(ftExtractor, "トピック: ");

  // ---- 分析 ----
  console.log("\n" + "=".repeat(120));
  console.log("同一条件比較: z=1.5, minGap=0.03, EFFECT_PHRASES exemplar のみ");
  console.log("=".repeat(120));

  // ヘッダー
  console.log(
    "\n" +
    pad("入力", 14) + pad("期待", 16) +
    " │ " + pad("base_top", 10) + pad("base_thr", 10) + pad("base_gap", 10) + pad("base結果", 10) +
    " │ " + pad("ft_top", 10) + pad("ft_thr", 10) + pad("ft_gap", 10) + pad("ft結果", 10) +
    " │ " + "判定"
  );
  console.log("-".repeat(120));

  let baseTp = 0, baseFp = 0, baseFn = 0, baseTn = 0;
  let ftTp = 0, ftFp = 0, ftFn = 0, ftTn = 0;
  let improved: string[] = [];
  let degraded: string[] = [];

  // スコア分布の統計
  let baseMeans: number[] = [], baseStds: number[] = [];
  let ftMeans: number[] = [], ftStds: number[] = [];

  for (const [text, expected] of cases) {
    // base
    const baseEmb = new Float32Array((await baseExtractor(`トピック: ${text}`, { pooling: "mean", normalize: true })).data);
    const baseR = classify(baseEmb, baseExemplars);
    const baseTopEffect = baseR.scores[0].effect;
    const baseTopSim = baseR.scores[0].sim;
    const basePassed = baseR.scores.filter((s) => s.sim > baseR.threshold).map((s) => s.effect);
    const baseHit = expected === "" ? basePassed.length === 0 : basePassed.includes(expected);
    const baseGap = baseTopSim - baseR.threshold;

    // ft
    const ftEmb = new Float32Array((await ftExtractor(`トピック: ${text}`, { pooling: "mean", normalize: true })).data);
    const ftR = classify(ftEmb, ftExemplars);
    const ftTopEffect = ftR.scores[0].effect;
    const ftTopSim = ftR.scores[0].sim;
    const ftPassed = ftR.scores.filter((s) => s.sim > ftR.threshold).map((s) => s.effect);
    const ftHit = expected === "" ? ftPassed.length === 0 : ftPassed.includes(expected);
    const ftGap = ftTopSim - ftR.threshold;

    baseMeans.push(baseR.mean);
    baseStds.push(baseR.std);
    ftMeans.push(ftR.mean);
    ftStds.push(ftR.std);

    // confusion matrix
    if (expected !== "") {
      if (baseHit) baseTp++; else baseFn++;
      if (ftHit) ftTp++; else ftFn++;
    } else {
      if (baseHit) baseTn++; else baseFp++;
      if (ftHit) ftTn++; else ftFp++;
    }

    const verdict = baseHit === ftHit ? (baseHit ? "=o" : "=x") :
      (ftHit && !baseHit ? "+改善" : "-悪化");

    if (ftHit && !baseHit) improved.push(`"${text}" (${expected}): base=[${basePassed}] ft=[${ftPassed}]`);
    if (!ftHit && baseHit) degraded.push(`"${text}" (${expected}): base=[${basePassed}] ft=[${ftPassed}]`);

    const expLabel = expected || "(空)";
    console.log(
      pad(`"${text}"`, 14) + pad(expLabel, 16) +
      " │ " +
      pad(baseTopSim.toFixed(4), 10) + pad(baseR.threshold.toFixed(4), 10) + pad(baseGap.toFixed(4), 10) +
      pad(baseHit ? "o" : "x:" + (basePassed[0] ?? "miss"), 10) +
      " │ " +
      pad(ftTopSim.toFixed(4), 10) + pad(ftR.threshold.toFixed(4), 10) + pad(ftGap.toFixed(4), 10) +
      pad(ftHit ? "o" : "x:" + (ftPassed[0] ?? "miss"), 10) +
      " │ " + verdict
    );
  }

  // ---- サマリー ----
  console.log("\n" + "=".repeat(80));
  console.log("サマリー");
  console.log("=".repeat(80));

  const positiveCases = cases.filter(([, e]) => e !== "").length;
  const negativeCases = cases.filter(([, e]) => e === "").length;
  console.log(`\nPositive ${positiveCases}件:  base TP=${baseTp} FN=${baseFn} → ft TP=${ftTp} FN=${ftFn}`);
  console.log(`Negative ${negativeCases}件:  base TN=${baseTn} FP=${baseFp} → ft TN=${ftTn} FP=${ftFp}`);

  const basePrec = baseTp / (baseTp + baseFp) || 0;
  const baseRec = baseTp / (baseTp + baseFn) || 0;
  const ftPrec = ftTp / (ftTp + ftFp) || 0;
  const ftRec = ftTp / (ftTp + ftFn) || 0;
  console.log(`\nbase: precision=${(basePrec*100).toFixed(1)}% recall=${(baseRec*100).toFixed(1)}% F1=${(2*basePrec*baseRec/(basePrec+baseRec)*100||0).toFixed(1)}%`);
  console.log(`ft:   precision=${(ftPrec*100).toFixed(1)}% recall=${(ftRec*100).toFixed(1)}% F1=${(2*ftPrec*ftRec/(ftPrec+ftRec)*100||0).toFixed(1)}%`);

  // スコア分布
  const avgBaseMean = baseMeans.reduce((a, b) => a + b, 0) / baseMeans.length;
  const avgBaseStd = baseStds.reduce((a, b) => a + b, 0) / baseStds.length;
  const avgFtMean = ftMeans.reduce((a, b) => a + b, 0) / ftMeans.length;
  const avgFtStd = ftStds.reduce((a, b) => a + b, 0) / ftStds.length;
  console.log(`\nスコア分布 (全入力平均):`);
  console.log(`  base: mean=${avgBaseMean.toFixed(4)} std=${avgBaseStd.toFixed(4)}`);
  console.log(`  ft:   mean=${avgFtMean.toFixed(4)} std=${avgFtStd.toFixed(4)}`);

  if (improved.length > 0) {
    console.log(`\n改善 (+${improved.length}件):`);
    for (const s of improved) console.log(`  ${s}`);
  }
  if (degraded.length > 0) {
    console.log(`\n悪化 (-${degraded.length}件):`);
    for (const s of degraded) console.log(`  ${s}`);
  }

  // ---- 最適 z 探索 ----
  console.log("\n" + "=".repeat(80));
  console.log("最適 z 探索: 各モデルで F1 最大の z を求める");
  console.log("=".repeat(80));

  // 各テストケースの embedding を再利用するためキャッシュ
  const baseEmbeddings: Float32Array[] = [];
  const ftEmbeddings: Float32Array[] = [];
  for (const [text] of cases) {
    baseEmbeddings.push(new Float32Array((await baseExtractor(`トピック: ${text}`, { pooling: "mean", normalize: true })).data));
    ftEmbeddings.push(new Float32Array((await ftExtractor(`トピック: ${text}`, { pooling: "mean", normalize: true })).data));
  }

  function evalAtZ(embeddings: Float32Array[], exemplars: Map<string, Exemplar[]>, z: number, minGap: number): { tp: number; fp: number; fn: number; tn: number; prec: number; rec: number; f1: number } {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < cases.length; i++) {
      const [, expected] = cases[i];
      const r = classify(embeddings[i], exemplars);
      const thr = r.mean + Math.max(z * r.std, minGap);
      const passed = r.scores.filter(s => s.sim > thr).map(s => s.effect);
      const hit = expected === "" ? passed.length === 0 : passed.includes(expected);
      if (expected !== "") { if (hit) tp++; else fn++; }
      else { if (hit) tn++; else fp++; }
    }
    const prec = tp / (tp + fp) || 0;
    const rec = tp / (tp + fn) || 0;
    const f1 = 2 * prec * rec / (prec + rec) || 0;
    return { tp, fp, fn, tn, prec, rec, f1 };
  }

  console.log("\n[base model]");
  console.log(pad("z", 8) + pad("minGap", 8) + pad("TP", 6) + pad("FP", 6) + pad("FN", 6) + pad("TN", 6) + pad("Prec", 8) + pad("Rec", 8) + pad("F1", 8));
  let bestBaseF1 = 0, bestBaseZ = 0, bestBaseGap = 0;
  for (const mg of [0.01, 0.02, 0.03, 0.04, 0.05]) {
    for (const z of [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
      const r = evalAtZ(baseEmbeddings, baseExemplars, z, mg);
      if (r.f1 > bestBaseF1) { bestBaseF1 = r.f1; bestBaseZ = z; bestBaseGap = mg; }
      console.log(pad(z.toFixed(1), 8) + pad(mg.toFixed(2), 8) + pad(String(r.tp), 6) + pad(String(r.fp), 6) + pad(String(r.fn), 6) + pad(String(r.tn), 6) + pad((r.prec*100).toFixed(1)+"%", 8) + pad((r.rec*100).toFixed(1)+"%", 8) + pad((r.f1*100).toFixed(1)+"%", 8));
    }
  }
  console.log(`\nbest: z=${bestBaseZ}, minGap=${bestBaseGap} → F1=${(bestBaseF1*100).toFixed(1)}%`);

  console.log("\n[fine-tuned model]");
  console.log(pad("z", 8) + pad("minGap", 8) + pad("TP", 6) + pad("FP", 6) + pad("FN", 6) + pad("TN", 6) + pad("Prec", 8) + pad("Rec", 8) + pad("F1", 8));
  let bestFtF1 = 0, bestFtZ = 0, bestFtGap = 0;
  for (const mg of [0.01, 0.02, 0.03, 0.05, 0.08, 0.10]) {
    for (const z of [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
      const r = evalAtZ(ftEmbeddings, ftExemplars, z, mg);
      if (r.f1 > bestFtF1) { bestFtF1 = r.f1; bestFtZ = z; bestFtGap = mg; }
      console.log(pad(z.toFixed(1), 8) + pad(mg.toFixed(2), 8) + pad(String(r.tp), 6) + pad(String(r.fp), 6) + pad(String(r.fn), 6) + pad(String(r.tn), 6) + pad((r.prec*100).toFixed(1)+"%", 8) + pad((r.rec*100).toFixed(1)+"%", 8) + pad((r.f1*100).toFixed(1)+"%", 8));
    }
  }
  console.log(`\nbest: z=${bestFtZ}, minGap=${bestFtGap} → F1=${(bestFtF1*100).toFixed(1)}%`);

  console.log("\n" + "=".repeat(80));
  console.log("結論: 各モデルの最適パラメータでの比較");
  console.log("=".repeat(80));
  console.log(`base model:      z=${bestBaseZ}, minGap=${bestBaseGap} → F1=${(bestBaseF1*100).toFixed(1)}%`);
  console.log(`fine-tuned model: z=${bestFtZ}, minGap=${bestFtGap} → F1=${(bestFtF1*100).toFixed(1)}%`);
  console.log(`差分: ΔF1=${((bestFtF1 - bestBaseF1)*100).toFixed(1)}pp`);
}

function pad(s: string, n: number): string {
  // 全角文字を2幅でカウント
  let w = 0;
  for (const c of s) w += c.charCodeAt(0) > 0x7f ? 2 : 1;
  return s + " ".repeat(Math.max(0, n - w));
}

main().catch(console.error);
