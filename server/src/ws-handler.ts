import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { DeepgramSTTClient } from "./deepgram-client.js";
import { EffectClassifier } from "./effect-classifier.js";
import { AudioAnalyzer } from "./audio-analyzer.js";
import type {
  ControlMessage,
  ServerMessage,
  EffectType,
  ClassifyDebug,
} from "./types.js";

interface SessionState {
  deepgram: DeepgramSTTClient;
  audioAnalyzer: AudioAnalyzer;
  finalSegments: string[];
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
  };

  const send = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  state.deepgram.connect({
    onOpen: () => {
      send({ type: "connected", message: "STT session started", ts: Date.now() });
    },

    onTranscript: async (result) => {
      const { transcript, isFinal, speechFinal } = result;

      if (!isFinal) {
        // interim: テキスト転送のみ
        send({ type: "interim", text: transcript, ts: Date.now() });
      }

      if (isFinal) {
        // is_final: 確定セグメントを蓄積
        state.finalSegments.push(transcript);
      }

      if (speechFinal) {
        // speech_final: 全セグメント結合 → 1回だけ分類 → result送信
        const fullText = state.finalSegments.join("");
        const intensity = state.audioAnalyzer.getIntensity();

        if (fullText.length > 0) {
          try {
            const { effects, debug } = await classifier.classify(fullText);
            const effectTypes: EffectType[] = effects.map((e) => e.effect);

            send({
              type: "result",
              data: {
                id: uuidv4(),
                text: fullText,
                voiceIntensity: intensity,
                effects: effectTypes,
              },
              debug,
              ts: Date.now(),
            });
          } catch (err) {
            console.error("[ws-handler] classify error:", err);
            send({
              type: "result",
              data: {
                id: uuidv4(),
                text: fullText,
                voiceIntensity: intensity,
                effects: [],
              },
              ts: Date.now(),
            });
          }
        }

        // リセット
        state.finalSegments = [];
        state.audioAnalyzer.reset();
      }
    },

    onError: (error) => {
      send({ type: "error", message: error.message, ts: Date.now() });
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
    state.deepgram.close();
    console.log("[ws-handler] Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("[ws-handler] WebSocket error:", err);
    state.deepgram.close();
  });
}
