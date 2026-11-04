// Pure business logic (design §5). No I/O, no framework. Every scope rule lives here once.

export interface Limits {
  maxFeedbacksPerAsana: number;
  regOtpLifetimeLimit: number;
  loginFailLimit: number;
  loginLockHours: number;
  maxDevicesPerUser: number;
  otpExpiryMinutes: number;
  voiceWindowSeconds: number;
  sessionMaxDevices: number;
  minSteps: number;
  maxSteps: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxFeedbacksPerAsana: 3,
  regOtpLifetimeLimit: 3,
  loginFailLimit: 3,
  loginLockHours: 6,
  maxDevicesPerUser: 3,
  otpExpiryMinutes: 10,
  voiceWindowSeconds: 10,
  sessionMaxDevices: 3,
  minSteps: 2,
  maxSteps: 12,
};

// ---------- search.rules (A4): diacritics + transliteration variants ----------
const DIACRITIC_MAP: Record<string, string> = {
  "ā": "a", "ī": "i", "ū": "u", "ṛ": "ri", "ṝ": "ri", "ḷ": "l",
  "ṣ": "s", "ś": "s", "ṭ": "t", "ḍ": "d", "ṇ": "n", "ṅ": "n", "ñ": "n",
  "ḥ": "h", "ṃ": "m", "é": "e", "è": "e",
};

export function normalizeName(input: string): string {
  let s = (input || "").toLowerCase().normalize("NFC");
  s = [...s].map((c) => DIACRITIC_MAP[c] ?? c).join("");
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  // transliteration variants: vrk -> vrik, etc. Produce a canonical key that
  // collapses common Sanskrit romanisation differences.
  s = s.replace(/vriksh/g, "vrks").replace(/vriks/g, "vrks").replace(/vrksh/g, "vrks");
  s = s.replace(/sh/g, "s").replace(/chh/g, "ch").replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u");
  s = s.replace(/ck/g, "k").replace(/ph/g, "f");
  return s.replace(/\s+/g, "");
}

export function nameMatches(query: string, candidate: string): boolean {
  const q = normalizeName(query);
  if (!q) return true;
  const c = normalizeName(candidate);
  return c.includes(q) || q.includes(c);
}

// ---------- voice.rules: matcher ported from POC/g_voice/matcher.py ----------
const ACCEPTED: Array<{ label: string; tokens: string[] }> = [
  { label: "let us start", tokens: ["let", "us", "start"] },
  { label: "let's start", tokens: ["lets", "start"] },
  { label: "let's start", tokens: ["let", "s", "start"] },
  { label: "i'm ready", tokens: ["i", "m", "ready"] },
  { label: "i'm ready", tokens: ["im", "ready"] },
  { label: "i'm ready", tokens: ["i", "am", "ready"] },
  { label: "ready", tokens: ["ready"] },
];
const NEGATIONS = new Set(["not", "no", "never", "dont", "don"]);

export function normalizeVoice(text: string): string[] {
  const t = (text || "").toLowerCase().replace(/’/g, "'");
  const cleaned = t.replace(/[^a-z' ]+/g, " ");
  const out: string[] = [];
  for (const w of cleaned.split(/\s+/)) {
    if (!w) continue;
    if (w.includes("'")) out.push(...w.split("'").filter(Boolean));
    else out.push(w);
  }
  return out;
}

function containsPhrase(tokens: string[], phrase: string[]): number {
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((p, j) => tokens[i + j] === p)) return i;
  }
  return -1;
}

export interface VoiceMatch { matched: boolean; phrase: string | null; tokens: string[] }

export function matchReady(text: string): VoiceMatch {
  const tokens = normalizeVoice(text);
  if (!tokens.length) return { matched: false, phrase: null, tokens };
  for (const { label, tokens: phrase } of ACCEPTED) {
    const start = containsPhrase(tokens, phrase);
    if (start < 0) continue;
    const window = tokens.slice(Math.max(0, start - 2), start);
    if (window.some((w) => NEGATIONS.has(w))) return { matched: false, phrase: null, tokens };
    return { matched: true, phrase: label, tokens };
  }
  return { matched: false, phrase: null, tokens };
}

