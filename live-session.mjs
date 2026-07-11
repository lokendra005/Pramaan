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

  const turn = { text: "" }; // accumulates the model's transcript for THIS turn

  const session = await ai.live.connect({
    model: LIVE_MODEL,
    config,
    callbacks: {
      onopen: () => { log("open"); emit({ t: "ready" }); },
      onmessage: (m) => handleMessage(m, emit, turn),
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
function handleMessage(m, emit, turn) {
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
      if (p?.text) { turn.text += " " + p.text; emit({ t: "transcript", role: "model", text: p.text }); }
    }
    if (!sawAudio && m?.data && typeof m.data === "string") emit({ t: "audio", b64: m.data });

    // 2) Transcriptions (captions) — accumulate the MODEL's into the turn buffer
    const outT = sc?.outputTranscription?.text || sc?.output_transcription?.text;
    if (outT) { turn.text += " " + outT; emit({ t: "transcript", role: "model", text: outT }); }
    const inT = sc?.inputTranscription?.text || sc?.input_transcription?.text;
    if (inT) emit({ t: "transcript", role: "user", text: inT });

    // 3) Barge-in — drop the half-spoken turn
    if (sc?.interrupted) { emit({ t: "interrupted" }); turn.text = ""; }

    // 4) Turn finished → classify the WHOLE accumulated line, once. Handles fragmented
    //    transcripts (e.g. "Verif" + "ied:") that per-chunk matching always missed.
    if (sc?.turnComplete || sc?.generationComplete) {
      classifyTurn(turn.text, emit);
      turn.text = "";
    }
  } catch (e) {
    log("parse error", e?.message);
  }
}

/** Decide VERIFIED (green) vs FLAG (red) from the full turn. Prefix-first so a benign
 *  phrase can't false-flag; conservative flag keywords; broad verify fallback. */
function classifyTurn(text, emit) {
  const t = (text || "").trim().toLowerCase();
  if (!t) return;
  const clean = (s) => text.replace(/^\s*(flag|verified)\s*[:\-]?\s*/i, "").trim();

  if (t.startsWith("flag")) return void emit({ t: "flag", reason: clean() });
  if (t.startsWith("verified")) return void emit({ t: "verified", reason: clean() });

  // fallbacks when the model forgot the prefix — verify first (affirmative), then only
  // UNAMBIGUOUS flag words (dropped "does not match": it appears in verified negations).
  if (/verif|consistent with|matches the claim|checks out|confirmed|active office/.test(t))
    return void emit({ t: "verified", reason: text.trim() });
  if (/discrepanc|mismatch|contradict|no sewing|not a (workshop|tailor|shop|store)/.test(t))
    return void emit({ t: "flag", reason: text.trim() });
}
