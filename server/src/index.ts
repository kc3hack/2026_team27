import http from "node:http";
import { WebSocketServer } from "ws";
import { EffectClassifier } from "./effect-classifier.js";
import { handleWebSocket } from "./ws-handler.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL;
const DEEPGRAM_LANGUAGE = process.env.DEEPGRAM_LANGUAGE;

if (!DEEPGRAM_API_KEY) {
  console.error("DEEPGRAM_API_KEY is required");
  process.exit(1);
}

async function main() {
  const classifier = new EffectClassifier();
  await classifier.initialize();

  const server = http.createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: "/ws/stt" });

  wss.on("connection", (ws) => {
    console.log("[Server] New WebSocket connection");
    handleWebSocket(
      ws,
      classifier,
      DEEPGRAM_API_KEY!,
      DEEPGRAM_MODEL,
      DEEPGRAM_LANGUAGE,
    );
  });

  server.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
    console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws/stt`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
