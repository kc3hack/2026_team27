"""
SetFit fine-tuning for effect classifier (v3).

v2 からの変更:
  - カタカナ造語の形態変化バリアントを training-data.json に追加
  - サブワード正則化: SentencePiece sampling で同一テキストの異なる
    トークン分割を生成し、デコード結果を追加の訓練データとして投入
    (Kudo 2018, Provilkov et al. 2020)

v2:
  - "none" クラスを訓練に含める (OOS rejection の学習)
  - CoSENTLoss に変更 (CosineSimilarityLoss より強い学習シグナル)
  - num_iterations=20→8 (過学習抑制)
  - validation split 20% (過学習検出)
  - batch_size=8→16 (in-batch negative の多様性向上)

Reads:  ../server/data/training-data.json
Writes: ../server/models/fine-tuned-ruri-v3-30m/
"""

import json
import os
import platform
import sys
from pathlib import Path

BASE_MODEL = "cl-nagoya/ruri-v3-30m"
SERVER_DIR = Path(__file__).resolve().parent.parent / "server"
DATA_PATH = SERVER_DIR / "data" / "training-data.json"
OUTPUT_DIR = SERVER_DIR / "models" / "fine-tuned-ruri-v3-30m"

MIN_FREE_MEMORY_GB = 3.0


def get_free_memory_gb() -> float:
    """OS 別の空きメモリ (GB) を取得"""
    if platform.system() == "Darwin":
        import subprocess
        result = subprocess.run(["vm_stat"], capture_output=True, text=True)
        lines = result.stdout.strip().split("\n")
        page_size = 16384
        free = 0
        for line in lines:
            if "Pages free" in line or "Pages inactive" in line or "Pages purgeable" in line:
                val = line.split(":")[-1].strip().rstrip(".")
                free += int(val) * page_size
        return free / (1024 ** 3)
    else:
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemAvailable"):
                        return int(line.split()[1]) / (1024 ** 2)
        except FileNotFoundError:
            pass
    return 999.0


def check_resources():
    """実行前リソースチェック"""
    free_gb = get_free_memory_gb()
    print(f"Available memory: {free_gb:.1f} GB (minimum: {MIN_FREE_MEMORY_GB} GB)")
    if free_gb < MIN_FREE_MEMORY_GB:
        print(f"ERROR: Not enough free memory ({free_gb:.1f} GB < {MIN_FREE_MEMORY_GB} GB)")
        print("Close some applications and retry.")
        sys.exit(1)


def subword_augment(texts: list[str], labels: list[int], n_samples: int = 3,
                     alpha: float = 0.3) -> tuple[list[str], list[int]]:
    """SentencePiece sampling によるサブワード正則化データ拡張。

    同一テキストに対して異なるサブワード分割を生成し、
    デコードした結果を追加の訓練データとして返す。
    これにより、モデルが特定のトークン分割に依存しない表現を学習する。

    Args:
        texts: 元テキスト列
        labels: 元ラベル列
        n_samples: テキストあたりの拡張サンプル数
        alpha: SentencePiece sampling の温度 (低いほど多様)
    """
    from transformers import AutoTokenizer
    import sentencepiece as spm

    # slow tokenizer 経由で sp_model を取得
    tok = AutoTokenizer.from_pretrained(BASE_MODEL, use_fast=False)
    sp: spm.SentencePieceProcessor = tok.sp_model

    aug_texts, aug_labels = [], []
    seen = set(texts)  # 重複排除

    for text, label in zip(texts, labels):
        for _ in range(n_samples):
            # sampling モードで異なるサブワード分割を生成
            pieces = sp.encode(text, out_type=str,
                               enable_sampling=True, alpha=alpha, nbest_size=-1)
            decoded = "".join(p.lstrip("▁") for p in pieces)
            # デコード結果が元と異なり、かつ未見の場合のみ追加
            if decoded != text and decoded not in seen:
                seen.add(decoded)
                aug_texts.append(decoded)
                aug_labels.append(label)

    return aug_texts, aug_labels


