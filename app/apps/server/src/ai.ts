import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OBJECTS_DIR, logAiCall } from "./store.js";
import { intentCheckHeuristic, stepTextCheckHeuristic } from "@muse/domain";

// AI provider (design §1.2/A7). All AI calls are server-side only.
// AI_PROVIDER = mock | meta | openrouter   (mock = deterministic offline, zero spend)
//   meta       -> Meta API directly (muse-wonder-1.0, muse-image-1.0 images/edits, muse-voice-transcribe-1.0), key META_API_KEY
//   openrouter -> OpenRouter (meta/muse-wonder, meta/muse-image, meta/muse-voice-transcribe-1.0), key OPENROUTER_API_KEY
// Optional per-feature override: AI_TEXT_PROVIDER / AI_IMAGE_PROVIDER / AI_VOICE_PROVIDER (ignored when AI_PROVIDER=mock).
// Text = steps, intent/alignment/step-text judging AND pose-validation vision. Image = creation step images. Voice = one-shot transcribe.
const BASE = process.env.META_API_BASE || "https://api.meta.ai/v1";   // override is for tests (local stub)
const OR_BASE = () => process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1";
export const aiMode = () => (process.env.AI_PROVIDER || "mock").toLowerCase();
function key() { return (process.env.META_API_KEY || "").trim(); }
function orKey() { return (process.env.OPENROUTER_API_KEY || "").trim(); }
export type Feature = "text" | "image" | "voice";
export type Provider = "meta" | "openrouter" | "mock";
/** Resolved provider for a feature; falls back to mock when that provider's key is missing. */
export function providerFor(f: Feature): Provider {
  const base = aiMode(); if (base === "mock") return "mock";
  const p = (process.env[`AI_${f.toUpperCase()}_PROVIDER`] || "").trim().toLowerCase() || base;
  if (p === "openrouter") return orKey() ? "openrouter" : "mock";
  if (p === "meta") return key() ? "meta" : "mock";
  return "mock";
}
const orModel = (f: Feature) => (process.env[`OPENROUTER_${f.toUpperCase()}_MODEL`] || { text: "meta/muse-wonder", image: "meta/muse-image", voice: "meta/muse-voice-transcribe-1.0" }[f]).trim();
const orVisionModel = () => (process.env.OPENROUTER_VISION_MODEL || orModel("text")).trim();   // pose validation may use a different (e.g. cheaper) vision model
const orHeaders = () => ({ Authorization: `Bearer ${orKey()}`, "Content-Type": "application/json" });
const errCode = async (r: Response) => { try { const e: any = (await r.json())?.error; return String(e?.code ?? e?.type ?? ""); } catch { return ""; } };

type Part = { text: string } | { image: string };
/** One text/vision call on the configured provider. Returns the model's text. Failed calls cost nothing; the provider's reason is kept for the caller. */
async function llm(parts: Part[], purpose: string, o: { vision?: boolean; estUsd?: number; maxTokens?: number; extra?: Record<string, any> } = {}): Promise<string> {
  const p = providerFor("text"); const t0 = Date.now();
  const model = p === "openrouter" ? (o.vision ? orVisionModel() : orModel("text")) : "muse-wonder-1.0";
  const r = p === "openrouter"
    ? await fetch(`${OR_BASE()}/chat/completions`, { method: "POST", headers: orHeaders(), body: JSON.stringify({ model, messages: [{ role: "user", content: parts.map((x) => ("text" in x ? { type: "text", text: x.text } : { type: "image_url", image_url: { url: x.image } })) }], max_tokens: o.maxTokens ?? 1600, reasoning: { effort: "low" } }) })
    : await fetch(`${BASE}/responses`, { method: "POST", headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: parts.map((x) => ("text" in x ? { type: "input_text", text: x.text } : { type: "input_image", image_url: x.image })) }], max_output_tokens: o.maxTokens ?? 1600, reasoning: { effort: "low" }, store: false }) });
  const ms = Date.now() - t0;
  if (!r.ok) { const code = await errCode(r); logAiCall(model, purpose, ms, 0, { mode: "failed", status: r.status, code, provider: p }); throw Object.assign(new Error(`${p} ${r.status}`), { status: r.status, code }); }
  const data: any = await r.json();
  logAiCall(model, purpose, ms, p === "openrouter" && typeof data.usage?.cost === "number" ? data.usage.cost : (o.estUsd ?? 0.02), { provider: p, ...(o.extra || {}) });
  if (p === "openrouter") { const c = data.choices?.[0]?.message?.content; return Array.isArray(c) ? c.map((x: any) => x.text || "").join("\n") : String(c || ""); }
  if (data.output_text) return data.output_text;
  const out: string[] = [];
  for (const o2 of data.output || []) for (const c of o2.content || []) if (c.text) out.push(c.text);
  return out.join("\n");
}
const wonder = (prompt: string, purpose: string, maxTokens?: number) => llm([{ text: prompt }], purpose, { maxTokens });

