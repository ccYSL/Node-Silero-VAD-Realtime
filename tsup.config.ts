import { defineConfig } from "tsup";
import { copyFileSync } from "node:fs";

export default defineConfig({
  format: ["esm"],
  entry: ["./src/index.ts"],
  dts: true,
  shims: true,
  skipNodeModulesBundle: true,
  clean: true,
  onSuccess: async () => {
    copyFileSync("./src/silero_vad.onnx", "./dist/silero_vad.onnx");
  },
});
