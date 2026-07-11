/**
 * vision-web.js — REAL on-device perception via MediaPipe Object Detector (WASM/WebGL).
 * Runs locally in the browser; after the first online load the model is cached, so it works
 * in airplane mode. This is what makes the offline verdict genuine: it reports what the camera
 * ACTUALLY sees (COCO objects: laptop, person, chair, tv, keyboard, book, …), not canned text.
 *
 * Model + wasm load from Google's public CDN (no manual download); load once online to cache
 * for airplane-mode. Confirm versions against the MediaPipe "Object Detection for Web" docs.
 */
// All local — served by our own server (works in airplane mode, even on reload, via localhost).
const LIB = "/vendor/tasks-vision/vision_bundle.mjs";
const WASM = "/vendor/tasks-vision/wasm";
const MODEL = "/models/efficientdet_lite0.tflite";

let detector = null;
export let vstatus = "not-loaded"; // not-loaded | loading | ready | unavailable

export async function initVision(onStatus = () => {}) {
  vstatus = "loading"; onStatus(vstatus);
  try {
    const { FilesetResolver, ObjectDetector } = await import(/* @vite-ignore */ LIB);
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    detector = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL },
      scoreThreshold: 0.4,
      maxResults: 12,
      runningMode: "IMAGE",
    });
    vstatus = "ready"; onStatus(vstatus);
  } catch (e) {
    console.warn("[vision-web]", e?.message || e);
    vstatus = "unavailable"; onStatus(vstatus);
  }
  return vstatus;
}

export const visionReady = () => vstatus === "ready" && !!detector;

/** Detect objects in a canvas/image → [{name, score}] from the REAL frame. */
export function detect(source) {
  if (!visionReady()) throw new Error("vision not ready");
  const res = detector.detect(source);
  return (res.detections || [])
    .map((d) => ({ name: d.categories?.[0]?.categoryName, score: d.categories?.[0]?.score || 0 }))
    .filter((x) => x.name);
}
