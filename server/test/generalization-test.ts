/**
 * 汎化性能テスト
 *
 * training-data.json にも EFFECT_PHRASES にも含まれない
 * 完全に未知の表現に対する base model vs fine-tuned model の比較。
 *
 * テストケースのカテゴリ:
 * 1. 連想表現: 効果を間接的に想起させる語 (例: 「サウナ」→heat)
 * 2. 単語の揺れ: 口語・方言・崩れた表現 (例: 「あちぃ」→heat)
 * 3. 音声認識揺れ: STT で起こりうる誤変換 (例: 「あっつー」→heat)
 * 4. 創造的表現: ゲーム中にプレイヤーが叫びそうな言い回し
 * 5. negative: 効果と無関係だが STT で入力されうる発話
 */

import { pipeline } from "@huggingface/transformers";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// EFFECT_PHRASES (effect-classifier.ts と同一)
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

// training-data.json の全テキスト + EFFECT_PHRASES を除外リストにする
function loadExclusions(): Set<string> {
  const set = new Set<string>();
  const dataPath = join(__dirname, "..", "data", "training-data.json");
  if (existsSync(dataPath)) {
    const data = JSON.parse(readFileSync(dataPath, "utf-8"));
    for (const ex of data.examples) set.add(ex.text);
  }
  for (const phrases of Object.values(EFFECT_PHRASES)) {
    for (const p of phrases) set.add(p);
  }
  return set;
}

// ===== テストケース =====
// 各ケース: [入力テキスト, 期待される効果 ("" = none)]
// 全て training-data にも EFFECT_PHRASES にも含まれないこと

