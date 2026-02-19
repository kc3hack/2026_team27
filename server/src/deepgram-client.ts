import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type { LiveClient } from "@deepgram/sdk";

export interface DeepgramTranscriptResult {
  transcript: string;
  isFinal: boolean;
  speechFinal: boolean;
}

export interface DeepgramClientOptions {
  apiKey: string;
  model?: string;
  language?: string;
}

export class DeepgramSTTClient {
  private connection: LiveClient | null = null;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly language: string;
  private firstSendTs: number | null = null;

  constructor(options: DeepgramClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "nova-3";
    this.language = options.language ?? "ja";
  }

  connect(handlers: {
    onTranscript: (result: DeepgramTranscriptResult) => void;
    onError: (error: Error) => void;
    onClose: () => void;
    onOpen: () => void;
  }): void {
    const deepgram = createClient(this.apiKey);

    this.connection = deepgram.listen.live({
      model: this.model,
      language: this.language,
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
      endpointing: 300,
      encoding: "linear16",
      sample_rate: 16000,
      channels: 1,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("[Deepgram] Connection opened");
      handlers.onOpen();
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript ?? "";
      if (transcript === "") return;

      const fromFirstSend = this.firstSendTs != null
        ? `+${(performance.now() - this.firstSendTs).toFixed(0)}ms`
        : "?";
      console.log(`[TIMING][Deepgram] Transcript ${fromFirstSend} from firstSend: "${transcript}" is_final=${data.is_final} speech_final=${data.speech_final}`);

      handlers.onTranscript({
        transcript,
        isFinal: data.is_final ?? false,
        speechFinal: data.speech_final ?? false,
      });
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err: any) => {
      console.error("[Deepgram] Error:", err);
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("[Deepgram] Connection closed");
      handlers.onClose();
    });
  }

  sendAudio(audioData: Buffer): void {
    if (this.connection) {
      if (this.firstSendTs == null) {
        this.firstSendTs = performance.now();
        console.log(`[TIMING][Deepgram] First audio sent to Deepgram`);
      }
      this.connection.send(audioData as unknown as ArrayBuffer);
    }
  }

  close(): void {
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
      this.firstSendTs = null;
    }
  }
}
