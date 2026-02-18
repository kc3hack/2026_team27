import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { EffectClassifier } from "../src/effect-classifier.js";
import { EffectType } from "../src/types.js";
import { existsSync, readFileSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "training-data.json");
const DATA_BAK = DATA_PATH + ".bak";
const FT_DIR = join(__dirname, "..", "models", "fine-tuned-ruri-v3-30m-onnx");
const FT_BAK = FT_DIR + ".bak";

// テスト中断時に .bak が残っていたら復元
function restoreBackups() {
  if (!existsSync(DATA_PATH) && existsSync(DATA_BAK)) renameSync(DATA_BAK, DATA_PATH);
  if (!existsSync(FT_DIR) && existsSync(FT_BAK)) renameSync(FT_BAK, FT_DIR);
}
restoreBackups();

/** fine-tuned モデルを退避して base model を強制する */
function hideFt(): boolean {
  const has = existsSync(join(FT_DIR, "onnx"));
  if (has) renameSync(FT_DIR, FT_BAK);
  return has;
}
function showFt() { if (existsSync(FT_BAK)) renameSync(FT_BAK, FT_DIR); }

function hideData(): boolean {
  const has = existsSync(DATA_PATH);
  if (has) renameSync(DATA_PATH, DATA_BAK);
  return has;
}
function showData() { if (existsSync(DATA_BAK)) renameSync(DATA_BAK, DATA_PATH); }

// ================================================================
// 検証 1: ruri-v3-30m-ONNX モデル動作確認
//   fine-tuned の有無は問わず、現在のモデル設定で基本機能が動くか
// ================================================================

describe("検証1: モデル動作確認", () => {
  let classifier: EffectClassifier;

  before(async () => {
    classifier = new EffectClassifier();
    await classifier.initialize();
  });

  after(restoreBackups);

  it("classify が 10 属性のスコアを <100ms で返す", async () => {
    const r = await classifier.classify("テスト");
    assert.equal(r.debug.allScores.length, 10);
    assert.ok(r.debug.classifyMs < 100, `${r.debug.classifyMs.toFixed(1)}ms`);
  });

  const directCases: [string, EffectType][] = [
    ["熱い", EffectType.HEAT],
    ["冷たい", EffectType.COLD],
    ["電気", EffectType.ELECTRIC],
    ["光", EffectType.LIGHT],
    ["滑る", EffectType.FRICTION_REDUCE],
    ["弾む", EffectType.BOUNCE],
    ["重い", EffectType.MASS_HEAVY],
    ["軽い", EffectType.MASS_LIGHT],
    ["速い", EffectType.SPEED_FAST],
    ["遅い", EffectType.SPEED_SLOW],
    ["燃えろ", EffectType.HEAT],
    ["凍れ", EffectType.COLD],
    ["ビリビリ", EffectType.ELECTRIC],
    ["ピカピカ光る", EffectType.LIGHT],
    ["ツルツル", EffectType.FRICTION_REDUCE],
    ["ボヨンボヨン", EffectType.BOUNCE],
    ["ずっしり", EffectType.MASS_HEAVY],
    ["ふわふわ", EffectType.MASS_LIGHT],
    ["加速", EffectType.SPEED_FAST],
    ["スロー", EffectType.SPEED_SLOW],
  ];

  for (const [text, expected] of directCases) {
    it(`直接: "${text}" → ${expected}`, async () => {
      const r = await classifier.classify(text);
      const effects = r.effects.map((e) => e.effect);
      assert.ok(effects.includes(expected), `got [${effects}]`);
    });
  }

  const negativeCases = [
    "こんにちは", "ありがとう", "やったー", "もう一回",
    "今日はいい天気", "頑張れ", "すごい", "なるほど", "了解", "おはよう",
  ];

  for (const text of negativeCases) {
    it(`負例: "${text}" → 空`, async () => {
      const r = await classifier.classify(text);
      assert.equal(r.effects.length, 0,
        `[${r.effects.map((e) => e.effect)}] top=${r.debug.allScores[0]?.similarity.toFixed(4)} thr=${r.debug.threshold.toFixed(4)}`);
    });
  }
});