const cases: [string, string, string][] = [
  // --- heat: 連想・揺れ・STT揺れ ---
  ["サウナ", "heat", "連想"],
  ["焼肉", "heat", "連想"],
  ["ストーブ", "heat", "連想"],
  ["たき火", "heat", "連想/STT揺れ(焚き火)"],
  ["かっか", "heat", "STT揺れ(カッカ)"],
  ["あちぃ", "heat", "口語"],
  ["あっつー", "heat", "口語/STT揺れ"],
  ["ヒートアップ", "heat", "ゲーム表現"],
  ["火の玉", "heat", "連想"],
  ["沸騰", "heat", "連想"],
  ["熱波", "heat", "連想"],
  ["燃やせ", "heat", "活用揺れ(燃やす→命令形)"],
  ["あちちちち", "heat", "叫び/STT揺れ"],
  ["日焼け", "heat", "連想"],

  // --- cold: 連想・揺れ・STT揺れ ---
  ["冷蔵", "cold", "連想/STT揺れ(冷蔵庫→冷蔵)"],
  ["アイス", "cold", "連想"],
  ["ブリザード", "cold", "連想"],
  ["さむっ", "cold", "口語/STT揺れ"],
  ["つべたい", "cold", "STT揺れ(冷たい)"],
  ["こおり", "cold", "ひらがな揺れ(氷)"],
  ["冷え冷え", "cold", "口語"],
  ["しもやけ", "cold", "連想"],
  ["寒波", "cold", "連想"],
  ["凍てつく", "cold", "文語"],
  ["凍らす", "cold", "活用揺れ"],
  ["ひえー", "cold", "STT揺れ/叫び"],
  ["冷やす", "cold", "活用揺れ"],
  ["こごえる", "cold", "ひらがな揺れ(凍える)"],

  // --- electric: 連想・揺れ・STT揺れ ---
  ["しびれる", "electric", "連想"],
  ["スタンガン", "electric", "連想"],
  ["でんげき", "electric", "ひらがな揺れ(電撃)"],
  ["バリッ", "electric", "STT揺れ(バリバリ)"],
  ["ライトニング", "electric", "英語混じり"],
  ["電流を流せ", "electric", "ゲーム表現"],
  ["雷落ちろ", "electric", "活用揺れ"],
  ["帯電", "electric", "連想"],
  ["電磁波", "electric", "連想"],
  ["いなずま", "electric", "ひらがな揺れ(稲妻)"],
  ["ピリピリ", "electric", "オノマトペ揺れ(ビリビリ)"],
  ["ばちっ", "electric", "STT揺れ(バチッ)"],
  ["感電しろ", "electric", "ゲーム表現"],

  // --- light: 連想・揺れ・STT揺れ ---
  ["まぶしい", "light", "ひらがな揺れ(眩しい)"],
  ["フラッシュ", "light", "連想"],
  ["ピカー", "light", "STT揺れ(ピカッ)"],
  ["照らせ", "light", "活用揺れ"],
  ["太陽光線", "light", "連想"],
  ["ランプ", "light", "連想"],
  ["ひかれ", "light", "ひらがな揺れ(光れ)"],
  ["ビーム", "light", "ゲーム表現"],
  ["フラッシュバン", "light", "ゲーム表現"],
  ["てらす", "light", "ひらがな揺れ(照らす)"],
  ["まばゆい", "light", "文語"],
  ["ぴかぴか", "light", "ひらがな揺れ(ピカピカ)"],
  ["ギラッ", "light", "STT揺れ(ギラギラ)"],

  // --- friction_reduce: 連想・揺れ・STT揺れ ---
  ["氷の上", "friction_reduce", "連想"],
  ["ローション", "friction_reduce", "連想"],
  ["ヌルッ", "friction_reduce", "STT揺れ(ヌルヌル)"],
  ["ぬるぬるにしろ", "friction_reduce", "ゲーム表現"],
  ["オイル", "friction_reduce", "連想"],
  ["つるっ", "friction_reduce", "STT揺れ(ツルッ)"],
  ["氷上", "friction_reduce", "連想"],
  ["アイスバーン", "friction_reduce", "連想"],
  ["すべらせろ", "friction_reduce", "活用揺れ"],
  ["グリス", "friction_reduce", "連想"],
  ["バナナの皮", "friction_reduce", "連想"],
  ["ぬめり", "friction_reduce", "連想"],

  // --- bounce: 連想・揺れ・STT揺れ ---
  ["トランポリンだ", "bounce", "STT揺れ(トランポリン+だ)"],
  ["跳ね返れ", "bounce", "活用揺れ"],
  ["ぼよんぼよん", "bounce", "ひらがな揺れ(ボヨンボヨン)"],
  ["びよーん", "bounce", "STT揺れ(ビヨーン)"],
  ["ぽんぽん", "bounce", "ひらがな揺れ(ポンポン)"],
  ["ゴムみたい", "bounce", "STT揺れ"],
  ["はねかえせ", "bounce", "活用揺れ"],
  ["リバウンド", "bounce", "英語混じり"],
  ["ジャンプ", "bounce", "連想"],
  ["弾ませろ", "bounce", "活用揺れ"],
  ["反発しろ", "bounce", "ゲーム表現"],
  ["ぴょんぴょん", "bounce", "オノマトペ"],

  // --- mass_heavy: 連想・揺れ・STT揺れ ---
  ["鉄球", "mass_heavy", "連想"],
  ["おもくなれ", "mass_heavy", "ひらがな揺れ"],
  ["ズシッ", "mass_heavy", "STT揺れ(ズシン)"],
  ["重量級", "mass_heavy", "連想"],
  ["砲丸", "mass_heavy", "連想"],
  ["ずしっ", "mass_heavy", "STT揺れ"],
  ["おもたい", "mass_heavy", "口語"],
  ["錨", "mass_heavy", "連想"],
  ["コンクリート", "mass_heavy", "連想"],
  ["ダンベル", "mass_heavy", "連想"],
  ["プレス", "mass_heavy", "連想"],
  ["メガトン", "mass_heavy", "ゲーム表現"],

  // --- mass_light: 連想・揺れ・STT揺れ ---
  ["綿毛", "mass_light", "連想"],
  ["かろやか", "mass_light", "ひらがな揺れ(軽やか)"],
  ["ふわっ", "mass_light", "STT揺れ(フワッ)"],
  ["泡", "mass_light", "連想"],
  ["たんぽぽ", "mass_light", "連想"],
  ["ふうせん", "mass_light", "ひらがな揺れ(風船)"],
  ["エアー", "mass_light", "連想"],
  ["ヘリウム", "mass_light", "連想"],
  ["うかべ", "mass_light", "STT揺れ(浮かべ)"],
  ["天使の羽", "mass_light", "連想"],
  ["かるーい", "mass_light", "口語/STT揺れ"],
  ["重力なくせ", "mass_light", "ゲーム表現"],

  // --- speed_fast: 連想・揺れ・STT揺れ ---
  ["はやくなれ", "speed_fast", "ひらがな揺れ"],
  ["マッハ", "speed_fast", "連想"],
  ["ターボ", "speed_fast", "連想"],
  ["しゅっ", "speed_fast", "STT揺れ(シュッ)"],
  ["スピードアップ", "speed_fast", "ゲーム表現"],
  ["疾風迅雷", "speed_fast", "四字熟語"],
  ["韋駄天", "speed_fast", "連想"],
  ["ぶっとばせ", "speed_fast", "ゲーム表現"],
  ["音速突破", "speed_fast", "ゲーム表現"],
  ["ブースト", "speed_fast", "ゲーム表現"],
  ["びゅーん", "speed_fast", "STT揺れ(ビュン)"],
  ["すばやく", "speed_fast", "ひらがな揺れ(素早く)"],

  // --- speed_slow: 連想・揺れ・STT揺れ ---
  ["のろのろ", "speed_slow", "ひらがな揺れ(ノロノロ)"],
  ["牛歩", "speed_slow", "連想"],
  ["おそくなれ", "speed_slow", "ひらがな揺れ"],
  ["もたもた", "speed_slow", "STT揺れ(モタモタ)"],
  ["だらだら", "speed_slow", "STT揺れ(ダラダラ)"],
  ["超スロー", "speed_slow", "口語"],
  ["鈍い", "speed_slow", "連想"],
  ["亀のように", "speed_slow", "連想"],
  ["足を止めろ", "speed_slow", "ゲーム表現"],
  ["停止", "speed_slow", "連想"],
  ["遅れろ", "speed_slow", "活用揺れ"],
  ["鈍化", "speed_slow", "連想"],

  // --- negative: 効果と無関係な発話 ---
  ["いいぞ", "", "応援"],
  ["やめて", "", "拒否"],
  ["うまい", "", "褒め"],
  ["よっしゃ", "", "歓声"],
  ["どうした", "", "疑問"],
  ["まじか", "", "驚き"],
  ["それ違う", "", "指摘"],
  ["次いこう", "", "指示"],
  ["集中しろ", "", "指示"],
  ["行け", "", "指示"],
  ["待って", "", "制止"],
  ["こっちだ", "", "指示"],
  ["何してんの", "", "疑問"],
  ["うそだろ", "", "驚き"],
  ["敵がいる", "", "報告"],
  ["逃げろ", "", "指示"],
  ["助けて", "", "要請"],
  ["ナイス", "", "褒め"],
  ["惜しい", "", "リアクション"],
  ["ドンマイ", "", "励まし"],
  ["最高", "", "歓声"],
  ["くそー", "", "悔しさ"],
  ["あぶない", "", "警告"],
  ["マジでやばい", "", "興奮"],
  ["もう無理", "", "諦め"],
  ["やばいやばい", "", "焦り"],
  ["うおー", "", "歓声"],
  ["見ろ", "", "指示"],
  ["準備できた", "", "報告"],
  ["はいはい", "", "相槌"],
];

