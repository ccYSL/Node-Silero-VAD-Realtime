import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import SileroVAD from "./src/index";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static("."));

wss.on("connection", (ws) => {
  console.log("WebSocket connection established");

  // Create VAD instance per connection
  const vad = new SileroVAD({
    sampleRate: 8000,
    minSpeechDuration: 50,
    minSilenceDuration: 500,
    prefixPaddingDuration: 500,
    maxBufferedSpeech: 5000,
    activationThreshold: 0.4,
    context: true,
  })
    .on("SPEECH_STARTED", ({ paddingBuffer }) => {
      console.log("SPEECH STARTED");
      console.log(paddingBuffer);
    })
    .on("SPEECH_ENDED", ({ fullBuffer }) => {
      console.log("SPEECH ENDED");
      console.log(fullBuffer);
    });

  ws.on("message", async (data) => {
    try {
      // Parse incoming audio data
      const audioData = JSON.parse(data.toString());
      const audioChunk = new Float32Array(audioData);

      // Validate chunk size
      const expectedSize = vad.getExpectedChunkSize();
      if (audioChunk.length !== expectedSize) {
        throw new Error(
          `Expected ${expectedSize} samples, got ${audioChunk.length}`
        );
      }

      // Process audio with VAD (handles context internally)
      const probability = await vad.processAudio(audioChunk);
      const speaking = vad.isSpeaking;

      // Send result back to client
      ws.send(
        JSON.stringify({
          probability,
          speaking,
          timestamp: Date.now(),
          bufferSize: vad.getTotalBufferSize(),
        })
      );
    } catch (error) {
      console.error("VAD processing error:", error);
      ws.send(
        JSON.stringify({
          error: "error",
          timestamp: Date.now(),
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

server.listen(3000, () => {
  console.log("VAD WebSocket server running on http://localhost:3000");
  console.log("WebSocket endpoint: ws://localhost:3000");
});
