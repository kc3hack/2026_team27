/**
 * カタカナ造語の分類テスト
 * 学習データに含まれていない未知のカタカナ造語で、
 * fine-tuned モデルの汎化性能を確認する
 */
import { EffectClassifier } from "../src/effect-classifier.js";
import { EffectType } from "../src/types.js";

// --- 学習データに含まれている造語 (sanity check) ---
const trainedCases: [string, EffectType][] = [
  ["フレイムバースト", EffectType.HEAT],
  ["エクスプロージョン", EffectType.HEAT],
  ["エターナルフォースブリザード", EffectType.COLD],
  ["ダイヤモンドダスト", EffectType.COLD],
  ["ライトニングボルト", EffectType.ELECTRIC],
  ["プラズマバースト", EffectType.ELECTRIC],
  ["ホーリーライト", EffectType.LIGHT],
  ["ソーラービーム", EffectType.LIGHT],
  ["ゼロフリクション", EffectType.FRICTION_REDUCE],
  ["スプリングバウンド", EffectType.BOUNCE],
  ["グラビティプレス", EffectType.MASS_HEAVY],
  ["メガトンハンマー", EffectType.MASS_HEAVY],
  ["ゼログラビティ", EffectType.MASS_LIGHT],
  ["フェザーフロート", EffectType.MASS_LIGHT],
  ["ソニックブーム", EffectType.SPEED_FAST],
  ["マッハスピード", EffectType.SPEED_FAST],
  ["タイムフリーズ", EffectType.SPEED_SLOW],
  ["グラビティバインド", EffectType.SPEED_SLOW],
];

// --- 学習データに含まれていない未知のカタカナ造語 ---
const unseenCases: [string, EffectType][] = [
  // heat
  ["メテオストライク", EffectType.HEAT],
  ["ファイアストーム", EffectType.HEAT],
  ["イグニッション", EffectType.HEAT],
  ["フェニックスフレア", EffectType.HEAT],
  ["バーストフレイム", EffectType.HEAT],
  // cold
  ["アイスコフィン", EffectType.COLD],
  ["フリージングブレス", EffectType.COLD],
  ["グレイシャルスパイク", EffectType.COLD],
  ["コールドスナップ", EffectType.COLD],
  ["アイスブレイカー", EffectType.COLD],
  // electric
  ["エレキバースト", EffectType.ELECTRIC],
  ["サンダーブレード", EffectType.ELECTRIC],
  ["スパークショット", EffectType.ELECTRIC],
  ["ヴォルトチャージ", EffectType.ELECTRIC],
  ["ライジングサンダー", EffectType.ELECTRIC],
  // light
  ["レイディアントバースト", EffectType.LIGHT],
  ["フラッシュインパクト", EffectType.LIGHT],
  ["セイクリッドライト", EffectType.LIGHT],
  ["シャインスパーク", EffectType.LIGHT],
  ["ルミナスフレア", EffectType.LIGHT],
  // friction_reduce
  ["スライディングフロア", EffectType.FRICTION_REDUCE],
  ["グリースショット", EffectType.FRICTION_REDUCE],
  // bounce
  ["バウンスアタック", EffectType.BOUNCE],
  ["スプリングフォース", EffectType.BOUNCE],
  // mass_heavy
  ["アイアンプレス", EffectType.MASS_HEAVY],
  ["クラッシュインパクト", EffectType.MASS_HEAVY],
  ["ヘヴィグラビトン", EffectType.MASS_HEAVY],
  // mass_light
  ["エアリアルリフト", EffectType.MASS_LIGHT],
  ["ウェイトレスフロート", EffectType.MASS_LIGHT],
  // speed_fast
  ["ライトニングダッシュ", EffectType.SPEED_FAST],
  ["ブリッツアタック", EffectType.SPEED_FAST],
  ["クイックステップ", EffectType.SPEED_FAST],
  // speed_slow
  ["フリーズバインド", EffectType.SPEED_SLOW],
  ["スローモーションフィールド", EffectType.SPEED_SLOW],
];

async function main() {
  console.log("=== カタカナ造語 分類テスト ===\n");

  const classifier = new EffectClassifier();
  await classifier.initialize();

  // --- 学習データに含まれている造語 ---
  console.log("\n--- 学習データに含まれている造語 (sanity check) ---");
  let trainedHits = 0;
  for (const [text, expected] of trainedCases) {
    const r = await classifier.classify(text);
    const effects = r.effects.map((e) => e.effect);
    const hit = effects.includes(expected);
    if (hit) trainedHits++;
    const topScore = r.debug.allScores.find((s) => s.effect === expected);
    const mark = hit ? "o" : "x";
    console.log(
      `  [${mark}] "${text}" → expected=${expected}, got=[${effects.join(",")}] score=${topScore?.similarity.toFixed(4)} thr=${r.debug.threshold.toFixed(4)}`
    );
  }
  console.log(`  Result: ${trainedHits}/${trainedCases.length} (${(trainedHits / trainedCases.length * 100).toFixed(1)}%)`);

  // --- 学習データに含まれていない未知造語 ---
  console.log("\n--- 学習データに含まれていない未知造語 ---");
  let unseenHits = 0;
  const byLabel: Record<string, { total: number; hits: number }> = {};
  for (const [text, expected] of unseenCases) {
    const r = await classifier.classify(text);
    const effects = r.effects.map((e) => e.effect);
    const hit = effects.includes(expected);
    if (hit) unseenHits++;
    if (!byLabel[expected]) byLabel[expected] = { total: 0, hits: 0 };
    byLabel[expected].total++;
    if (hit) byLabel[expected].hits++;
    const topScore = r.debug.allScores.find((s) => s.effect === expected);
    const mark = hit ? "o" : "x";
    console.log(
      `  [${mark}] "${text}" → expected=${expected}, got=[${effects.join(",")}] score=${topScore?.similarity.toFixed(4)} thr=${r.debug.threshold.toFixed(4)}`
    );
  }
  console.log(`  Result: ${unseenHits}/${unseenCases.length} (${(unseenHits / unseenCases.length * 100).toFixed(1)}%)`);

  console.log("\n--- 属性別 ---");
  for (const [label, stats] of Object.entries(byLabel).sort()) {
    console.log(`  ${label}: ${stats.hits}/${stats.total}`);
  }

  console.log("\n=== 完了 ===");
}

main().catch(console.error);
