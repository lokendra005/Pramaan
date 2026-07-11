/**
 * Central config — models, audio, and the two demo SCENARIOS.
 *
 * Demo design: you point the camera at the SAME real office for both.
 *  - "office"    → the claim matches what the camera sees  → agent VERIFIES.
 *  - "tailoring" → the claim (sewing-machine workshop) does NOT match an office → agent FLAGS.
 * Running both, in the same room, proves the agent verifies against the claim — it isn't scripted.
 */

// --- Models (confirm exact preview ids against your provisioned account) ---
export const LIVE_MODEL = "gemini-3.1-flash-live-preview";
export const TRANSLATE_MODEL = "gemini-3.5-live-translate-preview";

// --- Audio formats the Live API expects/produces ---
export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;
export const VIDEO_FPS = 1;

// --- The two scenarios ---
export const SCENARIOS = {
  office: {
    label: "Office workspace",
    sub: "Should VERIFY — point at the room you're in",
    claim: "₹5 lakh working-capital loan. Applicant claims an active office: staffed desks with laptops and people working on-site.",
    expectPass: true,
  },
  tailoring: {
    label: "Garment workshop (Meena Tailoring)",
    sub: "Should FLAG — no sewing machines here",
    claim: "Working-capital loan. Applicant claims 'Meena Tailoring' — a garment workshop with 4 industrial sewing machines and rolls of fabric on site.",
    expectPass: false,
  },
};

export function getScenario(id) {
  return SCENARIOS[id] || SCENARIOS.office;
}

// --- Keyword hooks for the UI cards (model is also told to prefix its lines) ---
export const FLAG_KEYWORDS = ["flag", "discrepancy", "mismatch", "does not match", "doesn't match", "cannot see", "don't see", "no sewing", "not a "];
export const VERIFY_KEYWORDS = ["verified", "consistent with", "matches the claim", "confirmed"];

// --- Build the brain for a chosen claim ---
export function makeSystemInstruction(claim) {
  return `
You are Pramaan, a real-time field-verification copilot for loan officers in India.
You watch a live camera feed of a business premises and hear a conversation between a loan
officer (English) and a person on site (may speak Hindi).

The loan application claims: "${claim}".

Continuously and PROACTIVELY, without being asked:
1. Briefly translate between English and Hindi so both people understand each other.
2. Watch the video and compare it against the claim.
   - If what you see is CONSISTENT with the claim, say ONE crisp line starting with "Verified:"
     naming the evidence — e.g. "Verified: active office — staffed desks and laptops on site."
   - The MOMENT you see something that CONTRADICTS the claim, say ONE crisp line starting with
     "Flag:" citing what you see — e.g. "Flag: this is an office, not a tailoring workshop — no
     sewing machines." Then repeat it once in Hindi.
   - Keep each Verified/Flag line under 15 words: confident, specific, no hedging.
3. Keep all spoken responses short and natural; the officer is standing on site.
4. If the view is unclear, ask for a better angle. Never guess.
5. You never approve or reject the loan. You verify or flag for a human to review.
`.trim();
}