// ================================================================
// 検証 2: 訓練データ品質
// ================================================================

describe("検証2: 訓練データ品質", () => {
  let data: { examples: { text: string; label: string; is_positive: boolean }[] };

  before(() => {
    restoreBackups();
    assert.ok(existsSync(DATA_PATH), `${DATA_PATH} が存在する`);
    data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  });

  it("JSON 構造が正しい", () => {
    assert.ok(Array.isArray(data.examples));
    assert.ok(data.examples.length > 0);
  });

  it("全 10 属性に 20+ positive 例", () => {
    const counts: Record<string, number> = {};
    for (const ex of data.examples) {
      if (!ex.is_positive) continue;
      counts[ex.label] = (counts[ex.label] ?? 0) + 1;
    }
    for (const et of Object.values(EffectType)) {
      assert.ok((counts[et] ?? 0) >= 20, `${et}: ${counts[et] ?? 0}`);
    }
  });

  it("negative 例 10+", () => {
    const neg = data.examples.filter((e) => !e.is_positive);
    assert.ok(neg.length >= 10, `${neg.length}`);
  });

  it("間接参照ワードが含まれる", () => {
    const positives = new Set(data.examples.filter((e) => e.is_positive).map((e) => e.text));
    const indirect = ["太陽", "溶岩", "北極", "吹雪", "感電", "蛍", "スケートリンク", "トランポリン", "鉛", "羽", "チーター", "カメ"];
    const found = indirect.filter((w) => positives.has(w)).length;
    assert.ok(found >= 10, `${found}/${indirect.length}`);
  });
});

// ================================================================
// 検証 3: base model で exemplar 追加の効果
//   fine-tuned モデルを退避し、base model のみで
//   EFFECT_PHRASES だけ vs training-data.json exemplar の差を測定
// ================================================================

describe("検証3: exemplar 追加による分類改善 (base model)", () => {
  const indirectCases: [string, EffectType][] = [
    ["太陽", EffectType.HEAT], ["溶岩", EffectType.HEAT], ["砂漠", EffectType.HEAT],
    ["北極", EffectType.COLD], ["吹雪", EffectType.COLD], ["氷河", EffectType.COLD],
    ["感電", EffectType.ELECTRIC], ["スパーク", EffectType.ELECTRIC],
    ["蛍", EffectType.LIGHT], ["ネオン", EffectType.LIGHT],
    ["スケートリンク", EffectType.FRICTION_REDUCE], ["石鹸", EffectType.FRICTION_REDUCE],
    ["トランポリン", EffectType.BOUNCE], ["ゴムボール", EffectType.BOUNCE],
    ["鉛", EffectType.MASS_HEAVY], ["鋼鉄", EffectType.MASS_HEAVY],
    ["羽", EffectType.MASS_LIGHT], ["風船", EffectType.MASS_LIGHT],
    ["チーター", EffectType.SPEED_FAST], ["弾丸", EffectType.SPEED_FAST],
    ["カメ", EffectType.SPEED_SLOW], ["粘液", EffectType.SPEED_SLOW],
  ];

  const metaphorCases: [string, EffectType][] = [
    ["メラメラ", EffectType.HEAT], ["カチコチ", EffectType.COLD],
    ["バチバチ", EffectType.ELECTRIC], ["キラキラ", EffectType.LIGHT],
    ["ヌルヌル", EffectType.FRICTION_REDUCE], ["ポヨンポヨン", EffectType.BOUNCE],
    ["ドスン", EffectType.MASS_HEAVY], ["フワリ", EffectType.MASS_LIGHT],
    ["ビュン", EffectType.SPEED_FAST], ["ノロノロ", EffectType.SPEED_SLOW],
  ];

  let baseHits: number;
  let enhHits: number;

  before(async () => {
    restoreBackups();
    // fine-tuned を退避 → base model のみで比較
    hideFt();

    // A: EFFECT_PHRASES のみ
    hideData();
    const baseCls = new EffectClassifier();
    await baseCls.initialize();
    baseHits = 0;
    for (const [t, exp] of [...indirectCases, ...metaphorCases]) {
      const r = await baseCls.classify(t);
      if (r.effects.some((e) => e.effect === exp)) baseHits++;
    }

    // B: training-data exemplar 込み
    showData();
    const enhCls = new EffectClassifier();
    await enhCls.initialize();
    enhHits = 0;
    for (const [t, exp] of [...indirectCases, ...metaphorCases]) {
      const r = await enhCls.classify(t);
      if (r.effects.some((e) => e.effect === exp)) enhHits++;
    }

    showFt();
  });

  after(restoreBackups);

  it("exemplar 追加で recall が向上", () => {
    const total = indirectCases.length + metaphorCases.length;
    console.log(`    recall: ${baseHits}/${total} → ${enhHits}/${total} (Δ=+${enhHits - baseHits})`);
    assert.ok(enhHits > baseHits, `${baseHits} → ${enhHits}`);
  });
});

