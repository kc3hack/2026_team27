/**
 * カタカナ語幹変化への汎化テスト
 * exemplar の造語キーワードが、語幹が同じだが
 * カタカナ表記が変化した別造語に対して汎化できるか
 *
 * 例: シャイニング → シャイン, シャイニー
 *     フリーズ → フリージング, フローズン
 *     バーニング → バーン, バーンアウト
 */
import { EffectClassifier } from "../src/effect-classifier.js";
import { EffectType } from "../src/types.js";

// [exemplarに存在する語, 語幹変化した未知語[], 期待属性]
const cases: { exemplar: string; variations: string[]; label: EffectType }[] = [
  // heat系: バーニング(exemplar) → バーン, バーンアウト, バーナー
  {
    exemplar: "バーニング",
    variations: ["バーン", "バーンアウト", "バーナー", "バーンストライク"],
    label: EffectType.HEAT,
  },
  // heat系: インフェルノ(exemplar) → インファナル, インファーノ
  {
    exemplar: "インフェルノ",
    variations: ["インファナル", "インファーノ", "インフェルナル"],
    label: EffectType.HEAT,
  },
  // cold系: フリーズ(exemplar) → フリージング, フローズン, フリーザー
  {
    exemplar: "フリーズ",
    variations: ["フリージング", "フローズン", "フリーザー", "フリージングブラスト"],
    label: EffectType.COLD,
  },
  // cold系: フロストバイト(exemplar) → フロスト, フロスティ, フロステッド
  {
    exemplar: "フロストバイト",
    variations: ["フロスト", "フロスティ", "フロステッド", "フロストブレード"],
    label: EffectType.COLD,
  },
  // electric系: サンダーストーム(exemplar) → サンダラ, サンダガ, サンダリング
  {
    exemplar: "サンダーストーム",
    variations: ["サンダラ", "サンダガ", "サンダリング"],
    label: EffectType.ELECTRIC,
  },
  // electric系: ライトニングボルト(exemplar) → ライトニン, ライトナー
  {
    exemplar: "ライトニングボルト",
    variations: ["ライトニン", "ライトナー", "ライトニングストライク"],
    label: EffectType.ELECTRIC,
  },
  // light系: シャイニングフラッシュ(exemplar) → シャイン, シャイニー, シャインブレード
  {
    exemplar: "シャイニングフラッシュ",
    variations: ["シャイン", "シャイニー", "シャインブレード", "シャインスパーク"],
    label: EffectType.LIGHT,
  },
  // light系: ルミナス(exemplar) → ルミネ, ルミナスブレード, ルミネセンス
  {
    exemplar: "ルミナス",
    variations: ["ルミネ", "ルミネセンス", "ルミナリエ"],
    label: EffectType.LIGHT,
  },
  // speed_fast系: ソニックブーム(exemplar) → ソニカル, ソニッカー
  {
    exemplar: "ソニックブーム",
    variations: ["ソニカル", "ソニッカー", "スーパーソニック"],
    label: EffectType.SPEED_FAST,
  },
  // speed_fast系: ラピッドストライク(exemplar) → ラピッド, ラピダス
  {
    exemplar: "ラピッドストライク",
    variations: ["ラピッド", "ラピダス"],
    label: EffectType.SPEED_FAST,
  },
  // speed_slow系: スロウダウン(exemplar) → スロウ, スロウネス, スローイング
  {
    exemplar: "スロウダウン",
    variations: ["スロウ", "スロウネス", "スローイング"],
    label: EffectType.SPEED_SLOW,
  },
  // mass_heavy系: メガトンハンマー(exemplar) → メガトン, メガトニック
  {
    exemplar: "メガトンハンマー",
    variations: ["メガトン", "メガトニック", "メガトンパンチ"],
    label: EffectType.MASS_HEAVY,
  },
  // mass_light系: レビテーション(exemplar) → レビテート, レビテイト
  {
    exemplar: "レビテーション",
    variations: ["レビテート", "レビテイト", "レビテーティング"],
    label: EffectType.MASS_LIGHT,
  },
];

async function main() {
  console.log("=== カタカナ語幹変化 汎化テスト ===\n");

  const classifier = new EffectClassifier();
  await classifier.initialize();

  let total = 0;
  let hits = 0;

  for (const { exemplar, variations, label } of cases) {
    console.log(`--- ${exemplar} (${label}) ---`);
    // exemplar自体の確認
    const exR = await classifier.classify(exemplar);
    const exHit = exR.effects.some((e) => e.effect === label);
    const exScore = exR.debug.allScores.find((s) => s.effect === label);
    console.log(
      `  [${exHit ? "o" : "x"}] "${exemplar}" (exemplar) score=${exScore?.similarity.toFixed(4)} thr=${exR.debug.threshold.toFixed(4)}`
    );

    for (const v of variations) {
      const r = await classifier.classify(v);
      const hit = r.effects.some((e) => e.effect === label);
      total++;
      if (hit) hits++;
      const score = r.debug.allScores.find((s) => s.effect === label);
      const got = r.effects.map((e) => e.effect);
      console.log(
        `  [${hit ? "o" : "x"}] "${v}" → score=${score?.similarity.toFixed(4)} thr=${r.debug.threshold.toFixed(4)} got=[${got.join(",")}]`
      );
    }
    console.log();
  }

  console.log(`=== 合計: ${hits}/${total} (${(hits / total * 100).toFixed(1)}%) ===`);
}

main().catch(console.error);