/** images/edits on the configured image provider (reference image + prompt -> image bytes). Never throws on HTTP errors; the caller logs/decides. */
async function imageEdit(prompt: string, img: Buffer, mime: string, filename: string, size?: string): Promise<{ ok: boolean; status: number; model: string; provider: Provider; bytes?: Buffer; costUsd?: number }> {
  const p = providerFor("image");
  if (p === "openrouter") {
    const model = orModel("image");
    const r = await fetch(`${OR_BASE()}/images`, { method: "POST", headers: orHeaders(), body: JSON.stringify({ model, prompt, ...(size ? { size } : {}), input_references: [{ type: "image_url", image_url: { url: `data:${mime};base64,${img.toString("base64")}` } }] }) });
    if (!r.ok) return { ok: false, status: r.status, model, provider: p };
    const j: any = await r.json(); const it = j.data?.[0] || {}; let bytes: Buffer | undefined;
    if (it.b64_json) bytes = Buffer.from(it.b64_json, "base64"); else if (it.url) { const ir = await fetch(it.url); if (ir.ok) bytes = Buffer.from(await ir.arrayBuffer()); }
    return { ok: true, status: r.status, model, provider: p, bytes, costUsd: typeof j.usage?.cost === "number" ? j.usage.cost : undefined };
  }
  const form = new FormData();
  form.set("model", "muse-image-1.0"); form.set("prompt", prompt); if (size) form.set("size", size);
  form.set("image[0]", new Blob([img as any], { type: mime }), filename);
  const r = await fetch(`${BASE}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form });
  if (!r.ok) return { ok: false, status: r.status, model: "muse-image-1.0", provider: "meta" };
  const j: any = await r.json(); const it = j.data?.[0] || {}; let bytes: Buffer | undefined;
  if (it.b64_json) bytes = Buffer.from(it.b64_json, "base64"); else if (it.url) { const ir = await fetch(it.url); if (ir.ok) bytes = Buffer.from(await ir.arrayBuffer()); }
  return { ok: true, status: r.status, model: "muse-image-1.0", provider: "meta", bytes };
}

export interface GeneratedAsana { steps: Array<{ instruction: string; durationS: number; pose?: string }>; difficulty: string; bodyPart: string; category: string; benefits: string[]; contraindications: string[] }

const KNOWN: Record<string, GeneratedAsana> = {
  bhujangasana: { difficulty: "Beginner", bodyPart: "Back and Spine", category: "Backbend", benefits: ["Strengthens spine", "Opens chest"], contraindications: ["Back injury", "Pregnancy", "Wrist injury"], steps: [
    { instruction: "Lie prone with legs extended, tops of feet on the floor. Place palms under shoulders.", durationS: 15 },
    { instruction: "Press palms gently and lift chest into Cobra, elbows soft, shoulders away from ears.", durationS: 20 },
    { instruction: "Hold, breathe steadily, then lower slowly to the floor.", durationS: 15 }] },
  tadasana: { difficulty: "Beginner", bodyPart: "Full Body", category: "Standing", benefits: ["Improves posture"], contraindications: ["Vertigo"], steps: [
    { instruction: "Stand tall, feet together, arms beside body.", durationS: 15 },
    { instruction: "Raise arms overhead and stretch upward, feet grounded.", durationS: 20 }] },
};

export async function generateSteps(name: string): Promise<GeneratedAsana> {
  if (providerFor("text") !== "mock") {
    const text = await wonder(`Generate yoga asana "${name}" as JSON only: {"steps":[{"instruction":"...","pose":"...","duration_seconds":20}],"difficulty":"...","body_part":"...","category":"...","benefits":["..."],"contraindications":["..."]}. Split into steps by complexity, in the order a student does them, as ONE continuous sequence (each step builds on the previous one).
Rules:
- "instruction" is what the student reads and hears. It must state any position carried over from earlier steps that is still held (for example "keeping your right foot on your left thigh, bring your palms together"), so no step silently drops an earlier position. Do not prefix steps with level labels such as "Beginner:".
- "pose" is a standalone drawing brief for the picture of that step: the COMPLETE body position at the end of the step in plain words — feet/legs (which leg is standing, which is lifted/bent and where its foot rests), hips, torso, both arms and hands, head/gaze. It must repeat every position carried over from previous steps and change only what this step changes. Never refer to other steps in "pose".
- Only the final step may release the pose.
No other text.`, "creation.steps", 5000);
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      return { steps: j.steps.map((s: any) => ({ instruction: String(s.instruction), durationS: Number(s.duration_seconds || 20), pose: s.pose ? String(s.pose).slice(0, 600) : undefined })), difficulty: j.difficulty, bodyPart: j.body_part, category: j.category, benefits: j.benefits || [], contraindications: j.contraindications || [] };
    }
    throw new Error("Model did not return JSON steps");
  }
  const k = name.toLowerCase().replace(/[^a-z]/g, "");
  const base = KNOWN[k] || { difficulty: "Intermediate", bodyPart: "Full Body", category: "General", benefits: ["Builds strength and flexibility", "Improves focus and breathing"], contraindications: ["Joint injury", "Pregnancy", "High blood pressure"], steps: [
    { instruction: `Begin in a comfortable base position and prepare for ${name}. Breathe deeply.`, durationS: 15 },
    { instruction: `Move slowly into the main posture of ${name}, keeping alignment and steady breath.`, durationS: 20 },
    { instruction: `Hold ${name} with control, then release gently and return to the base position.`, durationS: 15 }] };
  logAiCall("mock", "creation.steps", 5, 0, { mode: "mock" });
  return structuredClone(base);
}

function imageGate(bytes: Buffer): string {
  if (bytes.length < 1024) return "fail-too-small";
  const png = bytes[0] === 0x89 && bytes[1] === 0x50; const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const webp = bytes.slice(0, 4).toString() === "RIFF" && bytes.slice(8, 12).toString() === "WEBP";
  return png || jpg || webp ? "pass" : "fail-not-an-image";
}

/** Image prompt for ONE step of a continuous sequence: the picture must keep every position held from earlier steps unless this step changes it. */
export function imagePrompt(instruction: string, stepN: number, ctx: { pose?: string; total?: number; previous?: string[] } = {}): string {
  const prev = (ctx.previous || []).slice(-5).map((t, i, arr) => `${(ctx.previous!.length - arr.length) + i + 1}) ${t.slice(0, 220)}`);
  const lines = [
    "Same character as the reference image: same face, hair, clothes and art style; exactly 1 head, 2 arms, 2 legs.",
    `This is step ${stepN}${ctx.total ? ` of ${ctx.total}` : ""} of ONE continuous yoga sequence, drawn as the same student moving through it.`,
  ];
  if (prev.length) lines.push(`Earlier steps already done (their positions are STILL HELD unless this step explicitly changes them — a raised or bent leg stays raised or bent, a foot stays where it was placed, arms stay as they were):\n${prev.join("\n")}`);
  lines.push(ctx.pose ? `COMPLETE body position to draw in this image: ${ctx.pose}` : `Step instruction to draw (apply it on top of the positions held from earlier steps): ${instruction}`);
  if (ctx.pose && instruction && !instruction.startsWith(ctx.pose.slice(0, 20))) lines.push(`(Student-facing instruction for this step: ${instruction})`);
  lines.push("Show the whole body clearly, front view, standing on a clean plain background.");
  return lines.join("\n");
}

/** images/edits ONLY (A7). Returns the real generated bytes in meta mode
 *  (undefined in mock mode, where the caller copies the character image).
 *  Throws when the automated gate rejects the image, so the caller can
 *  regenerate (≤3 attempts, S3.5). */
export async function generateStepImage(instruction: string, characterImageKey: string, stepN: number, attempt = 1, ctx: { pose?: string; total?: number; previous?: string[] } = {}): Promise<{ mode: string; gate: string; bytes?: Buffer }> {
  if (providerFor("image") !== "mock") {
    const buf = readFileSync(join(OBJECTS_DIR, characterImageKey));
    const t0 = Date.now();
    const x = await imageEdit(imagePrompt(instruction, stepN, ctx), buf, "image/png", "character.png", "1024x1024");
    const purpose = `creation.image.step${stepN}`, cost = x.costUsd ?? 0.01;
    if (!x.ok) { logAiCall(x.model, purpose, Date.now() - t0, 0, { mode: "images/edits", gate: `http-${x.status}`, attempt, provider: x.provider }); throw Object.assign(new Error(`image edit ${x.status}`), { status: x.status }); }
    if (!x.bytes) { logAiCall(x.model, purpose, Date.now() - t0, cost, { mode: "images/edits", gate: "fail-empty-response", attempt, provider: x.provider }); throw new Error("image edit returned no image data"); }
    const gate = imageGate(x.bytes);
    logAiCall(x.model, purpose, Date.now() - t0, cost, { mode: "images/edits", gate, attempt, provider: x.provider });
    if (gate !== "pass") throw new Error(`image gate rejected step image (${gate})`);
    return { mode: "images/edits", gate, bytes: x.bytes };
  }
  logAiCall("mock", `creation.image.step${stepN}`, 5, 0, { mode: "mock-edits", gate: "pass-character-preserved", attempt });
  return { mode: "mock-edits", gate: "pass-character-preserved" };
}

export async function judgeIntent(feedback: string): Promise<{ ok: boolean; reason: string }> {
  if (providerFor("text") !== "mock") {
    try {
      const text = await wonder(`Check each line of this yoga feedback. Every line must be ONLY a correction request about the asana pose. Reply JSON {"ok":true/false,"reason":"..."}. Feedback:\n${feedback}`, "feedback.intent");
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { const j = JSON.parse(m[0]); return { ok: !!j.ok, reason: String(j.reason || "") }; }
    } catch { /* fall through to heuristic */ }
  }
  return intentCheckHeuristic(feedback);
}

/** Admin step editing (C16): is this ONE safe, genuine yoga pose instruction (or image adjustment)? Heuristic first, AI second; any AI failure falls back to the heuristic. */
export async function judgeStepText(text: string): Promise<{ ok: boolean; reason: string }> {
  const h = stepTextCheckHeuristic(text); if (!h.ok) return h;
  if (providerFor("text") !== "mock") {
    try {
      const out = await wonder(`Is the quoted text a single, safe, genuine yoga pose instruction (body positions/movements/breathing for one step of an asana) or a short adjustment to a pose picture? It must not contain unrelated content, advertising, medical claims, or anything dangerous. Reply JSON {"ok":true/false,"reason":"..."}. Text: ${JSON.stringify(text.slice(0, 400))}`, "creation.steptext");
      const m = out.match(/\{[\s\S]*\}/);
      if (m) { const j = JSON.parse(m[0]); return { ok: !!j.ok, reason: String(j.reason || (j.ok ? "Looks like a pose instruction." : "Not a yoga pose instruction.")) }; }
    } catch { /* fall through to heuristic */ }
  }
  return h;
}

export async function judgeAlignment(feedback: string, referenceText: string): Promise<{ ok: boolean; reason: string }> {
  if (providerFor("text") !== "mock") {
    try {
      const text = await wonder(`Does this requested yoga change align with the reference instructions? Reply JSON {"ok":true/false,"reason":"..."}. Reference: ${referenceText}\nChange: ${feedback}`, "feedback.alignment");
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { const j = JSON.parse(m[0]); return { ok: !!j.ok, reason: String(j.reason || "") }; }
    } catch { /* fall through */ }
  }
  // Heuristic alignment: dangerous / reference-contradicting phrases rejected.
  if (/\b(stand on (one leg|head)|eyes closed for|hold.*(10|ten) min|ignore pain|force)\b/i.test(feedback)) {
    return { ok: false, reason: "The requested change is not aligned with the reference book instructions (safety/alignment)." };
  }
  logAiCall("mock", "feedback.alignment", 3, 0, { mode: "mock" });
  return { ok: true, reason: "Aligned with the reference instructions." };
}

/** Pose validation. Meta mode sends the in-memory photos (best set only,
 *  never stored) to the vision model. Any failure → could_not_check,
 *  never a fabricated "correct". Mock mode is deterministic offline. */
export async function validatePose(stepInstruction: string, photos: Buffer[], reference?: Buffer | null): Promise<{ verdict: "correct" | "incorrect" | "could_not_check"; correctionText: string; marks: Array<{ x: number; y: number; r: number; n: number }>; issues?: any[]; checks?: any[]; bestPhoto?: number; sent: { mode: string; referenceIncluded: boolean; photoCount: number } }> {
  const sentInfo = (mode: string, n: number) => ({ mode, referenceIncluded: !!(reference && reference.length), photoCount: n });
  if (!photos.length) return { verdict: "could_not_check", correctionText: "Could not check this step — no photo was captured.", marks: [], sent: sentInfo("none", 0) };
  if (providerFor("text") !== "mock") {
    photos = photos.filter((p) => p.length > 0);
    if (!photos.length) return { verdict: "could_not_check", correctionText: "Could not check this step — no usable photo was captured.", marks: [], sent: sentInfo("none", 0) };
    const t0 = Date.now();
    try {
      const hasRef = !!(reference && reference.length);
      const prompt = `You are a kind, practical yoga teacher checking ONE step of a pose.
Step instruction: "${stepInstruction}"
${hasRef ? "Image 1 is the REFERENCE: the target pose drawn as a character. Images 2.. are photos of the real student holding the pose (one photo per camera angle, all taken at the same moment)." : "The image is a photo of the real student holding the pose."}
How to judge (follow in order):
1. Split the instruction into its separate body-position requirements (e.g. "lying on back", "knees bent", "feet flat hip-width apart", "palms beside ears", "elbows bent", "hips lifted"). Every sentence/clause that names a position is one requirement.
2. For EACH requirement look at the student photos and mark it: "met", "not_met" (visibly different or missing), or "unseen" (cannot be seen in any photo).
3. The student is a real human photographed; the reference is a drawing. Compare body POSITION only, never looks. Be tolerant of exact angles, small asymmetry, foot turn-out of a few degrees, hand spacing, clothing, background, camera angle, image quality.
4. Be strict about WHERE limbs are: if the instruction says hands/palms beside ears and the hands are on the floor by the hips, resting on the body, or anywhere else, that is "not_met". Never skip a requirement because other parts look right.
5. Use the photo where the pose is clearest. If any photo clearly shows a requirement met, it is "met".
6. verdict = "incorrect" if ANY requirement is "not_met". "unseen" does not make it incorrect, but mention it in the correction. Otherwise "correct".
Reply with JSON only, no prose:
{"checks":[{"requirement":"short phrase","status":"met"|"not_met"|"unseen","note":"what you see, max 12 words"}],
 "verdict":"correct"|"incorrect",
 "correction":"plain sentences; for each not_met requirement write its number then the fix, e.g. \"(1) Turn your hands so fingertips point back toward your shoulders. (2) Lift your head off the floor.\" The numbers must match issues[].n. If correct, one short encouragement with no numbers",
 "bestPhoto":<number of the student photo you used, 1 = first student photo>,
 "issues":[{"n":1,"part":"e.g. both palms","problem":"what is wrong, max 8 words","ref":{"x":0.0,"y":0.0,"r":0.08},"photo":{"x":0.0,"y":0.0,"r":0.08}}]}
One issue per not_met requirement, numbered 1,2,3 in order, at most 3 (merge or pick the most important if more). issues is empty when correct. ref = location on the REFERENCE image, photo = the same body part on the student photo you chose; x,y,r are 0..1 relative to that image (r = radius as fraction of width).`;
      const parts: any[] = [{ text: prompt }];
      if (hasRef) parts.push({ image: `data:image/png;base64,${reference!.toString("base64")}` });
      for (const p of photos.slice(0, 6)) parts.push({ image: `data:image/jpeg;base64,${p.toString("base64")}` });
      const text = await llm(parts, "validation.step", { vision: true, estUsd: 0.05, extra: { mode: "vision", photos: photos.length, reference: hasRef } });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("vision returned no JSON verdict");
      const j = JSON.parse(m[0]);
      const checks = Array.isArray(j.checks) ? j.checks.slice(0, 12).map((c: any) => ({ requirement: String(c?.requirement || "").slice(0, 80), status: String(c?.status || ""), note: String(c?.note || "").slice(0, 100) })) : [];
      const verdict = (j.verdict === "incorrect" || checks.some((c: any) => c.status === "not_met")) ? "incorrect" : "correct";
      const clamp = (v: any, lo: number, hi: number, d: number) => (isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
      const issues = (Array.isArray(j.issues) ? j.issues : []).slice(0, 3).map((it: any, idx: number) => ({
        n: idx + 1, part: String(it?.part || "").slice(0, 40), problem: String(it?.problem || "").slice(0, 80),
        ref: it?.ref && isFinite(it.ref.x) ? { x: clamp(it.ref.x, 0, 1, 0.5), y: clamp(it.ref.y, 0, 1, 0.5), r: clamp(it.ref.r, 0.02, 0.3, 0.08) } : null,
        photo: it?.photo && isFinite(it.photo.x) ? { x: clamp(it.photo.x, 0, 1, 0.5), y: clamp(it.photo.y, 0, 1, 0.5), r: clamp(it.photo.r, 0.02, 0.3, 0.08) } : null,
      }));
      const marks = verdict === "correct" ? [] : issues.filter((i: any) => i.ref).map((i: any) => ({ ...i.ref, n: i.n }));
      const bestPhoto = Math.min(photos.length, Math.max(1, Math.round(Number(j.bestPhoto) || 1)));
      return { verdict, correctionText: String(j.correction || (verdict === "correct" ? "Pose matches the instruction. Keep breathing steadily." : "Adjust your pose as noted.")), marks, issues: verdict === "correct" ? [] : issues, checks, bestPhoto, sent: sentInfo(providerFor("text"), photos.length) };
    } catch (e: any) {
      if (!e?.status) logAiCall("validation", "validation.step", Date.now() - t0, 0, { mode: "vision-failed", error: String(e.message || e).slice(0, 80) });   // HTTP failures are already logged by llm()
      return { verdict: "could_not_check", correctionText: "Could not check this step — the validation service was unavailable.", marks: [], sent: sentInfo(`${providerFor("text")}-failed`, photos.length) };
    }
  }
  logAiCall("mock", "validation.step", 5, 0, { mode: "mock", photos: photos.length });
  return { verdict: "correct", correctionText: "MOCK MODE (AI_PROVIDER=mock): nothing was compared — no photo or reference image was sent to any model. Set AI_PROVIDER=meta to really validate.", marks: [], sent: sentInfo("mock", photos.length) };
}

export async function transcribeOneShot(audio: Buffer, opts: { filename?: string; mimetype?: string } = {}): Promise<{ transcript: string; seconds: number }> {
  const t0 = Date.now();
  const vp = providerFor("voice");
  if (vp === "openrouter" && audio.length) {
    const name = (opts.filename || "clip.wav").toLowerCase(), mt = opts.mimetype || "";
    const format = name.endsWith(".webm") || mt.includes("webm") ? "webm" : name.endsWith(".mp3") || mt.includes("mpeg") ? "mp3" : name.endsWith(".ogg") || mt.includes("ogg") ? "ogg" : name.endsWith(".m4a") || mt.includes("mp4") ? "m4a" : name.endsWith(".flac") || mt.includes("flac") ? "flac" : "wav";
    const model = orModel("voice");
    const r = await fetch(`${OR_BASE()}/audio/transcriptions`, { method: "POST", headers: orHeaders(), body: JSON.stringify({ model, input_audio: { data: audio.toString("base64"), format } }) });
    const ms = Date.now() - t0;
    if (!r.ok) { const code = await errCode(r); logAiCall(model, "voice.oneshot", ms, 0, { mode: "failed", status: r.status, code, provider: "openrouter" }); throw Object.assign(new Error(`transcribe ${r.status}`), { status: r.status, code }); }
    const data: any = await r.json();
    logAiCall(model, "voice.oneshot", ms, typeof data.usage?.cost === "number" ? data.usage.cost : 0.00005, { audioEncoding: format, provider: "openrouter" });
    return { transcript: data.text || data.transcript || "", seconds: ms / 1000 };
  }
  if (vp === "meta" && audio.length) {
    // POC-proven request shape (POC/g_voice/server.py): multipart parts
    // "request" (JSON: mode/model/audioEncoding) + "audio" (the clip).
    const name = (opts.filename || "clip.wav").toLowerCase();
    const enc = name.endsWith(".wav") || (opts.mimetype || "").includes("wav") ? "WAV" : name.endsWith(".webm") || (opts.mimetype || "").includes("webm") ? "WEBM" : "WAV";
    const form = new FormData();
    form.set("request", new Blob([JSON.stringify({ mode: "PUSH_TO_TALK", model: "muse-voice-transcribe-1.0", audioEncoding: enc })], { type: "application/json" }));
    form.set("audio", new Blob([audio as any], { type: opts.mimetype || "audio/wav" }), name);
    const r = await fetch(`${BASE}/asr/transcribe`, { method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form });
    const ms = Date.now() - t0;
    logAiCall("muse-voice-transcribe-1.0", "voice.oneshot", ms, 0.00005, { audioEncoding: enc, provider: "meta" });
    if (!r.ok) throw new Error(`transcribe ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    const data: any = await r.json();
    return { transcript: data.transcript || data.text || "", seconds: ms / 1000 };
  }
  logAiCall("mock", "voice.oneshot", Date.now() - t0, 0, { mode: "mock" });
  return { transcript: "", seconds: (Date.now() - t0) / 1000 };
}


