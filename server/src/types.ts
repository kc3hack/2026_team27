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

export interface WordDefinition {
  id: string;
  text: string;
  voiceIntensity: number;
  effects: EffectType[];
}

// サーバー → クライアント メッセージ
export type ServerMessage =
  | { type: "connected"; message: string }
  | { type: "result"; data: WordDefinition }
  | { type: "interim"; text: string }
  | { type: "interim_effect"; text: string; effects: EffectConfidence[] }
  | { type: "error"; message: string };

// クライアント → サーバー 制御メッセージ
export interface ControlMessage {
  type: "control";
  action: "stop";
}
