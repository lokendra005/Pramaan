/**
 * server.mjs
 * ----------
 * One process:
 *   1. Serves the browser client (public/) over http://localhost:PORT
 *   2. Exposes a KEYLESS WebSocket the browser talks to. For each browser socket it opens a
 *      Gemini Live session (key from .env, server-side only) and relays both directions.
 *
 * Browser → server messages:  {t:"audio",b64} | {t:"video",b64} | {t:"text",text}
 * Server → browser messages:  {t:"ready"} | {t:"audio",b64} | {t:"transcript",role,text}
 *                             | {t:"flag",reason} | {t:"interrupted"} | {t:"error",message}
 */
import "dotenv/config";
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { openLiveSession } from "./live-session.mjs";
import { getScenario, makeSystemInstruction } from "./config.mjs";

const PORT = process.env.PORT || 8790;
const KEY = process.env.GEMINI_API_KEY;
const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "public");

if (!KEY) {
  console.error("\n✗ No GEMINI_API_KEY. Copy .env.example → .env and paste your Tier-3 key.\n");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",          // ES modules MUST have a JS MIME
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png",
  ".wasm": "application/wasm",                        // WebAssembly.instantiateStreaming needs this
  ".tflite": "application/octet-stream", ".task": "application/octet-stream",
  ".litertlm": "application/octet-stream", ".bin": "application/octet-stream",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = normalize(join(PUBLIC, p));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404); res.end("Not found"); return;
  }
  const size = statSync(file).size;
  const type = TYPES[extname(file)] || "application/octet-stream";
  const range = req.headers.range;

  // Stream + Range support — required for large model files (hundreds of MB / GB).
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= size) end = size - 1;
    if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); res.end(); return; }
    res.writeHead(206, {
      "Content-Type": type, "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1,
    });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": size });
    createReadStream(file).pipe(res);
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (browser, req) => {
  const u = new URL(req.url, "http://x");
  const claimParam = u.searchParams.get("claim");
  // A typed custom claim overrides the preset — this is Live's "add a case".
  const scenario = claimParam
    ? { label: "Custom claim", claim: claimParam }
    : getScenario(u.searchParams.get("scenario") || "office");
  console.log(`[ws] browser connected · ${claimParam ? "custom claim" : "scenario=" + (u.searchParams.get("scenario") || "office")}`);
  const emit = (msg) => { if (browser.readyState === 1) browser.send(JSON.stringify(msg)); };

  let live;
  try {
    live = await openLiveSession(KEY, emit, makeSystemInstruction(scenario.claim));
    emit({ t: "claim", text: scenario.claim, label: scenario.label });   // show it in the UI
    // Seed the conversation with the claim so the model has something to verify against.
    live.sendText(`Loan application under verification: ${scenario.claim}. Begin assisting the officer.`);
  } catch (e) {
    emit({ t: "error", message: "Live connect failed: " + (e?.message || e) });
    return;
  }

  browser.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.t === "audio") live.sendAudio(msg.b64);
    else if (msg.t === "video") live.sendVideo(msg.b64);
    else if (msg.t === "text") live.sendText(msg.text);
  });

  browser.on("close", () => { console.log("[ws] browser closed"); live?.close(); });
  browser.on("error", () => live?.close());
});

server.listen(PORT, () => {
  console.log(`\n  Pramaan Live → http://localhost:${PORT}\n  (open in Chrome, allow mic + camera)\n`);
});