/** DEBUG experiment: ask muse-image-1.0 to annotate the student's actual photo
 *  (red circles + short red text labels). Result goes to the user's browser only. */
export async function annotatePhoto(photo: Buffer, issues: Array<{ part: string; problem: string; photo: { x: number; y: number; r: number } | null }>): Promise<Buffer | null> {
  if (providerFor("image") === "mock" || !photo.length || !issues.length) return null;
  const where = (p: any) => (p ? `at about ${Math.round(p.x * 100)}% from the left and ${Math.round(p.y * 100)}% from the top` : "");
  const list = issues.map((it, i) => `${i + 1}. ${it.part} ${where(it.photo)} - label: "${it.problem}"`).join("\n");
  const prompt = `Edit this photo ONLY by drawing annotations on top of it. Do not change the person, pose, clothing, background or framing in any way. For each item below draw a red circle around that body part and write the given short label in red text right next to the circle, in clear readable letters:\n${list}`;
  const t0 = Date.now();
  for (const withSize of [false, true]) {
    const x = await imageEdit(prompt, photo, "image/jpeg", "photo.jpg", withSize ? "1024x1024" : undefined);
    logAiCall(x.model, "validation.annotate", Date.now() - t0, x.ok ? (x.costUsd ?? 0.01) : 0, { mode: "images/edits", http: x.status, withSize, provider: x.provider });
    if (x.ok && x.bytes) return x.bytes;
  }
  return null;
}

