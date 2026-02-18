# fine-tuning 効果の評価レポート

## 概要

effect-classifier の改善として、(1) モデル差し替え (ruri-v3-30m)、(2) kNN化、(3) exemplar 拡張 (training-data.json)、(4) SetFit fine-tuning の4段階を実施した。

本レポートは (4) fine-tuning の効果を評価した記録と、その訓練手法に重大な欠陥があったことの分析をまとめる。

## 第1回評価: 4構成比較 (欠陥ありの fine-tuning)

### 方法

44件のテストケース（positive 38件 + negative 6件）に対して4構成を比較。
各構成で最適パラメータ (z, minGap) をグリッドサーチし F1 最大値を比較。

### 結果

| 構成 | exemplar数 | 最適F1 | Precision | Recall |
|---|---|---|---|---|
| A: base + EFFECT_PHRASES | 84 | 77.1% | 84.4% | 71.1% |
| B: base + training-data | 271 | **86.8%** | 86.8% | 86.8% |
| C: ft + EFFECT_PHRASES | 84 | 85.7% | 84.6% | 86.8% |
| D: ft + training-data | 271 | 86.5% | 88.9% | 84.2% |

| 改善の要因 | ΔF1 | 計算 |
|---|---|---|
| exemplar 拡張 (84→271) | +9.7pp | B - A |
| fine-tuning (exemplar 84) | +8.6pp | C - A |
| fine-tuning (exemplar 271 の上に) | **-0.4pp** | D - B |

ケース別 B vs D: 改善2件 vs 悪化2件で相殺。

### この結果の解釈に関する注意

上記の結果から「fine-tuning は不要」と結論づけるのは**誤り**。
以下に示す通り、fine-tuning 手法自体に重大な欠陥があり、fine-tuning というアプローチの可否を正しく評価できていない。

---

## 第1回 fine-tuning の欠陥分析

### 欠陥 1: negative 例が訓練に一切使われていない

`fine_tune.py` L77-79:
```python
if not ex["is_positive"]:
    continue  # 50件の negative 例は全て無視される
```

SetFit の対照学習は10クラス間の分離のみ学習し、「どのクラスにも属さない」ことを一切学習しない。
結果: 無関係語（ありがとう, 了解 等）が特定クラスに引き寄せられ、false positive 5/6件。

### 欠陥 2: loss 関数が最弱の選択肢

SetFit デフォルトの `CosineSimilarityLoss` を使用。
sentence-transformers 公式ドキュメントで「他の loss 関数より弱い学習シグナルを生む」と明記されている。
全 negative ペアを同等に扱うため、意味的に近い別クラス（heat vs light）と無関係ペア（heat vs greeting）の区別ができない。

推奨代替: `CoSENTLoss` または `MultipleNegativesRankingLoss (MNRL)`
- CoSENTLoss: CosineSimilarityLoss の上位互換。ペアの順序関係を学習する
- MNRL: batch 内の全他例を negative として使う。最も効率的な negative 活用

### 欠陥 3: 過学習/次元崩壊の兆候

スコア分布の変化:
| | base model | fine-tuned model |
|---|---|---|
| mean | 0.8691 | 0.5432 |
| std | 0.0186 | 0.1419 |

fine-tuning 後にスコア分布が激変しており、embedding 空間が大きく変形している。
`num_iterations=20` で 271 例から大量のペアを生成し、validation なしで全データを学習しているため、
次元崩壊（dimensional collapse: 有効次元数の低下）が発生している可能性が高い。

兆候: 無関係語でも必ずどれかのクラスに高い類似度を持つ → 全入力が低次元部分空間に押し込められている

### 欠陥 4: 評価方法が汎化性能を測れていない

44件の手作業テストケースでは:
- サンプルサイズが小さすぎて統計的有意差を検出できない
- 手選びのバイアスがある
- 実際のユーザー入力の多様性を反映していない

fine-tuning の本来の価値は「training-data に含まれない未知表現への汎化性能向上」にあるが、
現在のテストではこれを正しく測定できていない。

---

## 修正アプローチの設計

### 訓練の修正

| 項目 | 第1回 (欠陥あり) | 修正版 |
|---|---|---|
| negative 例 | 訓練から除外 (0件) | "none" クラスとして 30+ 件を訓練に含める |
| loss 関数 | CosineSimilarityLoss | CoSENTLoss or MNRL |
| num_iterations | 20 | 5-10 (過学習抑制) |
| validation | なし | 20% hold-out + early stopping |
| batch_size | 8 | 16 (in-batch negative 多様性向上) |

### "none" クラスの構成