// ---------- auth.rules ----------
export interface RegOtpDecision { allowed: boolean; reason: "ok" | "permanently_blocked"; newCount: number }
export function decideRegOtp(currentCount: number, blocked: boolean, limits: Limits): RegOtpDecision {
  if (blocked || currentCount >= limits.regOtpLifetimeLimit) {
    return { allowed: false, reason: "permanently_blocked", newCount: currentCount };
  }
  return { allowed: true, reason: "ok", newCount: currentCount + 1 };
}

export type LoginFailOutcome = "retry" | "locked" | "permanently_blocked";
export function onLoginFail(failCount: number, lockCount: number, limits: Limits): { outcome: LoginFailOutcome; newFailCount: number; newLockCount: number; lockHours: number } {
  const nf = failCount + 1;
  if (nf >= limits.loginFailLimit) {
    const nl = lockCount + 1;
    if (nl >= 2) return { outcome: "permanently_blocked", newFailCount: 0, newLockCount: nl, lockHours: 0 };
    return { outcome: "locked", newFailCount: 0, newLockCount: nl, lockHours: limits.loginLockHours };
  }
  return { outcome: "retry", newFailCount: nf, newLockCount: lockCount, lockHours: 0 };
}

export function admitDevice(activeSessions: number, limits: Limits): boolean {
  return activeSessions < limits.maxDevicesPerUser;
}

// ---------- asana.rules: state machine (scope §11) ----------
export type AsanaState = "active" | "disabled" | "pending" | "rejected" | "public";
export type AsanaAction = "disable" | "enable" | "submit" | "withdraw" | "approve" | "reject" | "practise";
const TRANSITIONS: Record<AsanaAction, Partial<Record<AsanaState, AsanaState>>> = {
  disable: { active: "disabled", pending: "disabled" },
  enable: { disabled: "active" },
  submit: { active: "pending" },
  withdraw: { pending: "active" },
  approve: { pending: "public" },
  reject: { pending: "rejected" },
  practise: { active: "active", pending: "pending", public: "public" },
};
export function transitionAsana(state: AsanaState, action: AsanaAction): { ok: boolean; next: AsanaState; error?: string } {
  // Rejected asanas cannot be edited or resubmitted (scope §11.3): no transitions except none.
  if (state === "rejected") return { ok: false, next: state, error: "A rejected asana cannot be edited or resubmitted. Disable it and create a new asana." };
  const next = TRANSITIONS[action][state];
  if (!next) return { ok: false, next: state, error: `Cannot ${action} an asana in state ${state}.` };
  return { ok: true, next };
}
export function canPractise(state: AsanaState): boolean {
  return state === "active" || state === "pending" || state === "public";
}

// ---------- feedback.rules ----------
export function feedbackAllowed(used: number, limits: Limits): boolean {
  return used < limits.maxFeedbacksPerAsana;
}
/** Intent heuristic used when no AI key is configured; AI provider replaces/augments this. */
export function intentCheckHeuristic(feedback: string): { ok: boolean; reason: string; badLine?: string } {
  const lines = feedback.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, reason: "Feedback is empty." };
  const nonCorrection = /\b(price|cost|buy|sell|poem|song|joke|password|http|www\.|email me|phone)\b/i;
  for (const line of lines) {
    if (nonCorrection.test(line)) return { ok: false, reason: `Line is not a correction request about the asana pose: "${line}"`, badLine: line };
  }
  return { ok: true, reason: "All lines are correction requests." };
}

// ---------- session.rules ----------
export const CAPTURE_LEAD_MS = 400;
export const CAPTURES_PER_STEP = 3;
export const CAPTURE_GAP_MS = 3000;
export const COUNT_GAP_MS = 1000;
export type RoleStrategy = "auto-first";
export function firstPrimaryStrategy(): RoleStrategy { return "auto-first"; }
/** Best-set selection contract: picks the set with most devices present; ties -> earliest. */
export function pickBestSet(sets: Array<{ set: number; deviceIds: string[] }>): number {
  let best = sets[0];
  for (const s of sets) if (s.deviceIds.length > (best?.deviceIds.length ?? -1)) best = s;
  return best ? best.set : 1;
}