// ================================================================
// 検証 4: fine-tuned モデルの汎化性能
//   訓練データにも EFFECT_PHRASES にもない未知表現で
//   base model vs fine-tuned model を比較
// ================================================================

describe("検証4: fine-tuned モデル汎化性能", () => {
  const unseenCases: [string, EffectType][] = [
    ["焦げる", EffectType.HEAT], ["窯", EffectType.HEAT], ["火炎放射", EffectType.HEAT],
    ["霜柱", EffectType.COLD], ["冷房", EffectType.COLD], ["かき氷", EffectType.COLD],
    ["電池", EffectType.ELECTRIC], ["ショート", EffectType.ELECTRIC],
    ["照明", EffectType.LIGHT], ["フラッシュ", EffectType.LIGHT],
    ["ローション", EffectType.FRICTION_REDUCE], ["アイスバーン", EffectType.FRICTION_REDUCE],
    ["弾性", EffectType.BOUNCE], ["反動", EffectType.BOUNCE],
    ["錨", EffectType.MASS_HEAVY], ["砲丸", EffectType.MASS_HEAVY],
    ["綿毛", EffectType.MASS_LIGHT], ["泡", EffectType.MASS_LIGHT],
    ["俊敏", EffectType.SPEED_FAST], ["韋駄天", EffectType.SPEED_FAST],
    ["牛歩", EffectType.SPEED_SLOW], ["鈍い", EffectType.SPEED_SLOW],
  ];

  const hasFinetuned = existsSync(join(FT_DIR, "onnx"));
  let baseHits: number;
  let ftHits: number;
  let details: string[] = [];

  before(async () => {
    if (!hasFinetuned) return;
    restoreBackups();

    // base model (EFFECT_PHRASES のみ、training-data なし)
    hideFt();
    hideData();
    const baseCls = new EffectClassifier();
    await baseCls.initialize();
    baseHits = 0;
    for (const [t, exp] of unseenCases) {
      const r = await baseCls.classify(t);
      const hit = r.effects.some((e) => e.effect === exp);
      if (hit) baseHits++;
      details.push(`"${t}" (${exp}): base=${hit ? "o" : "x"}`);
    }
    showData();
    showFt();

    // fine-tuned model (EFFECT_PHRASES のみ — exemplar 追加なし)
    hideData();
    const ftCls = new EffectClassifier();
    await ftCls.initialize();
    ftHits = 0;
    for (let i = 0; i < unseenCases.length; i++) {
      const [t, exp] = unseenCases[i];
      const r = await ftCls.classify(t);
      const hit = r.effects.some((e) => e.effect === exp);
      if (hit) ftHits++;
      details[i] += ` ft=${hit ? "o" : "x"}`;
    }
    showData();
  });

  after(restoreBackups);

  it("fine-tuned モデルが存在する", () => {
    assert.ok(hasFinetuned, "onnx/ ディレクトリ必要");
  });

  it("未知表現の recall 比較", { skip: !hasFinetuned }, () => {
    const n = unseenCases.length;
    console.log(`    base: ${baseHits}/${n} (${(baseHits / n * 100).toFixed(1)}%) → ft: ${ftHits}/${n} (${(ftHits / n * 100).toFixed(1)}%)`);
    for (const d of details) console.log(`    ${d}`);
    assert.ok(ftHits >= baseHits, `ft(${ftHits}) >= base(${baseHits})`);
  });
});
