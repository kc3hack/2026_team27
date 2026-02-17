export enum EffectType {
  // 環境効果
  HEAT = "heat",
  COLD = "cold",
  ELECTRIC = "electric",
  LIGHT = "light",
  FRICTION_REDUCE = "friction_reduce",
  BOUNCE = "bounce",

  // 自己効果
  MASS_HEAVY = "mass_heavy",
  MASS_LIGHT = "mass_light",
  SPEED_FAST = "speed_fast",
  SPEED_SLOW = "speed_slow",
}

export interface EffectConfidence {
  effect: EffectType;
  confidence: number;
}

export interface EffectScore {
  effect: string;
  similarity: number;
  passed: boolean;
}

export interface ClassifyDebug {
  allScores: EffectScore[];
  mean: number;
  std: number;
  threshold: number;
  classifyMs: number;
}

export interface ClassifyResult {
  effects: EffectConfidence[];
  debug: ClassifyDebug;
}

export interface WordDefinition {
  id: string;
  text: string;
  voiceIntensity: number;
  effects: EffectType[];
}

// サーバー → クライアント メッセージ
export type ServerMessage =
  | { type: "connected"; message: string; ts: number }
  | { type: "result"; data: WordDefinition; debug?: ClassifyDebug; ts: number }
  | { type: "interim"; text: string; ts: number }
  | { type: "error"; message: string; ts: number };

// クライアント → サーバー 制御メッセージ
export interface ControlMessage {
  type: "control";
  action: "stop";
}
