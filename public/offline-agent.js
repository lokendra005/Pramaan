/**
 * offline-agent.js — the local-first agent loop for the Gemma special prize.
 * Runs entirely on-device (airplane mode): DECIDE → ACT → SENSE → CHECK → recover/defer.
 *
 * `judge(expectation, observation)` is injected: real Gemma-on-device when the model is loaded,
 * a deterministic local reasoner otherwise. The AGENCY (state, recovery, deferral) is here and
 * needs no network either way.
 *
 * Returns { decision: "VERIFIED" | "DEFER", reason, results }.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 2;

export async function runTriage(scenario, judge, emit, delay = 550) {
  const log = (phase, msg) => { emit({ t: "trace", phase, msg }); };
  const results = [];

  log("DECIDE", `goal: pre-triage "${scenario.claim}" offline, on-device`);

  for (const aspect of scenario.aspects) {
    let attempt = 0, verdict = null, obs = aspect.observation, reason = "";
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      await sleep(delay);
      log("ACT", `capture: ${aspect.title}`);
      await sleep(delay);
      log("SENSE", `observed: ${obs}`);
      const j = await judge(aspect.expectation, obs);   // Gemma or local reasoner
      await sleep(delay);
      log("CHECK", `expected ${aspect.expectation} → ${j.matches ? "consistent" : "does not match"} (${j.quality})`);
      reason = j.reason;

      if (j.quality === "poor" && attempt < MAX_ATTEMPTS) {
        log("DECIDE", `re-capture ${aspect.title} — image unclear, local recovery`);
        obs = aspect.retryObservation || obs;   // simulate a better second capture
        continue;
      }
      verdict = j.quality === "poor" ? "LOW_QUALITY" : (j.matches ? "MATCH" : "MISMATCH");
      break;
    }
    results.push({ title: aspect.title, verdict, reason });
  }

  // Conclude locally — verify, or defer to a human. Never auto-approve on doubt.
  const bad = results.filter((r) => r.verdict !== "MATCH");
  await sleep(delay);
  if (bad.length === 0) {
    log("DECIDE", "all evidence consistent → VERIFIED locally");
    return { decision: "VERIFIED", reason: "All on-site evidence matched the claim.", results };
  }
  const first = bad[0];
  const why = first.verdict === "LOW_QUALITY"
    ? `${first.title}: could not verify offline`
    : `${first.title}: ${first.reason}`;
  log("DECIDE", `defer to human — ${why}`);
  return { decision: "DEFER", reason: why, results };
}
