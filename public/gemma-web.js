/**
 * gemma-web.js — real on-device Gemma via MediaPipe LLM Inference (WebGPU), in the browser.
 * Loads once (on venue wifi), then runs 100% locally — works in airplane mode.
 *
 * Best-effort: if the lib/model/WebGPU aren't available, `ready` stays false and callers use
 * the deterministic local reasoner instead — so the offline loop ALWAYS demos.
 *
 * To enable REAL Gemma:
 *   1. put a web-runnable Gemma model at  public/models/gemma.bin  (e.g. gemma / gemma-2b/3
 *      -it GPU int4 .bin/.task/.litertlm — see the MediaPipe LLM web sample).
 *   2. reload while online once so the WASM + model load; then airplane mode for the demo.
 * Confirm the exact CDN path + model format against the MediaPipe "LLM Inference for Web" docs.
 */
// Drop your Gemma 4 E2B web build in public/models/ — any of these names works.
// Use the WEB / GPU (LiteRT) build (.task or .litertlm), NOT the Android or raw HF weights.
// Prefer E2B for the browser; E4B is usually too large for laptop WebGPU.
const MODEL_CANDIDATES = [
  "models/gemma4-e2b.task",
  "models/gemma-3n-e2b.task",
  "models/gemma.task",
  "models/gemma.litertlm",
  "models/gemma.bin",
];
// Local — no CDN, so it runs offline (localhost) and survives reloads in airplane mode.
const WASM_CDN = "/vendor/tasks-genai/wasm";
const LIB_CDN = "/vendor/tasks-genai/genai_bundle.mjs";

async function resolveModelUrl() {
  for (const url of MODEL_CANDIDATES) {
    try { if ((await fetch(url, { method: "HEAD" })).ok) return url; } catch { /* try next */ }
  }
  return null;
}

let llm = null;
// not-loaded | loading | no-webgpu | no-model | ready | unavailable
export let status = "not-loaded";

export async function initGemma(onStatus = () => {}) {
  status = "loading"; onStatus(status);
  try {
    // 1) WebGPU must exist AND actually give us an adapter.
    if (!navigator.gpu) { status = "no-webgpu"; onStatus(status); return status; }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { status = "no-webgpu"; onStatus(status); return status; }

    // 2) Is a Gemma web build actually present in public/models/ ?
    const modelUrl = await resolveModelUrl();
    if (!modelUrl) { status = "no-model"; onStatus(status); return status; }

    // 3) Load the MediaPipe LLM runtime + model (runs on the GPU, offline after this).
    // Minimal option surface for first-try success; add topK/temperature if your build accepts them.
    const { FilesetResolver, LlmInference } = await import(/* @vite-ignore */ LIB_CDN);
    const fileset = await FilesetResolver.forGenAiTasks(WASM_CDN);
    llm = await LlmInference.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl },
      maxTokens: 1024,
    });
    status = "ready"; onStatus(status);
  } catch (e) {
    console.warn("[gemma-web] load failed — ", e?.message || e);
    status = "unavailable"; onStatus(status);
  }
  return status;
}

export const isReady = () => status === "ready" && !!llm;

/**
 * Run a prompt fully on-device. Throws if not ready.
 * Prefers the streaming async API so the UI thread isn't frozen during inference.
 */
export async function generate(prompt) {
  if (!isReady()) throw new Error("Gemma web not ready");
  if (typeof llm.generateResponseAsync === "function") {
    let full = "";
    await llm.generateResponseAsync(prompt, (partial) => { if (partial) full += partial; });
    return full.trim();
  }
  return (await llm.generateResponse(prompt)).trim();
}
