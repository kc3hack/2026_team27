"""
Export fine-tuned model to ONNX (Transformers.js compatible).

Reads:  ../server/models/fine-tuned-ruri-v3-30m/
Writes: ../server/models/fine-tuned-ruri-v3-30m-onnx/
        └── onnx/model.onnx   ← Transformers.js が期待する構造
"""

import shutil
import subprocess
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent / "server"
INPUT_DIR = SERVER_DIR / "models" / "fine-tuned-ruri-v3-30m"
OUTPUT_DIR = SERVER_DIR / "models" / "fine-tuned-ruri-v3-30m-onnx"


def export_with_optimum_cli() -> bool:
    print("Exporting with optimum-cli...")
    try:
        result = subprocess.run(
            [
                sys.executable, "-m", "optimum.exporters.onnx",
                "--model", str(INPUT_DIR),
                "--task", "feature-extraction",
                str(OUTPUT_DIR / "onnx"),  # onnx/ サブディレクトリに直接出力
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print("OK")
            return True
        print(f"Failed:\n{result.stderr}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False


def export_with_ort_model() -> bool:
    print("Fallback: ORTModelForFeatureExtraction...")
    try:
        from optimum.onnxruntime import ORTModelForFeatureExtraction
        model = ORTModelForFeatureExtraction.from_pretrained(str(INPUT_DIR), export=True)
        model.save_pretrained(str(OUTPUT_DIR / "onnx"))
        print("OK")
        return True
    except Exception as e:
        print(f"Failed: {e}")
        return False


def main():
    if not INPUT_DIR.exists():
        print(f"Error: {INPUT_DIR} not found. Run fine_tune.py first.")
        sys.exit(1)

    # 既存出力があれば削除して再作成
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "onnx").mkdir(exist_ok=True)

    if not export_with_optimum_cli() and not export_with_ort_model():
        sys.exit(1)

    # Transformers.js はルートに config.json / tokenizer を期待する
    for name in [
        "config.json", "tokenizer.json", "tokenizer_config.json",
        "special_tokens_map.json", "tokenizer.model",
    ]:
        src = INPUT_DIR / name
        if src.exists():
            shutil.copy2(src, OUTPUT_DIR / name)

    # onnx/ 内にも config が出力されている場合があるのでルートにも確保
    onnx_config = OUTPUT_DIR / "onnx" / "config.json"
    root_config = OUTPUT_DIR / "config.json"
    if onnx_config.exists() and not root_config.exists():
        shutil.copy2(onnx_config, root_config)

    print(f"\nDone: {OUTPUT_DIR}")
    print("Structure:")
    for p in sorted(OUTPUT_DIR.rglob("*")):
        if p.is_file():
            size_mb = p.stat().st_size / (1024 * 1024)
            print(f"  {p.relative_to(OUTPUT_DIR)}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
