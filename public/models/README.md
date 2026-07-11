# Drop your on-device Gemma 4 model here

Put a **web/GPU (LiteRT) Gemma 4 E2B** build in this folder. The loader auto-detects any of:

    public/models/gemma4-e2b.task
    public/models/gemma4-e2b.litertlm
    public/models/gemma.task
    public/models/gemma.litertlm

(Otherwise edit `MODEL_CANDIDATES` at the top of `public/gemma-web.js`.)

## Which file
- Use **Gemma 4 E2B** — the on-device size that fits laptop WebGPU.
- **E4B is usually too large** for in-browser WebGPU on an 8 GB laptop — use it only on Android/native. For this web demo, E2B.
- It must be the **WEB / GPU (LiteRT `.task`/`.litertlm`)** build — NOT the Android AAR bundle and NOT raw Hugging Face weights.
- Ask the organizers for the **web/WebGPU** E2B `.task` specifically (the on-device model they provide may be packaged for Android — confirm there's a web build).

## How it's used
Perception is on-device **MediaPipe object detection** (real camera → labels). **Gemma 4 does the
text reasoning** over those labels ("do these objects match the claim?"). This sidesteps the
current web limitation that MediaPipe's browser LLM runtime is text-first — vision stays with the
detector, language/decision stays with Gemma. Both on-device, offline.

## Requirements
- **Chrome** with WebGPU (`chrome://gpu` → WebGPU "enabled").
- Load once **online** (fetches WASM + model, warms up) → status turns
  **"reasoning: Gemma on-device ✓"** → then it runs in **airplane mode**.

The dev server streams + supports HTTP range, so a multi-hundred-MB / GB file serves fine.
This file (and the model binary) are gitignored — nothing large gets committed.
