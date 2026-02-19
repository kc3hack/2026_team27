const MAX_RMS_THRESHOLD = 8000;
const SILENCE_RMS_THRESHOLD = 300;  // これ以下を無音とみなす

export class AudioAnalyzer {
  private rmsValues: number[] = [];
  private lastSpeechTs = 0;  // 最後に音声（非無音）を検出した時刻

  /** PCM 16bit LE チャンクの RMS を計算して蓄積 */
  addChunk(pcmBuffer: Buffer): number {
    const samples = pcmBuffer.length / 2; // 16bit = 2 bytes per sample
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < pcmBuffer.length; i += 2) {
      const sample = pcmBuffer.readInt16LE(i);
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples);
    this.rmsValues.push(rms);

    if (rms > SILENCE_RMS_THRESHOLD) {
      this.lastSpeechTs = Date.now();
    }

    return rms;
  }

  /** 最後に音声を検出した時刻を返す (0 = まだ検出なし) */
  getLastSpeechTs(): number {
    return this.lastSpeechTs;
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
    this.lastSpeechTs = 0;
  }
}