/** Turns an AI-provider failure into a clear, safe message. Admins also learn the operational cause; regular users never see billing details. */
export function aiErrorMessage(e: any, forAdmin: boolean): string {
  const status = Number(e?.status || 0), code = String(e?.code || "");
  const or = providerFor("text") === "openrouter";
  if (forAdmin && or && status === 402) return "The AI service rejected the request: OpenRouter has no credits left for this key (402). Add credits at openrouter.ai, or set AI_PROVIDER=mock in app/.env to keep working offline. Nothing was created.";
  if (forAdmin && or && (status === 401 || status === 403)) return "The AI service rejected the API key or region (check OPENROUTER_API_KEY in app/.env). Nothing was created.";
  if (forAdmin && (status === 402 || code.includes("billing"))) return "The AI service rejected the request: Meta billing is not set up for this API key (402 billing_not_configured). Resolve the billing issue in the Meta developer console, or set AI_PROVIDER=mock in app/.env to keep working offline. Nothing was created.";
  if (forAdmin && (status === 401 || status === 403)) return "The AI service rejected the API key (check META_API_KEY in app/.env). Nothing was created.";
  if (status === 429) return "The AI service is busy right now. Please try again in a minute. Nothing was created.";
  return "The AI service is unavailable right now. Please try again later. Nothing was created.";
}
