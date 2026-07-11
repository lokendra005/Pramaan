/**
 * offline.js — offline, on-device verification agent.
 * Pick (or add) a verification with countable requirements → point the camera → on-device
 * MediaPipe detects & COUNTS the real objects → checks each requirement → VERIFY / DEFER,
 * spoken aloud. Then ask the on-device Gemma follow-up questions about the case.
 *
 * Requirements are count-based over REAL detections (e.g. "3 TVs" → finds 2 → shortfall),
 * so nothing is hardcoded: point it elsewhere / change the count and the verdict changes.
 */
import { initVision, visionReady, detect } from "./vision-web.js";
import { initGemma, isReady as gemmaReady, generate } from "./gemma-web.js";

const $ = (id) => document.getElementById(id);
window.addEventListener("error", (e) => { const s = $("visionStatus"); if (s) s.textContent = "⚠ " + e.message; });
window.addEventListener("unhandledrejection", (e) => { const s = $("visionStatus"); if (s) s.textContent = "⚠ " + (e.reason?.message || e.reason); });

// Objects the on-device detector (COCO/efficientdet) can actually recognise + count.
const DETECTABLE = ["person", "laptop", "tv", "chair", "couch", "book", "bottle", "cup",
  "cell phone", "keyboard", "mouse", "potted plant", "dining table", "clock", "backpack"];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Preset verifications (you can add more in the UI).
let TASKS = [
  { id: "office", name: "SME office loan", claim: "Applicant claims an active, staffed office.",
    requirements: [{ label: "person", min: 1 }] },
  { id: "shop-tv", name: "Sri Electronics — loan for 3 TVs", claim: "Working-capital loan against 3 televisions on the shop floor.",
    requirements: [{ label: "tv", min: 3 }] },
];

let current = null, camStream = null, attempt = 0;
let lastNames = [], lastVerdict = null;
let visionState = "loading", gemmaState = "not-loaded";
let pendingReqs = [];

// ---------------- status ----------------
function refreshStatus() {
  const vis = visionState === "ready" ? "on-device vision READY ✓"
    : visionState === "loading" ? "on-device vision loading…" : "on-device vision unavailable (load once online)";
  const rea = gemmaState === "ready" ? "Gemma follow-up ready ✓"
    : gemmaState === "no-webgpu" ? "Gemma off (WebGPU needed)"
    : gemmaState === "no-model" ? "Gemma off (add model at public/models/gemma4-e2b.task)"
    : gemmaState === "loading" ? "Gemma loading…" : "Gemma off";
  $("visionStatus").textContent = `${vis} · ${rea}`;
  $("visionStatus").className = "off-status " + (visionState === "ready" ? "good" : visionState === "unavailable" ? "warn" : "");
}

// ---------------- task cards (neutral — no pass/fail hints) ----------------
function reqSummary(t) { return t.requirements.map((r) => plural(r.min, r.label)).join(", "); }
function renderTasks() {
  $("taskList").innerHTML = TASKS.map((t) => `
    <button class="scenario ${current && current.id === t.id ? "sel" : ""}" data-id="${t.id}">
      <div class="s-title">${t.name}</div>
      <div class="s-sub">Needs: ${reqSummary(t)}</div>
    </button>`).join("");
  $("taskList").querySelectorAll(".scenario").forEach((b) =>
    b.addEventListener("click", () => selectTask(b.dataset.id)));
}

async function selectTask(id) {
  current = TASKS.find((t) => t.id === id);
  attempt = 0; lastVerdict = null;
  renderTasks();
  $("offClaim").innerHTML = `<b>Claim:</b> ${current.claim} <span class="req-note">(needs ${reqSummary(current)})</span>`;
  $("trace").innerHTML = ""; $("decision").className = "decision"; $("decision").innerHTML = "";
  $("followup").hidden = true; $("answer").textContent = "";
  try { await ensureCamera(); $("capBtn").disabled = false; $("capBtn").textContent = "Capture & verify (offline)"; }
  catch (e) { $("visionStatus").textContent = "⚠ camera: " + e.message; }
}

// ---------------- add-a-verification form ----------------
function initAddForm() {
  $("reqObj").innerHTML = DETECTABLE.map((o) => `<option value="${o}">${o}</option>`).join("");
  $("addToggle").addEventListener("click", () => { $("addForm").hidden = !$("addForm").hidden; });
  $("reqAdd").addEventListener("click", () => {
    const label = $("reqObj").value, min = Math.max(1, parseInt($("reqCount").value, 10) || 1);
    const existing = pendingReqs.find((r) => r.label === label);
    if (existing) existing.min = min; else pendingReqs.push({ label, min });
    renderPendingReqs();
  });
  $("taskSave").addEventListener("click", () => {
    const name = $("taskName").value.trim();
    if (!name || pendingReqs.length === 0) { $("visionStatus").textContent = "⚠ add a name and at least one item"; return; }
    const id = "t" + Date.now();
    TASKS.push({ id, name, claim: name, requirements: pendingReqs.slice() });
    pendingReqs = []; renderPendingReqs();
    $("taskName").value = ""; $("addForm").hidden = true;
    renderTasks(); selectTask(id);
  });
}
function renderPendingReqs() {
  $("reqList").innerHTML = pendingReqs.map((r, i) =>
    `<span class="chip">${plural(r.min, r.label)} <b data-i="${i}">×</b></span>`).join("");
  $("reqList").querySelectorAll("b").forEach((x) =>
    x.addEventListener("click", () => { pendingReqs.splice(+x.dataset.i, 1); renderPendingReqs(); }));
}

