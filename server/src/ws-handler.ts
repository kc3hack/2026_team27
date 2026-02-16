import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { DeepgramSTTClient } from "./deepgram-client.js";
import { EffectClassifier } from "./effect-classifier.js";
import { AudioAnalyzer } from "./audio-analyzer.js";
import type {
  ControlMessage,
  ServerMessage,
  EffectConfidence,
  EffectType,
} from "./types.js";

const INTERIM_DEBOUNCE_MS = 150;

interface SessionState {
  deepgram: DeepgramSTTClient;
  audioAnalyzer: AudioAnalyzer;
  finalSegments: string[];
  finalEffects: EffectConfidence[];
  interimDebounceTimer: ReturnType<typeof setTimeout> | null;
}

export function handleWebSocket(
  ws: WebSocket,
  classifier: EffectClassifier,
  deepgramApiKey: string,
  deepgramModel?: string,
  deepgramLanguage?: string,
): void {
  const state: SessionState = {
    deepgram: new DeepgramSTTClient({
      apiKey: deepgramApiKey,
      model: deepgramModel,
      language: deepgramLanguage,
    }),
    audioAnalyzer: new AudioAnalyzer(),
    finalSegments: [],
    finalEffects: [],
    interimDebounceTimer: null,
  };

  const send = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  state.deepgram.connect({
    onOpen: () => {
      send({ type: "connected", message: "STT session started" });
    },

    onTranscript: async (result) => {
      const { transcript, isFinal, speechFinal } = result;

      if (!isFinal && !speechFinal) {
        // --- interim段階: debounce して暫定効果を送信 ---
        send({ type: "interim", text: transcript });

        if (state.interimDebounceTimer) {
          clearTimeout(state.interimDebounceTimer);
        }

        state.interimDebounceTimer = setTimeout(async () => {
          try {
            const effects = await classifier.classify(transcript);
            if (effects.length > 0) {
              send({ type: "interim_effect", text: transcript, effects });
            }
          } catch (err) {
            console.error("[ws-handler] interim classify error:", err);
          }
        }, INTERIM_DEBOUNCE_MS);
      }

      if (isFinal) {
        // --- is_final段階: 確定セグメントを即座に分類、蓄積 ---
        state.finalSegments.push(transcript);

        try {
          const effects = await classifier.classify(transcript);
          for (const e of effects) {
            const existing = state.finalEffects.find(
              (f) => f.effect === e.effect,
            );
            if (!existing) {
              state.finalEffects.push(e);
            } else if (e.confidence > existing.confidence) {
              existing.confidence = e.confidence;
            }
          }
        } catch (err) {
          console.error("[ws-handler] is_final classify error:", err);
        }
      }

      if (speechFinal) {
        // --- speech_final段階: 蓄積した結果を集約して最終判定 ---
        if (state.interimDebounceTimer) {
          clearTimeout(state.interimDebounceTimer);
          state.interimDebounceTimer = null;
        }

        const fullText = state.finalSegments.join("");
        const intensity = state.audioAnalyzer.getIntensity();
        const effectTypes: EffectType[] = state.finalEffects.map(
          (e) => e.effect,
        );

        if (fullText.length > 0) {
          send({
            type: "result",
            data: {
              id: uuidv4(),
              text: fullText,
              voiceIntensity: intensity,
              effects: effectTypes,
            },
          });
        }

        // リセット
        state.finalSegments = [];
        state.finalEffects = [];
        state.audioAnalyzer.reset();
      }
    },

    onError: (error) => {
      send({ type: "error", message: error.message });
    },

    onClose: () => {
      console.log("[ws-handler] Deepgram connection closed");
    },
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      const buffer = Buffer.from(data as ArrayBuffer);
      state.audioAnalyzer.addChunk(buffer);
      state.deepgram.sendAudio(buffer);
    } else {
      try {
        const msg = JSON.parse(data.toString()) as ControlMessage;
        if (msg.type === "control" && msg.action === "stop") {
          state.deepgram.close();
        }
      } catch {
        console.error("[ws-handler] Invalid JSON message");
      }
    }
  });

  ws.on("close", () => {
    if (state.interimDebounceTimer) {
      clearTimeout(state.interimDebounceTimer);
    }
    state.deepgram.close();
    console.log("[ws-handler] Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("[ws-handler] WebSocket error:", err);
    state.deepgram.close();
  });
}
