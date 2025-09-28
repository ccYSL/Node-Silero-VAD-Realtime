# silero-realtime-vad
#### Real-time Voice Activity Detection (VAD) using Silero ONNX models in Node.js.

#### [Silero VAD](https://github.com/snakers4/silero-vad)


#### Supports both 8KHz & 16KHz sampling rates
![npm](https://img.shields.io/npm/v/silero-realtime-vad)
![downloads](https://img.shields.io/npm/dm/silero-realtime-vad)
![license](https://img.shields.io/npm/l/silero-realtime-vad)
![styled with](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)

## Install
```sh
npm install silero-realtime-vad
```
### Audio Chunk Requirements
- For **16 kHz** sample rate: send **512 samples** per chunk  
- For **8 kHz** sample rate: send **256 samples** per chunk  

Chunks should be raw **Float32 PCM**, normalized between -1.0 and 1.0.

## Usage
```javascript
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

const audioChunk = new Float32Array(audioData);

const probability = await vad.processAudio(audioChunk);
```
## License
MIT