// ---------- framing.rules ----------
export interface FrameLandmarks { head: boolean; leftHand: boolean; rightHand: boolean; leftFoot: boolean; rightFoot: boolean }
export function isFullyInView(lm: FrameLandmarks): boolean {
  return lm.head && lm.leftHand && lm.rightHand && lm.leftFoot && lm.rightFoot;
}

// ---------- history.rules: allowlist ----------
export const HISTORY_FIELDS = ["date", "asanaId", "asanaName", "steps"] as const;
export const HISTORY_STEP_FIELDS = ["n", "verdict", "correctionText", "annotatedKey", "marks"] as const;
export function assertHistoryShape(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (!(HISTORY_FIELDS as readonly string[]).includes(k)) throw new Error(`Forbidden history field: ${k}`);
  }
}

// ---------- admin step editing during creation (C16, admin-only exception to "no manual editing") ----------
export type ImageStatus = "none" | "fresh" | "stale" | "failed";
export interface DraftStep { sid: string; instruction: string; durationS: number; imageKey?: string; imageStatus: ImageStatus; imageNote?: string }

export const canDeleteStep = (count: number, limits: Pick<Limits, "minSteps">) => count - 1 >= limits.minSteps;
export const canAddStep = (count: number, limits: Pick<Limits, "maxSteps">) => count + 1 <= limits.maxSteps;

/** Deletes exactly one step; every other step keeps its text, image and relative order (numbers are positions, so later steps shift up). */
export function deleteStepAt<T extends { sid: string }>(steps: T[], sid: string): T[] { return steps.filter((s) => s.sid !== sid); }
/** Inserts after `afterSid` (null = at the very start). */
export function insertStepAfter<T extends { sid: string }>(steps: T[], afterSid: string | null, step: T): T[] {
  if (afterSid === null) return [step, ...steps];
  const i = steps.findIndex((s) => s.sid === afterSid); if (i < 0) return steps;
  return [...steps.slice(0, i + 1), step, ...steps.slice(i + 1)];
}
export function moveStep<T extends { sid: string }>(steps: T[], sid: string, dir: "up" | "down"): T[] {
  const i = steps.findIndex((s) => s.sid === sid), j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= steps.length) return steps;
  const c = steps.slice(); [c[i], c[j]] = [c[j], c[i]]; return c;
}
/** null = may accept; otherwise the reason the draft cannot be saved yet. */
export function acceptBlockReason(steps: DraftStep[], limits: Pick<Limits, "minSteps" | "maxSteps">): string | null {
  if (steps.length < limits.minSteps) return `An asana needs at least ${limits.minSteps} steps.`;
  if (steps.length > limits.maxSteps) return `An asana can have at most ${limits.maxSteps} steps.`;
  const bad = steps.map((s, i) => ({ s, n: i + 1 })).filter((x) => x.s.imageStatus !== "fresh");
  if (bad.length) return `Step ${bad.map((x) => x.n).join(", ")} ${bad.length > 1 ? "have" : "has"} no up-to-date image (${bad.map((x) => x.s.imageStatus).join(", ")}). Generate or regenerate before saving.`;
  return null;
}
/** Used when no AI key is configured; the AI intent judge augments it. Text must be one plausible pose instruction. */
export function stepTextCheckHeuristic(text: string, maxLen = 400): { ok: boolean; reason: string } {
  const t = (text || "").trim();
  if (t.length < 5) return { ok: false, reason: "Instruction is too short." };
  if (t.length > maxLen) return { ok: false, reason: `Text is too long (max ${maxLen} characters).` };
  if (/\b(price|cost|buy|sell|poem|song|joke|password|http|www\.|email me|phone)\b/i.test(t)) return { ok: false, reason: "This does not look like a yoga pose instruction." };
  return { ok: true, reason: "Looks like a pose instruction." };
}
