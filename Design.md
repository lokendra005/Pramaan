# Pramaan Live — Design

Real-time field-verification copilot on the **Gemini Live API** (Problem Statement 1).
It watches a live camera feed and listens to a loan officer ↔ shopkeeper conversation,
bridges Hindi↔English so they can talk, and **proactively flags anything that contradicts
the loan claim** — the fraud catch is the product; translation is the enabler.

## Architecture
```
Browser (mic + camera + audio playback + UI)
   │  keyless WebSocket (ws://localhost)
   ▼
Node proxy  (server.mjs)  — holds the API key (.env), one Live session per client
   │  @google/genai  ai.live.connect  (live-session.mjs)
   ▼
Gemini Live API  (gemini-3.1-flash-live-preview)
```
The key never reaches the browser. The proxy also isolates the (preview, drift-prone) Live
message shapes in one file.

## Files
| File | Responsibility |
|---|---|
| `config.mjs` | all knobs: models, audio rates, the staged CLAIM, flag keywords, system instruction |
| `live-session.mjs` | one Gemini Live session; send audio/video/text; parse model events |
| `server.mjs` | static host + keyless browser WS proxy; relays both directions |
| `public/pcm-worklet.js` | mic → 16 kHz PCM16 chunks (off main thread) |
| `public/audio-in.js` | capture mic, base64 the PCM, emit chunks |
| `public/audio-out.js` | play 24 kHz PCM gaplessly; `stop()` = barge-in |
| `public/video-in.js` | rear camera → 1 fps JPEG frames |
| `public/app.js` | wiring + captions + FLAG card |

## Browser ⇄ proxy protocol
- up: `{t:"audio",b64}` `{t:"video",b64}` `{t:"text",text}`
- down: `{t:"ready"}` `{t:"claim",text}` `{t:"audio",b64}` `{t:"transcript",role,text}` `{t:"flag",reason}` `{t:"interrupted"}` `{t:"error",message}`

## Run
```
cp .env.example .env      # paste your Tier-3 key
npm install
npm start                 # http://localhost:8790  (Chrome, allow mic + camera)
```

## Definition of Done (Gate 1)
Point the camera at the staged scene (board "Meena **Tailoring**", claim "Meena **Textiles**,
**4** machines", scene shows **1**) → the agent, unprompted, speaks the discrepancy in both
languages and a red FLAG card slams in. Recorded.

## Known preview caveats
- Live field names drift by SDK version — all sends/parses are isolated in `live-session.mjs`;
  confirm against the Gemini cookbook if audio/video doesn't flow.
- New models throw 503 under load — retry, or fall back to a recorded demo.
- Desktop Chrome honours a 16 kHz AudioContext; Safari may not (use Chrome for the demo).

## Roadmap (narrate, don't build today)
- Offline pre-triage on **Gemma 4 on-device** (special prize) — reuses the Pramaan agent loop.
- Escalation to a cloud **Managed Agent (iAPI)** when confidence is low.