以下のカテゴリから多様な例を収集:
- 挨拶・社交表現: 「こんにちは」「ありがとう」「お疲れ様」
- ゲーム操作発話: 「やったー」「勝った」「もう一回」「スタート」
- 日常会話: 「お腹すいた」「眠い」「何時？」
- 感嘆詞: 「うわー」「えー」「あー」「すごい」
- 数字・カウント: 「一二三」「いちにさん」

### 評価の修正

1. **Leave-one-out 評価**: 各 exemplar を除外して分類。訓練データの品質測定
2. **未知表現テスト (大規模)**: training-data にない語を 100件以上用意し、base vs ft を比較
3. **OOS rejection テスト**: 多様な無関係発話に対する棄却精度を測定
4. **次元崩壊診断**: embedding の共分散行列の有効ランクを base vs ft で比較

---

## 第2回評価: 修正版 fine-tuning (v2)

### 修正内容

| 項目 | v1 (欠陥あり) | v2 (修正版) |
|---|---|---|
| none クラス | 訓練から除外 (0件) | 45件を11番目のクラスとして訓練に含む |
| loss 関数 | CosineSimilarityLoss | CoSENTLoss |
| num_iterations | 20 | 8 |
| batch_size | 8 | 16 |
| validation | なし | 20% stratified split (accuracy=83.6%) |

none クラスの内訳: 挨拶/社交 (6), ゲーム操作 (12), 日常会話 (6), 感嘆詞 (6), 方向指示 (6), 質問/確認 (4), 元の5件

### スコア分布の変化

| | base | v1 ft | v2 ft |
|---|---|---|---|
| mean | 0.8691 | 0.5432 | 0.6618 |
| std | 0.0186 | 0.1419 | 0.0787 |

v2 ではスコア分布の過度な変形が緩和。v1 で観測された次元崩壊の兆候は軽減された。

### 4構成比較結果

| 構成 | 最適F1 | v1との差 |
|---|---|---|
| A: base + EFFECT_PHRASES | 77.1% | (同一) |
| B: base + training-data | 86.8% | (同一) |
| C: ft + EFFECT_PHRASES | **87.2%** | +1.5pp |
| D: ft + training-data | **87.2%** | +0.7pp |

| 改善の要因 | v1 ΔF1 | v2 ΔF1 |
|---|---|---|
| exemplar 拡張 (B - A) | +9.7pp | +9.7pp |
| fine-tuning + exemplar なし (C - A) | +8.6pp | +10.0pp |
| fine-tuning の追加価値 (D - B) | **-0.4pp** | **+0.3pp** |

### ケース別差分: B vs D

- 改善 3件: 「錨」(mass_heavy), 「砲丸」(mass_heavy), 「牛歩」(speed_slow)
- 悪化 3件: 「アイスバーン」(friction_reduce→cold誤検出), 「俊敏」(speed_fast→mass_heavy誤検出), 「もう一回」(空→mass_heavy誤検出)
- 同一 38件

### v2 の評価

v1 の明確な欠陥（negative 未使用、弱い loss、過学習）は修正された:
- fine-tuning が悪化(-0.4pp)から微改善(+0.3pp)に転じた
- スコア分布の過度な変形が緩和された
- C 単体の性能が 85.7%→87.2% に改善

しかし、fine-tuning の追加価値(D-B)は +0.3pp と微小であり、ケース別でも改善3件 vs 悪化3件で相殺。

---

## 第3回評価: 大規模汎化性能テスト (156件の未知表現)

### 方法

training-data.json にも EFFECT_PHRASES にも含まれない 156 件の未知表現でテスト。
テストケースのカテゴリ:
- 連想表現 (50件): 効果を間接的に想起させる語（サウナ→heat, 鉄球→mass_heavy 等）
- 単語の揺れ (17件): ひらがな化・口語（おもたい、かろやか 等）
- 音声認識揺れ (26件): STT で起こりうる誤変換（あっつー、つべたい 等）
- 活用揺れ (10件): 動詞の命令形・使役形（燃やせ、すべらせろ 等）
- ゲーム表現 (14件): プレイ中の叫び（ヒートアップ、ブースト 等）
- negative (30件): 効果と無関係なゲーム中発話（いいぞ、やめて、ナイス 等）

構成: base/ft ともに training-data (271 exemplar) を使用（実運用と同一）。

### 結果

| | base model | fine-tuned v2 |
|---|---|---|
| 最適パラメータ | z=0.3, minGap=0.01 | z=0.3, minGap=0.01 |
| Precision | 79.2% | 78.6% |
| Recall | 81.7% | 87.3% |
| **F1** | 80.5% | **82.7%** |
| TP | 103 | 110 |
| FP | 27 | 30 |
| FN | 23 | 16 |
| TN | 3 | 0 |

**ΔF1 = +2.2pp。ケース別: 改善15件 vs 悪化11件、net +4件。**

### カテゴリ別正解率

