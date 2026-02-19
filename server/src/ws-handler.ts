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
  // 計測用タイムスタンプ
  firstAudioTs: number | null;
  lastAudioTs: number | null;
  firstInterimTs: number | null;
  audioChunkCount: number;
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
    firstAudioTs: null,
    lastAudioTs: null,
    firstInterimTs: null,
    audioChunkCount: 0,
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
      const now = performance.now();
      const { transcript, isFinal, speechFinal } = result;

      if (!isFinal) {
        // interim: テキスト転送のみ
        send({ type: "interim", text: transcript, ts: Date.now() });

        // 計測: 最初の interim が来るまでの時間
        if (!state.firstInterimTs) {
          state.firstInterimTs = now;
          const fromFirst = state.firstAudioTs != null ? (now - state.firstAudioTs).toFixed(0) : "?";
          const fromLast  = state.lastAudioTs  != null ? (now - state.lastAudioTs).toFixed(0)  : "?";
          console.log(`[TIMING][Server] First interim: +${fromFirst}ms from firstAudio, +${fromLast}ms from lastAudio`);
        }
      }

      if (isFinal) {
        // is_final: 確定セグメントを蓄積
        state.finalSegments.push(transcript);
      }

      if (speechFinal) {
        // 計測: speech_final が来るまでの時間（= endpointing 待機時間）
        const fromLastAudio  = state.lastAudioTs  != null ? (now - state.lastAudioTs).toFixed(0)  : "?";
        const fromFirstAudio = state.firstAudioTs != null ? (now - state.firstAudioTs).toFixed(0) : "?";
        console.log(`[TIMING][Server] speech_final: +${fromLastAudio}ms from lastAudio (endpointing), +${fromFirstAudio}ms from firstAudio`);

        // speech_final: 全セグメント結合 → 1回だけ分類 → result送信
        const fullText = state.finalSegments.join("");
        const intensity = state.audioAnalyzer.getIntensity();

        if (fullText.length > 0) {
          try {
            const classifyStart = performance.now();
            const { effects, debug } = await classifier.classify(fullText);
            const classifyMs = (performance.now() - classifyStart).toFixed(0);
            console.log(`[TIMING][Server] classify("${fullText}"): ${classifyMs}ms`);

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

            const totalMs = state.firstAudioTs != null ? (performance.now() - state.firstAudioTs).toFixed(0) : "?";
            console.log(`[TIMING][Server] Result sent. Total server latency: ${totalMs}ms from firstAudio`);
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
        state.firstAudioTs = null;
        state.lastAudioTs = null;
        state.firstInterimTs = null;
        state.audioChunkCount = 0;
      }
    },

    onError: (error) => {
      send({ type: "error", message: error.message, ts: Date.now() });
    },

    onClose: () => {
      console.log("[ws-handler] Deepgram connection closed");
    },
  });

  let msgCount = 0;
  ws.on("message", (data, isBinary) => {
    msgCount++;
    if (isBinary) {
      const now = performance.now();
      if (!state.firstAudioTs) {
        state.firstAudioTs = now;
        console.log(`[TIMING][Server] First audio chunk received (msg #${msgCount})`);
      }
      state.lastAudioTs = now;
      state.audioChunkCount++;

      if (state.audioChunkCount <= 3 || state.audioChunkCount % 50 === 0) {
        const elapsed = (now - state.firstAudioTs).toFixed(0);
        console.log(`[TIMING][Server] Audio chunk #${state.audioChunkCount}: +${elapsed}ms, size=${(data as Buffer).length}B`);
      }

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
