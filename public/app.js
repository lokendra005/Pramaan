/**
 * app.js — landing → live wiring.
 * Pick a scenario (office = should verify, tailoring = should flag), Start (user gesture for
 * mic/cam/audio), stream camera + mic to the proxy, play the model's audio, render bilingual
 * captions, and slam a VERIFIED (green) or FLAG (red) card when the agent decides.
 */
import { startMic } from "./audio-in.js";
import { AudioOut } from "./audio-out.js";
import { startCamera } from "./video-in.js";

const $ = (id) => document.getElementById(id);
let ws, mic, cam, audioOut, running = false, cardTimer;
let scenario = "office";
let customClaim = null;   // set when the user adds a custom Live case

const setStatus = (t) => { $("status").textContent = t; console.log("[status]", t); };
window.addEventListener("error", (e) => setStatus("⚠ JS error: " + e.message));
window.addEventListener("unhandledrejection", (e) => setStatus("⚠ " + (e.reason?.message || e.reason)));

function setOnAir(on) {
  const el = $("onair");
  el.classList.toggle("live", on);
  el.innerHTML = `<span class="dot"></span> ${on ? "LIVE" : "STANDBY"}`;
}

// ---- screen navigation (home → live menu → stage) ----
const SCREENS = ["home", "liveMenu", "stage"];
function showScreen(id) { SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id)); }
function showHome() { if (running) stop(); showScreen("home"); }
function showLiveMenu() { showScreen("liveMenu"); }
function pickLive(s) {
  scenario = s; customClaim = null;
  const labels = { office: "Office check", tailoring: "Workshop check", eventhall: "Event hall check" };
  $("scenarioLabel").textContent = labels[s] || "Live check";
  showScreen("stage");
}
function toggleLiveAdd() { $("liveAddForm").hidden = !$("liveAddForm").hidden; }
function addLiveCase() {
  const claim = $("liveClaim").value.trim();
  if (!claim) return;
  customClaim = claim;
  $("scenarioLabel").textContent = "Custom check";
  showScreen("stage");
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const q = customClaim ? `claim=${encodeURIComponent(customClaim)}` : `scenario=${encodeURIComponent(scenario)}`;
  ws = new WebSocket(`${proto}://${location.host}/?${q}`);
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = (e) => { setOnAir(false); setStatus(`Disconnected (code ${e.code}${e.reason ? " " + e.reason : ""})`); };
  ws.onerror = () => setStatus("⚠ WS connection error");
  return new Promise((res) => (ws.onopen = res));
}

async function start() {
  if (running) return;
  running = true;
  $("startBtn").hidden = true;
  $("stopBtn").hidden = false;
  try {
    audioOut = new AudioOut(24000);
    audioOut.resume();
    setStatus("Connecting to server…");
    await connect();
    setStatus("Starting camera…");
    cam = await startCamera($("cam"), (b64) => send({ t: "video", b64 }), 1);
    setStatus("Starting microphone…");
    mic = await startMic((b64) => send({ t: "audio", b64 }));
    setOnAir(true);
    setStatus("Live — point at the room and speak");
  } catch (e) {
    setStatus("⚠ " + (e?.message || e));
    running = false;
    $("startBtn").hidden = false;
    $("stopBtn").hidden = true;
  }
}

function stop() {
  running = false;
  mic?.stop(); cam?.stop(); audioOut?.stop();
  try { ws?.close(); } catch { /* ignore */ }
  setOnAir(false);
  hideCards();
  $("captions").innerHTML = "";
  $("startBtn").hidden = false;
  $("stopBtn").hidden = true;
  showScreen("home");   // back to the mode chooser
}

function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function handle(m) {
  switch (m.t) {
    case "claim":
      $("claimbar").innerHTML = `<b>Claim under check:</b> ${m.text}`;
      if (m.label) $("scenarioLabel").textContent = m.label;
      break;
    case "ready": setStatus("Live"); break;
    case "audio": audioOut?.play(m.b64); break;
    case "transcript": caption(m.role, m.text); break;
    case "flag": showCard("flag", m.reason); break;
    case "verified": showCard("verified", m.reason); break;
    case "interrupted": audioOut?.stop(); break;
    case "error": setStatus("⚠ " + m.message); break;
  }
}

function caption(role, text) {
  const box = $("captions");
  const el = document.createElement("div");
  el.className = "cap " + (role === "model" ? "model" : "user");
  el.innerHTML = `<span class="who">${role === "model" ? "PRAMAAN" : "YOU"}</span>${text}`;
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
}

function hideCards() { $("flag").classList.remove("show"); $("verified").classList.remove("show"); }

function showCard(kind, reason) {
  hideCards();
  const el = $(kind);
  $(kind === "flag" ? "flagBody" : "verifiedBody").textContent = reason;
  el.classList.add("show");
  navigator.vibrate?.(kind === "flag" ? [60, 40, 60] : [30]);
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => el.classList.remove("show"), 7000);
}

$("startBtn").addEventListener("click", start);
$("stopBtn").addEventListener("click", stop);

// expose navigation for inline onclick handlers
Object.assign(window, { showHome, showLiveMenu, pickLive, stop, toggleLiveAdd, addLiveCase });
