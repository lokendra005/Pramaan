/**
 * live-session.mjs
 * ----------------
 * Wraps ONE Gemini Live API session (via @google/genai) for a single browser client.
 * The API key stays here on the server — the browser never sees it.
 *
 * Responsibilities:
 *  - open a Live session with our system instruction + audio+video config
 *  - forward mic audio / camera frames FROM the browser TO the model
 *  - parse model messages (audio out, transcripts, interruptions) and hand them to `emit`
 *
 * NOTE: the Live API is a preview surface and field names drift between SDK versions.
 * Every send/parse is wrapped defensively and logged, and the shapes are isolated here so
 * you can adjust in ONE place against the cookbook if something is off.
 */
import { GoogleGenAI, Modality } from "@google/genai";
import { LIVE_MODEL, INPUT_SAMPLE_RATE, FLAG_KEYWORDS, VERIFY_KEYWORDS } from "./config.mjs";

const log = (...a) => console.log("[live]", ...a);

export async function openLiveSession(apiKey, emit, systemInstruction) {
  const ai = new GoogleGenAI({ apiKey });

  const config = {
    responseModalities: [Modality.AUDIO],
    systemInstruction,
    // Ask for transcripts so we can show captions + detect FLAG events in the UI.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
  log("connecting", LIVE_MODEL);

  const session = await ai.live.connect({
    model: LIVE_MODEL,
    config,
    callbacks: {
      onopen: () => { log("open"); emit({ t: "ready" }); },
      onmessage: (m) => handleMessage(m, emit),
      onerror: (e) => { log("error", e?.message || e); emit({ t: "error", message: String(e?.message || e) }); },
      onclose: (e) => { log("close", e?.reason || ""); emit({ t: "closed" }); },
    },
  });

  return {
    /** 16 kHz PCM16 mic chunk (base64). */
    sendAudio(b64) {
      try {
        session.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` } });
      } catch (e) { log("sendAudio failed", e?.message); }
    },
    /** JPEG camera frame (base64). */
    sendVideo(b64) {
      try {
        session.sendRealtimeInput({ video: { data: b64, mimeType: "image/jpeg" } });
      } catch (e) { log("sendVideo failed", e?.message); }
    },
    /** Optional typed text (e.g. the officer's claim/opening line). */
    sendText(text) {
      try {
        session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
      } catch (e) { log("sendText failed", e?.message); }
    },
    close() { try { session.close(); } catch { /* ignore */ } },
  };
}

/** Parse a Live server message into our tiny browser protocol. Forgiving by design. */
function handleMessage(m, emit) {
  try {
    const sc = m?.serverContent;
    let sawAudio = false; // emit each audio chunk ONCE (double-emit = stutter/echo)

    // 1) Audio out + text parts from the model's turn
    const parts = sc?.modelTurn?.parts || [];
    for (const p of parts) {
      const inline = p?.inlineData || p?.inline_data;
      if (inline?.data && String(inline.mimeType || inline.mime_type || "").includes("audio")) {
        emit({ t: "audio", b64: inline.data });
        sawAudio = true;
      }
      if (p?.text) emitTranscript(p.text, "model", emit);
    }

    // 2) Fallback ONLY if the turn parts didn't already carry the audio.
    if (!sawAudio && m?.data && typeof m.data === "string") emit({ t: "audio", b64: m.data });

    // 3) Transcriptions (captions)
    const outT = sc?.outputTranscription?.text || sc?.output_transcription?.text;
    if (outT) emitTranscript(outT, "model", emit);
    const inT = sc?.inputTranscription?.text || sc?.input_transcription?.text;
    if (inT) emit({ t: "transcript", role: "user", text: inT });

    // 4) Barge-in / interruption
    if (sc?.interrupted) emit({ t: "interrupted" });
  } catch (e) {
    log("parse error", e?.message);
  }
}

/** Model transcript → caption, and raise a FLAG (red) or VERIFIED (green) card. */
function emitTranscript(text, role, emit) {
  emit({ t: "transcript", role, text });
  const low = text.trim().toLowerCase();
  // Prefixes the model is instructed to use take priority; keywords are the fallback.
  if (low.startsWith("flag") || FLAG_KEYWORDS.some((k) => low.includes(k))) {
    emit({ t: "flag", reason: text.replace(/^flag:\s*/i, "").trim() });
  } else if (low.startsWith("verified") || VERIFY_KEYWORDS.some((k) => low.includes(k))) {
    emit({ t: "verified", reason: text.replace(/^verified:\s*/i, "").trim() });
  }
}
