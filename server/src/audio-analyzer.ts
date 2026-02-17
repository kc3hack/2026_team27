const MAX_RMS_THRESHOLD = 8000;

export class AudioAnalyzer {
  private rmsValues: number[] = [];

  /** PCM 16bit LE チャンクの RMS を計算して蓄積 */
  addChunk(pcmBuffer: Buffer): void {
    const samples = pcmBuffer.length / 2; // 16bit = 2 bytes per sample
    if (samples === 0) return;

    let sumSquares = 0;
    for (let i = 0; i < pcmBuffer.length; i += 2) {
      const sample = pcmBuffer.readInt16LE(i);
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples);
    this.rmsValues.push(rms);
  }

  /** 蓄積した RMS 値の平均を 0-100 のスケールに正規化して返す */
  getIntensity(): number {
    if (this.rmsValues.length === 0) return 0;

    const avgRms =
      this.rmsValues.reduce((sum, v) => sum + v, 0) / this.rmsValues.length;

    return Math.min(100, Math.round((avgRms / MAX_RMS_THRESHOLD) * 100));
  }

  /** 蓄積をリセット */
  reset(): void {
    this.rmsValues = [];
  }
}