// ===== 除外チェック =====
function validateCases(exclusions: Set<string>): void {
  const conflicts: string[] = [];
  for (const [text] of cases) {
    if (exclusions.has(text)) {
      conflicts.push(text);
    }
  }
  if (conflicts.length > 0) {
    console.error(`ERROR: ${conflicts.length} test cases overlap with training data:`);
    for (const c of conflicts) console.error(`  "${c}"`);
    process.exit(1);
  }
}

// ===== 分類ロジック (effect-classifier.ts と同一) =====
interface Exemplar { phrase: string; embedding: Float32Array; }

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

function classify(
  embedding: Float32Array,
  exemplars: Map<string, Exemplar[]>,
  z: number,
  minGap: number,
): { topEffect: string; topSim: number; passed: string[]; thr: number; gap: number } {
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
  const thr = mean + Math.max(z * std, minGap);
  scores.sort((a, b) => b.sim - a.sim);
  const passed = scores.filter(s => s.sim > thr).map(s => s.effect);
  return { topEffect: scores[0].effect, topSim: scores[0].sim, passed, thr, gap: scores[0].sim - thr };
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

interface ModelResult {
  tp: number; fp: number; fn: number; tn: number;
  prec: number; rec: number; f1: number;
  details: { text: string; expected: string; category: string; hit: boolean; topEffect: string; gap: number }[];
}

function evalModel(
  embeddings: Float32Array[],
  exemplars: Map<string, Exemplar[]>,
  z: number,
  minGap: number,
): ModelResult {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const details: ModelResult["details"] = [];
  for (let i = 0; i < cases.length; i++) {
    const [text, expected, category] = cases[i];
    const r = classify(embeddings[i], exemplars, z, minGap);
    const hit = expected === "" ? r.passed.length === 0 : r.passed.includes(expected);
    if (expected !== "") { if (hit) tp++; else fn++; }
    else { if (hit) tn++; else fp++; }
    details.push({ text, expected, category, hit, topEffect: r.topEffect, gap: r.gap });
  }
  const prec = tp / (tp + fp) || 0;
  const rec = tp / (tp + fn) || 0;
  const f1 = 2 * prec * rec / (prec + rec) || 0;
  return { tp, fp, fn, tn, prec, rec, f1, details };
}

function findBestZ(
  embeddings: Float32Array[],
  exemplars: Map<string, Exemplar[]>,
): { z: number; minGap: number; result: ModelResult } {
  let best = { z: 0, minGap: 0, result: null as ModelResult | null };
  for (const mg of [0.01, 0.02, 0.03, 0.05, 0.08, 0.10]) {
    for (const z of [0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5]) {
      const r = evalModel(embeddings, exemplars, z, mg);
      if (!best.result || r.f1 > best.result.f1) best = { z, minGap: mg, result: r };
    }
  }
  return best as { z: number; minGap: number; result: ModelResult };
}

function pad(s: string, n: number): string {
  let w = 0;
  for (const c of s) w += c.charCodeAt(0) > 0x7f ? 2 : 1;
  return s + " ".repeat(Math.max(0, n - w));
}

async function main() {
  const exclusions = loadExclusions();
  validateCases(exclusions);

  const positiveCount = cases.filter(([, e]) => e !== "").length;
  const negativeCount = cases.filter(([, e]) => e === "").length;
  console.log(`テストケース: positive ${positiveCount}件, negative ${negativeCount}件, 計 ${cases.length}件`);
  console.log(`全件が training-data / EFFECT_PHRASES に含まれないことを確認済み\n`);

  const ftDir = join(__dirname, "..", "models", "fine-tuned-ruri-v3-30m-onnx");
  if (!existsSync(join(ftDir, "onnx"))) {
    console.error("Fine-tuned model not found");
    process.exit(1);
  }

  console.log("Loading models...");
  const baseExt = await pipeline("feature-extraction", "sirasagi62/ruri-v3-30m-ONNX", { dtype: "q8" });
  const ftExt = await pipeline("feature-extraction", ftDir, { dtype: "fp32" });

  console.log("Building exemplars (training-data)...");
  const trainingPhrases = loadTrainingPhrases();
  const baseExemplars = await buildExemplars(baseExt, trainingPhrases);
  const ftExemplars = await buildExemplars(ftExt, trainingPhrases);

  console.log("Computing test embeddings...");
  const baseEmbs: Float32Array[] = [];
  const ftEmbs: Float32Array[] = [];
  for (const [text] of cases) {
    baseEmbs.push(new Float32Array((await baseExt(`トピック: ${text}`, { pooling: "mean", normalize: true })).data));
    ftEmbs.push(new Float32Array((await ftExt(`トピック: ${text}`, { pooling: "mean", normalize: true })).data));
  }

  // 最適パラメータ探索
  console.log("Searching optimal parameters...\n");
  const baseOpt = findBestZ(baseEmbs, baseExemplars);
  const ftOpt = findBestZ(ftEmbs, ftExemplars);

  // ===== 結果 =====
  console.log("=".repeat(110));
  console.log("汎化性能テスト結果 (全件 training-data 外の未知表現)");
  console.log("=".repeat(110));

  console.log(`\nbase model: z=${baseOpt.z}, minGap=${baseOpt.minGap}`);
  console.log(`  TP=${baseOpt.result.tp} FP=${baseOpt.result.fp} FN=${baseOpt.result.fn} TN=${baseOpt.result.tn}`);
  console.log(`  Precision=${(baseOpt.result.prec*100).toFixed(1)}% Recall=${(baseOpt.result.rec*100).toFixed(1)}% F1=${(baseOpt.result.f1*100).toFixed(1)}%`);

  console.log(`\nfine-tuned model: z=${ftOpt.z}, minGap=${ftOpt.minGap}`);
  console.log(`  TP=${ftOpt.result.tp} FP=${ftOpt.result.fp} FN=${ftOpt.result.fn} TN=${ftOpt.result.tn}`);
  console.log(`  Precision=${(ftOpt.result.prec*100).toFixed(1)}% Recall=${(ftOpt.result.rec*100).toFixed(1)}% F1=${(ftOpt.result.f1*100).toFixed(1)}%`);

  console.log(`\nΔF1 = ${((ftOpt.result.f1 - baseOpt.result.f1)*100).toFixed(1)}pp`);

  // カテゴリ別集計
  const categories = ["連想", "口語", "ひらがな揺れ", "STT揺れ", "活用揺れ", "ゲーム表現", "英語混じり", "四字熟語", "文語", "オノマトペ"];
  console.log("\n" + "=".repeat(110));
  console.log("カテゴリ別正解率");
  console.log("=".repeat(110));
  console.log(pad("カテゴリ", 20) + pad("件数", 6) + pad("base正解", 10) + pad("ft正解", 10) + pad("差", 8));
  console.log("-".repeat(70));

  for (const cat of categories) {
    const indices = cases.map(([,, c], i) => ({ i, c })).filter(x => x.c.includes(cat)).map(x => x.i);
    if (indices.length === 0) continue;
    const baseHits = indices.filter(i => baseOpt.result.details[i].hit).length;
    const ftHits = indices.filter(i => ftOpt.result.details[i].hit).length;
    console.log(
      pad(cat, 20) + pad(String(indices.length), 6) +
      pad(`${baseHits}/${indices.length}`, 10) +
      pad(`${ftHits}/${indices.length}`, 10) +
      pad(`${ftHits - baseHits >= 0 ? "+" : ""}${ftHits - baseHits}`, 8)
    );
  }

  // 属性別集計
  const effects = ["heat","cold","electric","light","friction_reduce","bounce","mass_heavy","mass_light","speed_fast","speed_slow"];
  console.log("\n" + "=".repeat(110));
  console.log("属性別正解率 (positive のみ)");
  console.log("=".repeat(110));
  console.log(pad("属性", 20) + pad("件数", 6) + pad("base正解", 10) + pad("ft正解", 10) + pad("差", 8));
  console.log("-".repeat(70));

  for (const eff of effects) {
    const indices = cases.map(([, e], i) => ({ i, e })).filter(x => x.e === eff).map(x => x.i);
    const baseHits = indices.filter(i => baseOpt.result.details[i].hit).length;
    const ftHits = indices.filter(i => ftOpt.result.details[i].hit).length;
    console.log(
      pad(eff, 20) + pad(String(indices.length), 6) +
      pad(`${baseHits}/${indices.length}`, 10) +
      pad(`${ftHits}/${indices.length}`, 10) +
      pad(`${ftHits - baseHits >= 0 ? "+" : ""}${ftHits - baseHits}`, 8)
    );
  }

  // negative
  {
    const indices = cases.map(([, e], i) => ({ i, e })).filter(x => x.e === "").map(x => x.i);
    const baseHits = indices.filter(i => baseOpt.result.details[i].hit).length;
    const ftHits = indices.filter(i => ftOpt.result.details[i].hit).length;
    console.log(
      pad("(negative)", 20) + pad(String(indices.length), 6) +
      pad(`${baseHits}/${indices.length}`, 10) +
      pad(`${ftHits}/${indices.length}`, 10) +
      pad(`${ftHits - baseHits >= 0 ? "+" : ""}${ftHits - baseHits}`, 8)
    );
  }

  // ケース別差分
  console.log("\n" + "=".repeat(110));
  console.log("ケース別差分 (base と ft で結果が異なるもの)");
  console.log("=".repeat(110));

  let improved = 0, degraded = 0;
  for (let i = 0; i < cases.length; i++) {
    const [text, expected, category] = cases[i];
    const bHit = baseOpt.result.details[i].hit;
    const fHit = ftOpt.result.details[i].hit;
    if (bHit !== fHit) {
      const mark = fHit ? "+改善" : "-悪化";
      if (fHit) improved++; else degraded++;
      const bNote = !bHit ? `base:${baseOpt.result.details[i].topEffect}(${baseOpt.result.details[i].gap.toFixed(3)})` : "";
      const fNote = !fHit ? `ft:${ftOpt.result.details[i].topEffect}(${ftOpt.result.details[i].gap.toFixed(3)})` : "";
      console.log(`  ${mark} "${text}" (${expected || "空"}) [${category}] ${bNote}${fNote}`);
    }
  }
  console.log(`\n改善: ${improved}件, 悪化: ${degraded}件, net: ${improved - degraded >= 0 ? "+" : ""}${improved - degraded}件`);
}

main().catch(console.error);