// ---------------- camera ----------------
async function ensureCamera() {
  if (camStream) return;
  camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  $("ocam").srcObject = camStream; await $("ocam").play();
}
function grab() {
  const v = $("ocam"), c = document.createElement("canvas");
  c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  return c;
}

// ---------------- decision (count real detections vs requirements) ----------------
function decide(task, names) {
  const results = task.requirements.map((r) => {
    const found = names.filter((n) => n === r.label).length;
    return { ...r, found, met: found >= r.min };
  });
  const short = results.filter((r) => !r.met);
  if (short.length === 0)
    return { decision: "VERIFIED", reason: `Matches the claim — found ${results.map((r) => plural(r.found, r.label)).join(", ")}.`, results };
  const s = short[0];
  return { decision: "DEFER", reason: `Claim needs ${plural(s.min, s.label)}, but only ${s.found} detected on-device.`, results };
}

// ---------------- trace + verdict UI ----------------
function trace(phase, msg) {
  const el = document.createElement("div");
  el.className = "tl"; el.innerHTML = `<span class="tp ${phase}">${phase}</span><span>${msg}</span>`;
  $("trace").appendChild(el); $("trace").scrollTop = $("trace").scrollHeight;
}
function verdict(kind, reason) {
  const d = $("decision");
  d.className = "decision show " + (kind === "VERIFIED" ? "ok" : "defer");
  d.innerHTML = `<div class="d-h">${kind === "VERIFIED" ? "Verified" : "Deferred to a human"}</div><div class="d-b">${reason}</div>`;
  speak(`${kind === "VERIFIED" ? "Verified" : "Deferred to a human"}. ${reason}`);
  lastVerdict = { kind, reason };
  $("followup").hidden = false; // enable the conversational follow-up
}
function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; window.speechSynthesis.speak(u);
}

// ---------------- capture loop ----------------
async function run() {
  if (!current) return;
  attempt++;
  $("capBtn").disabled = true; $("capBtn").textContent = "Analyzing on-device…";
  $("decision").className = "decision";
  trace("ACT", `capture (attempt ${attempt})`);

  let dets = [];
  if (visionReady()) { try { dets = detect(grab()); } catch (e) { trace("CHECK", "vision error: " + e.message); } }
  else { trace("SENSE", "on-device vision not loaded — cannot see the scene"); }
  const names = dets.map((d) => d.name.toLowerCase());
  lastNames = names;
  trace("SENSE", names.length ? `detected: ${[...new Set(names)].map((n) => plural(names.filter((x) => x === n).length, n)).join(", ")}` : "detected: nothing clear");

  if (names.length === 0 && attempt < 2) {
    trace("DECIDE", "frame unclear — re-capture (local recovery)");
    $("capBtn").disabled = false; $("capBtn").textContent = "Re-capture"; return;
  }

  trace("CHECK", `counting against: ${reqSummary(current)}`);
  const out = decide(current, names);
  trace("DECIDE", out.decision === "VERIFIED" ? `verified — ${out.reason}` : `defer to human — ${out.reason}`);
  verdict(out.decision, out.reason);
  attempt = 0; $("capBtn").disabled = false; $("capBtn").textContent = "Capture & verify (offline)";
}

// ---------------- Gemma follow-up (conversational, on-device) ----------------
async function ask() {
  const q = $("askInput").value.trim();
  if (!q) return;
  $("answer").textContent = "…";
  if (!gemmaReady()) { $("answer").textContent = "Load the Gemma model (public/models/gemma4-e2b.task) to chat with the on-device agent."; return; }
  const ctx = `You are Pramaan's on-device verification agent. Case: "${current?.claim}". ` +
    `Camera detected: [${[...new Set(lastNames)].join(", ") || "nothing"}]. Verdict: ${lastVerdict?.kind} — ${lastVerdict?.reason}. ` +
    `Answer the officer's question in at most 2 short sentences. Question: ${q}`;
  try {
    const a = await Promise.race([generate(ctx), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 20000))]);
    $("answer").textContent = a; speak(a);
  } catch { $("answer").textContent = "Gemma was slow to respond — try again."; }
}

// ---------------- boot ----------------
renderTasks();
initAddForm();
$("capBtn").addEventListener("click", run);
$("askBtn").addEventListener("click", ask);
$("askInput").addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });

initVision((s) => { visionState = s; refreshStatus(); });
initGemma((s) => { gemmaState = s; refreshStatus(); if (s === "ready") generate("Reply with OK.").catch(() => {}); });
