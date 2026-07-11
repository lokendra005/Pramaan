# Pramaan — proof that the work actually happened

**A verification layer for the physical world** — does a claim match what the camera actually sees? Real-time or on-device. **Demonstrated on field lending** (our wedge; the same engine extends to insurance, subsidy & inventory verification).

**Track:** Real-Time Multimodal Interaction (Gemini Live API) · **Also competing:** Best Use of Gemma 4 (Local-First Agents on-device)
**Live demo video:** _<paste link>_ · **Run:** `npm start` → http://localhost:8790

---

## The problem
AI agents can act — approve, file, notify — but **none can confirm the physical world matches what was claimed.** That gap is where fraud hides: across lending, insurance, subsidies and asset finance, decisions rest on a field photo nobody can trust — ghost businesses, recycled photos, phantom collateral. We prove it on **rural field lending** — India's highest-fraud, lowest-connectivity, highest-impact wedge.

## What it does — and why it's different
An agent that verifies a claim against what the camera **actually sees**, and acts on its own:
- **Proactive.** It isn't asked — it *interrupts* the moment reality contradicts the claim.
- **Real-time & multimodal.** Sees + hears + translates (Hindi ↔ English) live. It does **not** work typed into a chatbox — the interaction *is* the product.
- **Works offline, on-device.** No signal? The same agent runs on the phone — counts assets, recovers from bad frames, and **defers to a human** instead of guessing.
- **Explainable, not a black box.** The verdict is a transparent rule over real observations — which is what a *lending* decision needs.

## Two modes, one agent
| | **Online — Live** | **Offline — Edge** |
|---|---|---|
| Tech | Gemini Live API | MediaPipe detection + Gemma 4 reasoning (WebGPU) |
| Does | Watches, listens, translates, flags in real time | Counts detected assets vs the claim — e.g. *"claim: 3 TVs → found 2 → defer"* |
| Network | required | **none** — runs in airplane mode |

Both let you **add a verification on the spot** (type a claim live; add a countable requirement offline) — that's the proof it isn't scripted: point it anywhere, change the claim, the verdict changes.

## Run it
```bash
cp .env.example .env      # paste your Gemini API key (never committed — .env is gitignored)
npm install
npm start                 # http://localhost:8790  — open in Chrome, allow mic + camera
```
**Offline Gemma reasoning (optional):** drop a Gemma 4 E2B *web* build at `public/models/gemma4-e2b.task`. Without it, the offline agent still runs real on-device vision + explainable reasoning; with it, Gemma makes the call and answers follow-up questions locally.

## Architecture
```
Browser (camera + mic + UI)  ⇄  local Node proxy (holds the API key)  ⇄  Gemini Live API
Offline path: MediaPipe + model served from localhost → 100% on-device, works with Wi-Fi off
```
The API key stays server-side and never reaches the browser.

## Honest scope
- On-device counting covers objects the detector recognises (TVs, laptops, chairs, people…). Sewing machines and land aren't object-detection problems — they'd need other modalities.
- The verdict is a deterministic rule over **real** detections (explainable); Gemma adds reasoning + conversational follow-up when loaded.

## Impact
Field verification for **financial inclusion** across low-connectivity India — offline-first, works in the field agent's own language, and catches fraud at the source.

_Built with the Gemini Live API, Gemma 4 (on-device via MediaPipe), and WebGPU. AI-assisted development._