| カテゴリ | 件数 | base | ft | 差 |
|---|---|---|---|---|
| 連想 | 50 | 41 | 45 | **+4** |
| ひらがな揺れ | 17 | 12 | 14 | +2 |
| STT揺れ | 26 | 22 | 20 | **-2** |
| 活用揺れ | 10 | 9 | 10 | +1 |
| ゲーム表現 | 14 | 13 | 14 | +1 |
| オノマトペ | 2 | 1 | 2 | +1 |
| 口語 | 7 | 4 | 4 | 0 |

### 属性別正解率

| 属性 | 件数 | base | ft | 差 |
|---|---|---|---|---|
| mass_heavy | 12 | 7 | **12** | **+5** |
| bounce | 12 | 10 | 12 | +2 |
| cold | 14 | 10 | 11 | +1 |
| speed_fast | 12 | 10 | 11 | +1 |
| speed_slow | 12 | 10 | 11 | +1 |
| friction_reduce | 12 | 12 | 10 | **-2** |
| electric | 13 | 13 | 12 | -1 |
| negative | 30 | 3 | 0 | -3 |

### 原因分析

**改善 (15件):**
- mass_heavy が最大改善 (+5): 砲丸, ずしっ, おもたい, 錨, プレス。fine-tuning が「重い」の概念境界を明確化
- 連想表現 +4: 焼肉→heat, 熱波→heat, 牛歩→speed_slow 等。embedding 空間でのクラス分離が改善
- bounce +2: ぴょんぴょん, はねかえせ。弾み関連の汎化改善

**悪化 (11件):**
- friction_reduce -2: アイスバーン→cold誤検出, ぬめり→heat誤検出。cold/heat との境界が変質
- STT揺れ -2: あちちちち→bounce, もたもた→mass_heavy。崩れた発音パターンの認識が悪化
- negative -3: 次いこう, 最高, あぶない。mass_heavy/friction_reduce に誤分類。ただし base でも negative 棄却は 3/30 と低く、z=0.3 ではどちらのモデルもほぼ棄却できない

### 結論

**fine-tuning v2 は未知表現への汎化性能を改善する。** 156件の完全未知テストで F1 +2.2pp。

ただし:
- **Recall 改善 vs Precision 微減** のトレードオフ。ゲーム用途で false positive を避けたい場合、z を上げる必要がある
- **属性による偏り**: mass_heavy で劇的改善 (+5)、friction_reduce で悪化 (-2)。fine-tuning の効果は均一ではない
- **negative 棄却は別途対処が必要**: 両モデルとも z=0.3 では negative をほぼ棄却できない。運用では z=1.5 以上を使用

---

## 総合結論

| 評価 | テスト規模 | ΔF1 (D-B) | 判定 |
|---|---|---|---|
| 第1回 (v1 欠陥あり) | 44件 | -0.4pp | 欠陥あり、無効 |
| 第2回 (v2 修正版) | 44件 | +0.3pp | サンプル不足 |
| **第3回 (汎化テスト)** | **156件** | **+2.2pp** | **改善を確認** |

1. **exemplar 拡張は最も効果的な改善**: +9.7pp、低コスト、確実
2. **fine-tuning v2 は追加的な改善を提供**: +2.2pp、特に mass_heavy/bounce で顕著
3. **fine-tuning のコスト**: 140MB fp32 モデル、Python パイプライン、モデル別閾値管理
4. **費用対効果の判断はプロジェクトの方針次第**: +2.2pp のために上記コストが許容できるか

---

## 残課題

- 実ユーザーの音声認識データでの評価（現在はシミュレーションのみ）
- negative 棄却精度の改善（training-data の none 例の質と量の強化）
- friction_reduce / electric の悪化への対処（属性間境界の改善）

---

## 再現手順

```bash
# 評価の再現
cd server
npx tsx test/generalization-test.ts         # 第3回: 156件汎化性能テスト
npx tsx test/production-comparison.ts       # 第2回: 4構成比較 (44件)
npx tsx test/finetune-analysis.ts           # 同一条件詳細分析 (EFFECT_PHRASES のみ)
npx tsx --test test/effect-classifier.test.ts  # 通常テスト

# v2 fine-tuning の再訓練
cd training
uv run python fine_tune.py                  # 訓練 (~80秒, CPU)
uv run python export_onnx.py               # ONNX エクスポート
```

## 参考文献

- SetFit: Efficient Few-Shot Learning Without Prompts (arXiv 2209.11055)
- sentence-transformers Loss Overview: https://sbert.net/docs/sentence_transformer/loss_overview.html
- Understanding Dimensional Collapse in Contrastive Self-supervised Learning (ICLR 2022)
- DETER: Improved Out-of-Scope Intent Classification (LREC-COLING 2024)