def load_training_data():
    """訓練データを読み込み、サブワード正則化で拡張し、train/val に分割して返す。"""
    from datasets import Dataset

    if not DATA_PATH.exists():
        print(f"Error: {DATA_PATH} not found")
        sys.exit(1)

    with open(DATA_PATH) as f:
        data = json.load(f)

    # positive 例のラベル一覧 + "none" を追加
    positive_labels = sorted(set(ex["label"] for ex in data["examples"] if ex["is_positive"]))
    all_labels = positive_labels + ["none"]
    label_to_id = {label: i for i, label in enumerate(all_labels)}

    # positive 例と negative 例 ("none") を収集
    texts, labels = [], []
    none_texts_seen = set()

    for ex in data["examples"]:
        if ex["is_positive"]:
            texts.append(ex["text"])
            labels.append(label_to_id[ex["label"]])
        else:
            # negative 例は "none" クラスとして含める (重複排除)
            if ex["text"] not in none_texts_seen:
                none_texts_seen.add(ex["text"])
                texts.append(ex["text"])
                labels.append(label_to_id["none"])

    # クラス別集計 (拡張前)
    from collections import Counter
    counts = Counter(labels)
    print(f"Loaded {len(texts)} examples, {len(all_labels)} labels (incl. 'none')")
    for label, lid in sorted(label_to_id.items(), key=lambda x: x[1]):
        print(f"  {label}: {counts.get(lid, 0)} examples")

    # サブワード正則化によるデータ拡張 (positive 例のみ)
    pos_texts = [t for t, l in zip(texts, labels) if l != label_to_id["none"]]
    pos_labels = [l for l in labels if l != label_to_id["none"]]
    aug_texts, aug_labels = subword_augment(pos_texts, pos_labels, n_samples=3, alpha=0.3)
    print(f"Subword augmentation: +{len(aug_texts)} examples")
    texts.extend(aug_texts)
    labels.extend(aug_labels)

    # クラス別集計 (拡張後)
    counts = Counter(labels)
    print(f"Total after augmentation: {len(texts)} examples")
    for label, lid in sorted(label_to_id.items(), key=lambda x: x[1]):
        print(f"  {label}: {counts.get(lid, 0)} examples")

    # 80/20 stratified split
    from collections import defaultdict
    import random
    random.seed(42)

    by_label = defaultdict(list)
    for t, l in zip(texts, labels):
        by_label[l].append(t)

    train_texts, train_labels = [], []
    val_texts, val_labels = [], []
    for l, ts in by_label.items():
        random.shuffle(ts)
        split = max(1, int(len(ts) * 0.8))
        for t in ts[:split]:
            train_texts.append(t)
            train_labels.append(l)
        for t in ts[split:]:
            val_texts.append(t)
            val_labels.append(l)

    print(f"Split: train={len(train_texts)}, val={len(val_texts)}")

    train_ds = Dataset.from_dict({"text": train_texts, "label": train_labels})
    val_ds = Dataset.from_dict({"text": val_texts, "label": val_labels})
    return train_ds, val_ds, all_labels


def main():
    check_resources()

    # CPU 強制 (MPS は共有メモリで他プロセスに影響するため)
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    import torch
    device = "cpu"
    torch.set_num_threads(min(4, os.cpu_count() or 4))
    print(f"Device: {device} (threads: {torch.get_num_threads()})")

    train_dataset, val_dataset, label_set = load_training_data()

    from setfit import SetFitModel, Trainer, TrainingArguments
    from sentence_transformers.losses import CoSENTLoss

    print(f"\nLoading base model: {BASE_MODEL}")
    model = SetFitModel.from_pretrained(
        BASE_MODEL,
        model_kwargs={"attn_implementation": "eager"},
        device=device,
    )

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "checkpoints"),
        num_iterations=8,          # 20→8: 過学習抑制
        num_epochs=3,
        batch_size=16,             # 8→16: in-batch negative の多様性向上
        loss=CoSENTLoss,           # CosineSimilarityLoss→CoSENTLoss: より強い学習シグナル
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
    )

    print("Training (contrastive learning with CoSENTLoss)...")
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        column_mapping={"text": "text", "label": "label"},
    )
    trainer.train()

    # validation metrics
    metrics = trainer.evaluate(val_dataset)
    print(f"\nValidation metrics: {metrics}")

    # embedding のみ保存 (classification head は不使用)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    model.model_body.save_pretrained(str(OUTPUT_DIR))
    model.model_body.tokenizer.save_pretrained(str(OUTPUT_DIR))
    print(f"\nSaved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
