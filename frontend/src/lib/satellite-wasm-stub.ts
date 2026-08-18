/**
 * satellite.js ships Emscripten WASM builds that use top-level await, which the
 * client bundle cannot emit. We only use the pure-JS SGP4 API, so the wasm
 * runtimes are aliased to this stub.
 */
export default async function createWasmModule(): Promise<never> {
  throw new Error("satellite.js WASM runtime is not available in this build");
}
