import { InferenceSession, Tensor } from "onnxruntime-node";
import EventEmitter from "node:events";

export type SampleRate = 8000 | 16000;

export interface VADOptions {
  /** Minimum duration of speech to start a new speech chunk (ms) */
  minSpeechDuration: number;
  /** Duration of silence required to end speech (ms) */
  minSilenceDuration: number;
  /** Duration of padding to add to the start of speech buffer (ms) */
  prefixPaddingDuration: number;
  /** Maximum duration of speech to keep in buffer (ms) */
  maxBufferedSpeech: number;
  /** Activation threshold for speech detection */
  activationThreshold: number;
  /** Sample rate for the model */
  sampleRate: SampleRate;
  /** Include previous frames as context for smoother detection */
  context: boolean;
}

const session = await InferenceSession.create("silero_vad.onnx");

export interface SileroVADEvents {
  SPEECH_STARTED: { paddingBuffer: Float32Array };
  SPEECH_ENDED: { fullBuffer: Float32Array };
}

export default class SileroVAD extends EventEmitter {
  private options: VADOptions;
  private contextSize: number;
  private windowSizeSamples: number;
  private context: Float32Array;
  private msPerChunk: number;
  public isSpeaking = false;

  private speechDuration = 0;
  private silenceDuration = 0;

  private paddingBuffer: Float32Array = new Float32Array(0);
  private speechBuffer: Float32Array = new Float32Array(0);

  constructor(options: VADOptions) {
    super();
    this.options = options;
    this.contextSize = options.sampleRate === 8000 ? 32 : 64;
    this.windowSizeSamples = options.sampleRate === 8000 ? 256 : 512;

    // Initialize context buffer if context is enabled
    this.context = options.context ? new Float32Array(this.contextSize) : new Float32Array(0);
    this.msPerChunk = (this.windowSizeSamples / options.sampleRate) * 1000;
  }

  on<K extends keyof SileroVADEvents>(event: K, listener: (payload: SileroVADEvents[K]) => void) {
    return super.on(event, listener);
  }

  /** Append new audio chunk to a buffer and trim if it exceeds max duration */
  private appendToBuffer(buffer: Float32Array, chunk: Float32Array, maxDurationMs: number): Float32Array {
    const maxSamples = Math.ceil((maxDurationMs / 1000) * this.options.sampleRate);
    const newBuffer = new Float32Array(buffer.length + chunk.length);
    newBuffer.set(buffer, 0);
    newBuffer.set(chunk, buffer.length);
    return newBuffer.length > maxSamples ? newBuffer.slice(newBuffer.length - maxSamples) : newBuffer;
  }

  /** Prepare input buffer for the model, optionally including previous context */
  private createInputBuffer(chunk: Float32Array): Float32Array {
    if (!this.options.context) return chunk;
    const buffer = new Float32Array(this.contextSize + this.windowSizeSamples);
    buffer.set(this.context, 0);
    buffer.set(chunk, this.contextSize);
    this.context.set(buffer.slice(-this.contextSize));
    return buffer;
  }

  /** Process incoming audio chunk, update buffers, and run inference */
  public async processAudio(chunk: Float32Array): Promise<number> {
    const inputBuffer = this.createInputBuffer(chunk);

    if (!this.isSpeaking) {
      this.paddingBuffer = this.appendToBuffer(this.paddingBuffer, chunk, this.options.prefixPaddingDuration);
    } else {
      this.speechBuffer = this.appendToBuffer(this.speechBuffer, chunk, this.options.maxBufferedSpeech);
    }

    return this.runInference(inputBuffer);
  }

  /** Run ONNX model inference and update speech/silence state */
  private async runInference(inputBuffer: Float32Array): Promise<number> {
    const input = new Tensor("float32", inputBuffer, [1, inputBuffer.length]);
    const state = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
    const sr = new Tensor("int64", BigInt64Array.from([BigInt(this.options.sampleRate)]));

    const result = await session.run({ input, state, sr });
    const probability = Number(result.output.data[0]);

    if (probability > this.options.activationThreshold) {
      this.speechDuration += this.msPerChunk;
      this.silenceDuration = 0;

      if (this.speechDuration >= this.options.minSpeechDuration && !this.isSpeaking) {
        this.emit("SPEECH_STARTED", { paddingBuffer: this.paddingBuffer });
        this.isSpeaking = true;
      }
    } else {
      this.silenceDuration += this.msPerChunk;
      this.speechDuration = 0;

      if (this.silenceDuration >= this.options.minSilenceDuration && this.isSpeaking) {
        const fullBuffer = new Float32Array(this.paddingBuffer.length + this.speechBuffer.length);
        fullBuffer.set(this.paddingBuffer, 0);
        fullBuffer.set(this.speechBuffer, this.paddingBuffer.length);

        this.emit("SPEECH_ENDED", { fullBuffer });
        this.isSpeaking = false;

        // Clear buffers after speech ends
        this.speechBuffer = new Float32Array();
        this.paddingBuffer = new Float32Array();
      }
    }

    return probability;
  }

  /** Reset context buffer for new streams */
  public resetContext(): void {
    if (this.options.context) this.context.fill(0);
  }

  /** Expected chunk size for this configuration */
  public getExpectedChunkSize(): number {
    return this.windowSizeSamples;
  }

  /** Total buffer size sent to the model (chunk + context) */
  public getTotalBufferSize(): number {
    return this.options.context ? this.contextSize + this.windowSizeSamples : this.windowSizeSamples;
  }
}
