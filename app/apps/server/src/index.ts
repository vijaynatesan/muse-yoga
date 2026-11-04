import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { WebSocketServer } from "ws";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { loadStore, getDb, save, id, now, hashCode, tokenHash, newToken, audit, logAiCall, OBJECTS_DIR, APP_ROOT, MAIL_DIR } from "./store.js";
import { sendOtpEmail } from "./mailer.js";
import { generateSteps, generateStepImage, judgeIntent, judgeAlignment, judgeStepText, buildPoseBrief, critiqueStepImage, aiErrorMessage, transcribeOneShot, aiMode } from "./ai.js";
import { createRoom, rooms, handleWsMessage, onDeviceDisconnect, broadcast, snapshot } from "./session.js";
import { normalizeName, nameMatches, decideRegOtp, onLoginFail, admitDevice, transitionAsana, canPractise, feedbackAllowed, matchReady, DEFAULT_LIMITS, canDeleteStep, canAddStep, deleteStepAt, insertStepAfter, moveStep, acceptBlockReason } from "@muse/domain";

const HERE = dirname(fileURLToPath(import.meta.url));
// tiny .env loader (no dependency)
const envFile = join(APP_ROOT, ".env");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = line.match(/^([^#=]+)=(.*)$/); if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim(); }

loadStore();
const limits = () => ({ ...DEFAULT_LIMITS, ...getDb().settings });
function admins(): string[] {
  const extra = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);   // test/dev override; empty in normal runs
  try { return [...JSON.parse(readFileSync(join(APP_ROOT, "config/admins.json"), "utf8")).map((e: string) => e.toLowerCase()), ...extra]; } catch { return extra; }
}
const isAdmin = (u: any) => !!u && admins().includes(String(u.email).toLowerCase());

const CERT_PATH = join(APP_ROOT, "certs/cert.pem");
const KEY_PATH = join(APP_ROOT, "certs/key.pem");
const USE_HTTPS = process.env.DISABLE_HTTPS !== "1" && existsSync(CERT_PATH) && existsSync(KEY_PATH);
const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024, ...(USE_HTTPS ? { https: { cert: readFileSync(CERT_PATH), key: readFileSync(KEY_PATH) } } : {}) } as any);
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

// --- security headers / CORS same-origin only (design §2.5)
app.addHook("onRequest", async (req, reply) => {
  // DELETE/GET with no body must not trip the JSON empty-body parser (QA defect D2).
  if (!req.headers["content-length"] || req.headers["content-length"] === "0") delete req.headers["content-type"];
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    try { if (new URL(origin).host !== host) { /* foreign origin: no CORS grant */ } else reply.header("Access-Control-Allow-Origin", origin); } catch {}
  }
});
app.addHook("preHandler", async (req, reply) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.url.startsWith("/auth/otp")) {
    // CSRF: state-changing requests need the csrf cookie echoed in header (SameSite=Lax + token)
    const c = (req as any).cookies?.muse_csrf;
    const h = req.headers["x-csrf-token"];
    // Allow API clients in tests to send the header; browsers get cookie via /auth/session
    if (req.url.startsWith("/api/") && c && h !== c) return reply.code(403).send({ error: "CSRF check failed" });
  }
});

function currentUser(req: any) {
  const raw = req.cookies?.muse_session;
  if (!raw) return null;
  const db = getDb();
  const sess = db.loginSessions.find((s: any) => s.tokenHash === tokenHash(raw) && !s.revokedAt);
  if (!sess) return null;
  if (Date.now() - new Date(sess.lastSeenAt).getTime() > 30 * 24 * 3600 * 1000) return null;
  sess.lastSeenAt = now();
  return db.users.find((u: any) => u.id === sess.userId) || null;
}
function requireUser(req: any, reply: any) { const u = currentUser(req); if (!u) { reply.code(401).send({ error: "Login required" }); return null; } return u; }
function requireAdmin(req: any, reply: any) { const u = requireUser(req, reply); if (!u) return null; if (!isAdmin(u)) { audit(u.email, "admin.denied", req.url); reply.code(403).send({ error: "Admin only" }); return null; } return u; }
const pubAsana = (a: any, user?: any) => ({ id: a.id, name: a.name, characterId: a.characterId, library: a.library, state: a.state, difficulty: a.difficulty, bodyPart: a.bodyPart, category: a.category, benefits: a.benefits, contraindications: a.contraindications, feedbackUsed: a.feedbackUsed, feedbackRemaining: Math.max(0, limits().maxFeedbacksPerAsana - a.feedbackUsed), rejectionReason: a.rejectionReason, submittedByName: a.submittedByName, creatorId: a.creatorId, steps: a.steps, createdAt: a.createdAt, isMine: user ? a.creatorId === user.id : false });

// rate buckets
const buckets = new Map<string, number[]>();
function throttled(key: string, max: number, windowMs: number): boolean {
  const t = Date.now(); const arr = (buckets.get(key) || []).filter((x) => t - x < windowMs);
  arr.push(t); buckets.set(key, arr);
  return arr.length > max;
}

// ---------------- health (booleans only, S11.1)
app.get("/health", async () => ({ ok: true, db: true, redis: true, smtp: true, meta: !!process.env.META_API_KEY, openrouter: !!process.env.OPENROUTER_API_KEY }));
app.get("/api/health", async () => ({ ok: true, db: true, redis: true, smtp: true, meta: !!process.env.META_API_KEY, openrouter: !!process.env.OPENROUTER_API_KEY }));

// ---------------- auth
function issueOtp(email: string, purpose: string) {
  const db = getDb();
  const code = String(randomInt(100000, 999999));
  const salt = id();
  db.otpChallenges.push({ id: id(), email, purpose, codeHash: hashCode(code, salt), salt, expiresAt: new Date(Date.now() + limits().otpExpiryMinutes * 60000).toISOString(), usedAt: null, attempts: 0, createdAt: now() });
  save();
  return code;
}
function verifyOtp(email: string, purpose: string, code: string): "ok" | "bad" | "expired" {
  const db = getDb();
  const ch = [...db.otpChallenges].reverse().find((c: any) => c.email === email && c.purpose === purpose && !c.usedAt);
  if (!ch) return "bad";
  if (new Date(ch.expiresAt).getTime() < Date.now()) return "expired";
  ch.attempts++;
  const a = Buffer.from(hashCode(code, ch.salt)); const b = Buffer.from(ch.codeHash);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) { ch.usedAt = now(); save(); return "ok"; }
  save(); return "bad";
}

app.post("/auth/otp/request", async (req: any, reply) => {
  const { email, purpose } = req.body || {};
  const em = String(email || "").toLowerCase().trim();
  if (!em || !["register", "login"].includes(purpose)) return reply.code(400).send({ error: "email and purpose required" });
  if (throttled(`otp:${req.ip}:${em}`, 10, 3600000)) return reply.code(429).send({ error: "Too many code requests. Please wait." });
  const db = getDb();
  if (purpose === "register") {
    let rec = db.regOtp.find((r: any) => r.email === em);
    if (!rec) { rec = { email: em, count: 0, blocked: false }; db.regOtp.push(rec); }
    const existing = db.users.find((u: any) => u.email === em);
    if (existing) return { message: "If this email can sign in, a code is on its way." }; // anti-enumeration
    const d = decideRegOtp(rec.count, rec.blocked, limits());
    if (!d.allowed) { rec.blocked = true; save(); audit(em, "regotp.blocked", em); return reply.code(403).send({ error: "This email has used all 3 registration codes and is permanently blocked. There is no recovery.", permanentlyBlocked: true }); }
    rec.count = d.newCount;
    if (rec.count >= limits().regOtpLifetimeLimit) { /* last code still sends; next request blocks */ }
    save();
    const code = issueOtp(em, "register");
    await sendOtpEmail(em, code, "registration");
    return { message: "If this email can sign in, a code is on its way.", regOtpUsed: rec.count, regOtpLimit: limits().regOtpLifetimeLimit };
  }
  // login: generic response (anti-enumeration); still issue if user exists & not blocked
  const user = db.users.find((u: any) => u.email === em);
  if (user && !user.blockedAt) {
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) { /* do not send during lock */ }
    else { const code = issueOtp(em, "login"); await sendOtpEmail(em, code, "login"); }
  }
  return { message: "If this email can sign in, a code is on its way." };
});

app.post("/auth/otp/verify", async (req: any, reply) => {
  const { email, code, purpose, profile, deviceLabel } = req.body || {};
  const em = String(email || "").toLowerCase().trim();
  const db = getDb();
  if (purpose === "register") {
    const rec = db.regOtp.find((r: any) => r.email === em);
    if (rec?.blocked) return reply.code(403).send({ error: "This email is permanently blocked. There is no recovery.", permanentlyBlocked: true });
    const v = verifyOtp(em, "register", String(code || ""));
    if (v !== "ok") return reply.code(400).send({ error: v === "expired" ? "Code expired. Request a new code." : "Incorrect code." });
    if (!profile?.firstName || !profile?.lastName) return reply.code(400).send({ error: "First name and last name are required." });
    const user = { id: id(), firstName: profile.firstName, lastName: profile.lastName, email: em, age: profile.age ?? null, zip: profile.zip ?? "", blockedAt: null, lockCount: 0, failCount: 0, lockedUntil: null, createdAt: now() };
    db.users.push(user); save();
    return startSession(req, reply, user, deviceLabel);
  }
  // login
  const user = db.users.find((u: any) => u.email === em);
  if (!user) return reply.code(400).send({ error: "Incorrect code." }); // anti-enumeration
  if (user.blockedAt) return reply.code(403).send({ error: "This account is permanently blocked. There is no recovery.", permanentlyBlocked: true });
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) return reply.code(403).send({ error: `Account locked until ${user.lockedUntil}. Try again after the lock expires.`, lockedUntil: user.lockedUntil });
  const v = verifyOtp(em, "login", String(code || ""));
  if (v !== "ok") {
    const out = onLoginFail(user.failCount || 0, user.lockCount || 0, limits());
    user.failCount = out.newFailCount; user.lockCount = out.newLockCount;
    if (out.outcome === "locked") { user.lockedUntil = new Date(Date.now() + out.lockHours * 3600000).toISOString(); audit(em, "login.locked", em); save(); return reply.code(403).send({ error: `Too many incorrect codes. Account locked for ${out.lockHours} hours until ${user.lockedUntil}.`, lockedUntil: user.lockedUntil }); }
    if (out.outcome === "permanently_blocked") { user.blockedAt = now(); audit(em, "login.permblocked", em); save(); return reply.code(403).send({ error: "This account is permanently blocked after a second lockout. There is no recovery.", permanentlyBlocked: true }); }
    save();
    return reply.code(400).send({ error: v === "expired" ? "Code expired. Request a new code." : "Incorrect code.", attemptsRemaining: limits().loginFailLimit - user.failCount });
  }
  user.failCount = 0; user.lockedUntil = null; save();
  return startSession(req, reply, user, deviceLabel);
});

function startSession(req: any, reply: any, user: any, deviceLabel?: string) {
  const db = getDb();
  const active = db.loginSessions.filter((s: any) => s.userId === user.id && !s.revokedAt);
  if (!admitDevice(active.length, limits())) {
    return reply.code(403).send({ error: "You are already signed in on 3 devices — sign out on one first.", deviceLimit: true });
  }
  const token = newToken();
  const sess = { id: id(), userId: user.id, tokenHash: tokenHash(token), deviceLabel: deviceLabel || req.headers["user-agent"]?.slice(0, 60) || "browser", createdAt: now(), lastSeenAt: now(), revokedAt: null };
  db.loginSessions.push(sess); save();
  const secure = req.protocol === "https";
  reply.setCookie("muse_session", token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 30 * 24 * 3600 });
  const csrf = newToken().slice(0, 24);
  reply.setCookie("muse_csrf", csrf, { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: 30 * 24 * 3600 });
  return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, isAdmin: isAdmin(user) }, csrfToken: csrf };
}

app.post("/auth/logout", async (req: any, reply) => {
  const raw = req.cookies?.muse_session; const db = getDb();
  if (raw) { const s = db.loginSessions.find((x: any) => x.tokenHash === tokenHash(raw)); if (s) { s.revokedAt = now(); save(); } }
  reply.clearCookie("muse_session", { path: "/" }); reply.clearCookie("muse_csrf", { path: "/" });
  return { ok: true };
});
app.get("/auth/session", async (req: any) => { const u = currentUser(req); return u ? { user: { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, isAdmin: isAdmin(u) }, csrfToken: req.cookies?.muse_csrf || null } : { user: null }; });

// dev mail inbox (file mailer only — Mailpit profile equivalent)
app.get("/api/dev/mail", async (req: any, reply) => {
  if ((process.env.MAILER || "file") === "gmail") return reply.code(404).send({ error: "Not available with Gmail mailer" });
  try { return readdirSync(MAIL_DIR).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 20).map((f) => JSON.parse(readFileSync(join(MAIL_DIR, f), "utf8"))); } catch { return []; }
});

// ---------------- libraries
function listAsanas(user: any, library: string, q: any) {
  const db = getDb();
  let rows = db.asanas.filter((a: any) => library === "public" ? (a.library === "public" && a.state === "public") : (a.library === "personal" && a.creatorId === user.id));
  if (q.search) rows = rows.filter((a: any) => nameMatches(String(q.search), a.name));
  if (q.difficulty) rows = rows.filter((a: any) => a.difficulty === q.difficulty);
  if (q.bodyPart) rows = rows.filter((a: any) => a.bodyPart === q.bodyPart);
  if (q.category) rows = rows.filter((a: any) => a.category === q.category);
  const page = Math.max(1, Number(q.page || 1)); const perPage = 6;
  return { items: rows.slice((page - 1) * perPage, page * perPage).map((a: any) => pubAsana(a, user)), total: rows.length, page, perPage, pages: Math.max(1, Math.ceil(rows.length / perPage)) };
}
app.get("/api/public", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; return listAsanas(u, "public", req.query); });
app.get("/api/personal", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; return listAsanas(u, "personal", req.query); });
app.get("/api/asanas/:id", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const a = getDb().asanas.find((x: any) => x.id === req.params.id);
  if (!a) return reply.code(404).send({ error: "Not found" });
  if (a.library === "personal" && a.creatorId !== u.id && !isAdmin(u)) return reply.code(404).send({ error: "Not found" });
  if (a.state === "disabled" && a.creatorId !== u.id && !isAdmin(u)) return reply.code(404).send({ error: "Not found" });
  return pubAsana(a, u);
});
app.get("/api/characters", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const rows = getDb().characters; return [...rows].sort((a: any, b: any) => Number(b.isDefaultFolder) - Number(a.isDefaultFolder)); });

async function asanaAction(req: any, reply: any, action: string) {
  const u = requireUser(req, reply); if (!u) return;
  const db = getDb(); const a = db.asanas.find((x: any) => x.id === req.params.id);
  if (!a) return reply.code(404).send({ error: "Not found" });
  const own = a.creatorId === u.id;
  if (action === "approve" || action === "reject") { if (!isAdmin(u)) { audit(u.email, "admin.denied", a.id); return reply.code(403).send({ error: "Admin only" }); } }
  else if (!own && !isAdmin(u)) return reply.code(404).send({ error: "Not found" });
  if (action === "reject" && !String(req.body?.reason || "").trim()) return reply.code(400).send({ error: "A rejection reason is required." });
  const t = transitionAsana(a.state, action as any);
  if (!t.ok) return reply.code(400).send({ error: t.error });
  a.state = t.next;
  if (action === "approve") { a.library = "public"; a.submittedByName = db.users.find((x: any) => x.id === a.creatorId)?.firstName || "User"; }
  if (action === "reject") a.rejectionReason = String(req.body.reason).trim();
  audit(u.email, `asana.${action}`, a.id); save();
  return pubAsana(a, u);
}
for (const act of ["disable", "enable", "submit", "withdraw", "approve", "reject"]) {
  app.post(`/api/asanas/:id/${act}`, async (req: any, reply: any) => asanaAction(req, reply, act));
}

// ---------------- favourites
app.get("/api/favourites", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const db = getDb(); return db.favourites.filter((f: any) => f.userId === u.id).map((f: any) => ({ ...f, items: db.favouriteItems.filter((i: any) => i.listId === f.id).map((i: any) => { const a = db.asanas.find((x: any) => x.id === i.asanaId); return a && a.state !== "disabled" ? pubAsana(a, u) : null; }).filter(Boolean) })); });
app.post("/api/favourites", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const name = String(req.body?.name || "").trim(); if (!name) return reply.code(400).send({ error: "List name required" }); const f = { id: id(), userId: u.id, name, createdAt: now() }; getDb().favourites.push(f); save(); return f; });
app.patch("/api/favourites/:listId", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const f = getDb().favourites.find((x: any) => x.id === req.params.listId && x.userId === u.id); if (!f) return reply.code(404).send({ error: "Not found" }); f.name = String(req.body?.name || f.name); save(); return f; });
app.delete("/api/favourites/:listId", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const db = getDb(); const f = db.favourites.find((x: any) => x.id === req.params.listId && x.userId === u.id); if (!f) return reply.code(404).send({ error: "Not found" }); db.favourites = db.favourites.filter((x: any) => x.id !== f.id); db.favouriteItems = db.favouriteItems.filter((x: any) => x.listId !== f.id); save(); return { ok: true }; });
app.post("/api/favourites/:listId/items", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const db = getDb(); const f = db.favourites.find((x: any) => x.id === req.params.listId && x.userId === u.id); if (!f) return reply.code(404).send({ error: "Not found" }); const a = db.asanas.find((x: any) => x.id === req.body?.asanaId); if (!a || (a.library === "personal" && a.creatorId !== u.id)) return reply.code(404).send({ error: "Not found" }); if (db.favouriteItems.some((i: any) => i.listId === f.id && i.asanaId === a.id)) return reply.code(400).send({ error: "That asana is already in this list." }); db.favouriteItems.push({ listId: f.id, asanaId: a.id, position: db.favouriteItems.filter((i: any) => i.listId === f.id).length }); save(); return { ok: true }; });
app.delete("/api/favourites/:listId/items/:asanaId", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const db = getDb(); db.favouriteItems = db.favouriteItems.filter((i: any) => !(i.listId === req.params.listId && i.asanaId === req.params.asanaId)); save(); return { ok: true }; });

// ---------------- reference check helper
function referenceLookup(name: string) { const db = getDb(); return db.referenceAsanas.find((r: any) => nameMatches(name, r.name)) || null; }
app.get("/api/reference/check", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const ref = referenceLookup(String(req.query.name || "")); return { found: !!ref, reference: ref ? { name: ref.name } : null, isAdmin: isAdmin(u) }; });

// ---------------- creation + feedback
function draftKey(jobId: string, n: number) { return `drafts/${jobId}/step-${n}.png`; }
// Draft steps carry a stable id (sid) so edit/delete/move/image calls never depend on positions that shift.
function withSids(gen: any) { gen.steps = gen.steps.map((st: any) => ({ sid: st.sid || `s_${id()}`, instruction: st.instruction, pose: st.pose, durationS: st.durationS, imageKey: st.imageKey, imageStatus: st.imageStatus || "none", imageNote: st.imageNote, imageCheck: st.imageCheck })); return gen; }
function draftView(job: any) {
  const g = withSids(job.payload.gen), lim = limits();
  return { draftId: job.id, editOf: job.payload.editOf || null, name: job.payload.name, characterId: job.payload.characterId, difficulty: g.difficulty, bodyPart: g.bodyPart, category: g.category, benefits: g.benefits, contraindications: g.contraindications,
    steps: g.steps.map((st: any, i: number) => ({ n: i + 1, sid: st.sid, instruction: st.instruction, durationS: st.durationS, imageKey: st.imageKey || null, imageStatus: st.imageStatus, imageNote: st.imageNote || "", imageCheck: st.imageCheck || null })),
    limits: { minSteps: lim.minSteps, maxSteps: lim.maxSteps }, blocked: acceptBlockReason(g.steps, lim) };
}
function dropObject(key?: string) { if (key && key.startsWith("drafts/")) { try { unlinkSync(join(OBJECTS_DIR, key)); } catch { /* already gone */ } } }
/** Image for ONE step: images/edits only, gate + up to 3 attempts (same as bulk generation). */
async function renderStepImage(job: any, step: any, position: number) {
  const char = getDb().characters.find((c: any) => c.id === job.payload.characterId);
  const instr = step.instruction;   // the editor's adjustment travels separately (ctx.adjustment) so it is a prominent, mandatory part of the prompt
  const allSteps = job.payload.gen.steps as any[]; const idx = allSteps.findIndex((x: any) => x.sid === step.sid);
  let currentImage: Buffer | undefined; try { if (step.imageNote && step.imageKey) currentImage = readFileSync(join(OBJECTS_DIR, step.imageKey)); } catch { /* no current picture to attach */ }
  const ctx = { adjustment: step.imageNote as string | undefined, currentImage, asanaName: job.payload.name as string | undefined, allSteps: allSteps.map((x: any) => String(x.instruction)), pose: step.pose as string | undefined, total: allSteps.length, previous: (idx > 0 ? allSteps.slice(0, idx) : []).map((x: any) => String(x.instruction)) };   // earlier steps: poses carry forward
  const adjusted = !!step.imageNote;
  // Edits with a note: (1) turn text+note into an unambiguous drawing brief + checklist, (2) generate, (3) a vision model checks the checklist,
  // (4) on failure regenerate with the reviewer's problems and the rejected attempt attached. Up to 3 rounds; the best one is kept.
  const brief = adjusted ? await buildPoseBrief(job.payload.name, ctx.allSteps, position, instr, step.imageNote).catch(() => null) : null;
  const ROUNDS = adjusted && brief ? 3 : 1;
  let best: { r: Awaited<ReturnType<typeof generateStepImage>>; check: { ok: boolean; problems: string[] } | null } | null = null; let lastErr: any = null;
  let feedback: string[] = [], current = currentImage;
  for (let round = 1; round <= ROUNDS; round++) {
    let r: Awaited<ReturnType<typeof generateStepImage>> | null = null;
    for (let attempt = 1; attempt <= 3 && !r; attempt++) { try { r = await generateStepImage(instr, char!.imageKey, position, attempt, { ...ctx, brief, feedback, currentImage: current, refining: round > 1 }); } catch (e: any) { lastErr = e; } }
    if (!r) break;
    const check = brief && r.bytes ? await critiqueStepImage(r.bytes, instr, step.imageNote, brief.mustShow) : null;
    if (!best || (check && (!best.check || check.problems.length < best.check.problems.length))) best = { r, check };
    if (!check || check.ok) { if (check?.ok) best = { r, check }; break; }
    feedback = check.problems; current = r.bytes;
  }
  if (!best) throw lastErr || new Error("image generation failed");
  const r = best.r;
  step.imageCheck = best.check ? { ok: best.check.ok, problems: best.check.problems } : undefined;
  if (brief) step.pose = brief.brief;
  const key = `drafts/${job.id}/${step.sid}-${Date.now().toString(36)}.png`;           // new key per render so browsers never show a cached old image
  const dst = join(OBJECTS_DIR, key); mkdirSync(dirname(dst), { recursive: true });
  if (r.bytes) writeFileSync(dst, r.bytes); else copyFileSync(join(OBJECTS_DIR, char!.imageKey), dst);
  dropObject(step.imageKey); step.imageKey = key; step.imageStatus = "fresh";
  return { mode: r.mode, gate: r.gate };
}
app.post("/api/creation/start", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  if (throttled(`create:${u.id}`, 20, 3600000)) return reply.code(429).send({ error: "Too many creation attempts. Please wait." });
  const name = String(req.body?.name || "").trim(); const characterId = String(req.body?.characterId || "char-boy");
  if (!name) return reply.code(400).send({ error: "Asana name required" });
  const db = getDb();
  const char = db.characters.find((c: any) => c.id === characterId);
  if (!char) return reply.code(400).send({ error: "Character not found" });
  const dup = db.asanas.find((a: any) => a.library === "public" && a.state === "public" && normalizeName(a.name) === normalizeName(name));
  if (dup) return reply.code(400).send({ error: "An asana with this name already exists in the Public Library.", duplicate: true });
  const ref = referenceLookup(name);
  if (!ref && !isAdmin(u)) return reply.code(400).send({ error: "This asana was not found in any reference book. Only yoga poses in reference books can be created.", referenceBlocked: true });
  let gen: any;
  try { gen = withSids(await generateSteps(name)); } catch (e: any) { console.error("creation.start AI failure:", e?.message, e?.status || "", e?.code || ""); audit(u.email, "creation.start.ai_failed", name, { status: e?.status, code: e?.code }); return reply.code(502).send({ error: aiErrorMessage(e, isAdmin(u)) }); }
  const job = { id: id(), type: "creation.draft", ownerId: u.id, status: "draft", progress: { stage: "steps" }, error: null, createdAt: now(), updatedAt: now(), payload: { name, characterId, gen, feedbackUsed: 0, adminNote: !ref && isAdmin(u) ? "Admin: not in a reference book — creation allowed." : null, referenceFound: !!ref } };
  db.jobs.push(job); save();
  return { ...draftView(job), adminNote: job.payload.adminNote, referenceFound: !!ref };
});

app.post("/api/creation/:draftId/images", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const db = getDb(); const job = db.jobs.find((j: any) => j.id === req.params.draftId && j.ownerId === u.id);
  if (!job) return reply.code(404).send({ error: "Not found" });
  job.status = "generating"; save();
  const steps = withSids(job.payload.gen).steps; const results: any[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.imageStatus === "fresh") { results.push({ n: i + 1, imageKey: step.imageKey, mode: "kept", gate: "kept", stage: "done" }); continue; }   // only missing/stale/failed steps are generated
    try {
      const r = await renderStepImage(job, step, i + 1);
      results.push({ n: i + 1, imageKey: step.imageKey, mode: r.mode, gate: r.gate, stage: "done" });
    } catch (e: any) {
      step.imageStatus = "failed";
      job.status = "failed"; job.error = `Step ${i + 1} image failed: ${e.message}`; job.progress = { stage: "image", failedStep: i + 1, results }; save();
      return reply.code(502).send({ error: job.error, results, draft: draftView(job), nothingSaved: true });
    }
    job.progress = { stage: "image", step: i + 1, total: steps.length, elapsedS: i * 12 }; save();
  }
  job.status = "review"; job.error = null; job.progress = { stage: "review", results }; save();
  return { draftId: job.id, results, draft: draftView(job), nothingSaved: true };
});

// ---------- C16: admin-only step editing on the creation draft ----------
function adminDraft(req: any, reply: any) {
  const u = requireAdmin(req, reply); if (!u) return null;
  const job = getDb().jobs.find((j: any) => j.id === req.params.draftId && j.ownerId === u.id && j.type === "creation.draft");
  if (!job) { reply.code(404).send({ error: "Not found" }); return null; }
  if (job.status === "accepted") { reply.code(409).send({ error: "This asana was already saved." }); return null; }
  if (job.status === "generating") { reply.code(409).send({ error: "Images are being generated — wait for them to finish." }); return null; }
  withSids(job.payload.gen);
  return { u, job, steps: job.payload.gen.steps as any[] };
}
const cleanDuration = (v: any, d = 20) => (v === undefined || v === null || v === "" ? d : Number(v));
const durOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 600;

app.patch("/api/creation/:draftId/steps/:sid", async (req: any, reply) => {
  const c = adminDraft(req, reply); if (!c) return; const { u, job, steps } = c;
  const st = steps.find((x: any) => x.sid === req.params.sid); if (!st) return reply.code(404).send({ error: "Step not found" });
  const b = req.body || {}; let textChanged = false;
  if (b.durationS !== undefined) { const d = Number(b.durationS); if (!durOk(d)) return reply.code(400).send({ error: "Duration must be a whole number of seconds from 1 to 600." }); st.durationS = d; }
  if (b.instruction !== undefined) {
    const text = String(b.instruction).trim();
    if (text !== st.instruction) {
      const j = await judgeStepText(text); if (!j.ok) return reply.code(400).send({ error: j.reason, stage: "intent" });
      st.instruction = text; st.pose = undefined; textChanged = true;   // edited text invalidates the stored full-body pose; the image prompt then falls back to the text + earlier steps
      if (st.imageStatus === "fresh") st.imageStatus = "stale";               // picture no longer matches the words
    }
  }
  audit(u.email, "creation.step.edit", job.id, { sid: st.sid, textChanged }); save();
  return draftView(job);
});
app.post("/api/creation/:draftId/steps", async (req: any, reply) => {
  const c = adminDraft(req, reply); if (!c) return; const { u, job, steps } = c;
  if (!canAddStep(steps.length, limits())) return reply.code(400).send({ error: `An asana can have at most ${limits().maxSteps} steps.` });
  const text = String(req.body?.instruction || "").trim(); const d = cleanDuration(req.body?.durationS);
  if (!durOk(d)) return reply.code(400).send({ error: "Duration must be a whole number of seconds from 1 to 600." });
  const after = req.body?.afterSid === undefined ? steps[steps.length - 1]?.sid ?? null : req.body.afterSid;   // undefined = append, null = at the very start
  if (after !== null && !steps.some((x: any) => x.sid === after)) return reply.code(404).send({ error: "Step not found" });
  const j = await judgeStepText(text); if (!j.ok) return reply.code(400).send({ error: j.reason, stage: "intent" });
  const nst = { sid: `s_${id()}`, instruction: text, durationS: d, imageStatus: "none", imageKey: undefined, imageNote: undefined };
  job.payload.gen.steps = insertStepAfter(steps, after, nst as any);
  audit(u.email, "creation.step.add", job.id, { sid: nst.sid }); save();
  return draftView(job);
});
app.delete("/api/creation/:draftId/steps/:sid", async (req: any, reply) => {
  const c = adminDraft(req, reply); if (!c) return; const { u, job, steps } = c;
  const st = steps.find((x: any) => x.sid === req.params.sid); if (!st) return reply.code(404).send({ error: "Step not found" });
  if (!canDeleteStep(steps.length, limits())) return reply.code(400).send({ error: `An asana needs at least ${limits().minSteps} steps.` });
  job.payload.gen.steps = deleteStepAt(steps, st.sid); dropObject(st.imageKey);              // only this step; later steps shift up by one position
  audit(u.email, "creation.step.delete", job.id, { sid: st.sid }); save();
  return draftView(job);
});
app.post("/api/creation/:draftId/steps/:sid/move", async (req: any, reply) => {
  const c = adminDraft(req, reply); if (!c) return; const { u, job, steps } = c;
  const dir = req.body?.dir; if (dir !== "up" && dir !== "down") return reply.code(400).send({ error: "dir must be up or down" });
  if (!steps.some((x: any) => x.sid === req.params.sid)) return reply.code(404).send({ error: "Step not found" });
  job.payload.gen.steps = moveStep(steps, req.params.sid, dir);                              // images travel with their steps, so they stay fresh
  audit(u.email, "creation.step.move", job.id, { sid: req.params.sid, dir }); save();
  return draftView(job);
});
app.post("/api/creation/:draftId/steps/:sid/image", async (req: any, reply) => {
  const c = adminDraft(req, reply); if (!c) return; const { u, job, steps } = c;
  const i = steps.findIndex((x: any) => x.sid === req.params.sid); if (i < 0) return reply.code(404).send({ error: "Step not found" });
  if (throttled(`regen:${u.id}`, 60, 3600000)) return reply.code(429).send({ error: "Too many image requests. Please wait." });
  const adj = req.body?.adjustment === undefined ? undefined : String(req.body.adjustment).trim();
  if (adj) { const j = await judgeStepText(adj, 1500); if (!j.ok) return reply.code(400).send({ error: j.reason, stage: "intent" }); steps[i].imageNote = adj.slice(0, 1500); }
  else if (adj === "") steps[i].imageNote = undefined;                                       // empty adjustment clears the saved note
  try { await renderStepImage(job, steps[i], i + 1); }
  catch (e: any) { steps[i].imageStatus = "failed"; save(); return reply.code(502).send({ error: `Step ${i + 1} image failed: ${e.message}`, draft: draftView(job) }); }
  audit(u.email, "creation.step.image", job.id, { sid: steps[i].sid, adjusted: !!adj }); save();
  return draftView(job);
});

async function runFeedbackChecks(u: any, asanaName: string, feedback: string, isAdminCreatorOutsideRef: boolean) {
  const intent = await judgeIntent(feedback);
  if (!intent.ok) return { ok: false, stage: "intent", reason: intent.reason };
  const ref = referenceLookup(asanaName);
  if (!ref && !isAdminCreatorOutsideRef) return { ok: false, stage: "reference", reason: "Only yoga poses in reference books can be altered. This asana is not in any reference book." };
  if (ref) { const al = await judgeAlignment(feedback, ref.text || ref.name); if (!al.ok) return { ok: false, stage: "alignment", reason: al.reason }; }
  return { ok: true, stage: "regenerate", reason: "Accepted" };
}

app.post("/api/creation/:draftId/feedback", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const db = getDb(); const job = db.jobs.find((j: any) => j.id === req.params.draftId && j.ownerId === u.id);
  if (!job) return reply.code(404).send({ error: "Not found" });
  if (!feedbackAllowed(job.payload.feedbackUsed, limits())) return reply.code(400).send({ error: `Feedback limit reached (${limits().maxFeedbacksPerAsana} per asana).`, limitReached: true });
  job.payload.feedbackUsed++; // rejected counts too (scope §10)
  const check = await runFeedbackChecks(u, job.payload.name, String(req.body?.feedback || ""), isAdmin(u) && !job.payload.referenceFound);
  save();
  if (!check.ok) return { ok: false, stage: check.stage, reason: check.reason, feedbackUsed: job.payload.feedbackUsed, feedbackRemaining: limits().maxFeedbacksPerAsana - job.payload.feedbackUsed };
  let gen: any;
  try { gen = withSids(await generateSteps(job.payload.name)); } // whole-asana regeneration, old draft replaced
  catch (e: any) { job.payload.feedbackUsed--; save(); return reply.code(502).send({ error: aiErrorMessage(e, isAdmin(u)) + " Your feedback attempt was not used.", feedbackUsed: job.payload.feedbackUsed }); }   // an outage must not cost the user an attempt
  job.payload.gen.steps.forEach((st: any) => dropObject(st.imageKey));
  job.payload.gen = gen; job.status = "draft"; save();
  return { ok: true, stage: "regenerate", gen, draft: draftView(job), feedbackUsed: job.payload.feedbackUsed, feedbackRemaining: limits().maxFeedbacksPerAsana - job.payload.feedbackUsed, note: "All steps regenerated. Review before accepting." };
});

// ---------- admin: edit a Public Library asana (opens an edit draft that reuses the C16 step editor) ----------
app.post("/api/admin/asanas/:id/edit", async (req: any, reply) => {
  const u = requireAdmin(req, reply); if (!u) return;
  const db = getDb(); const a = db.asanas.find((x: any) => x.id === req.params.id);
  if (!a || a.library !== "public") return reply.code(404).send({ error: "Only Public Library asanas can be edited here." });
  let job = db.jobs.find((j: any) => j.type === "creation.draft" && j.ownerId === u.id && j.status !== "accepted" && j.status !== "cancelled" && j.payload.editOf === a.id);
  if (!job) {                                                         // resume an open edit if there is one, otherwise copy the asana into a fresh draft
    const jid = id();
    const gen = { difficulty: a.difficulty, bodyPart: a.bodyPart, category: a.category, benefits: [...(a.benefits || [])], contraindications: [...(a.contraindications || [])],
      steps: a.steps.map((st: any, i: number) => { const key = `drafts/${jid}/orig-${i + 1}.png`; mkdirSync(join(OBJECTS_DIR, `drafts/${jid}`), { recursive: true }); copyFileSync(join(OBJECTS_DIR, st.imageKey), join(OBJECTS_DIR, key)); return { instruction: st.instruction, durationS: st.durationS, imageKey: key, imageStatus: "fresh" }; }) };
    job = { id: jid, type: "creation.draft", ownerId: u.id, status: "draft", progress: { stage: "edit" }, error: null, createdAt: now(), updatedAt: now(), payload: { name: a.name, characterId: a.characterId, gen: withSids(gen), editOf: a.id, feedbackUsed: 0, adminNote: null, referenceFound: true } };
    db.jobs.push(job); audit(u.email, "asana.edit.open", a.id, { draftId: jid }); save();
  }
  return draftView(job);
});
app.patch("/api/creation/:draftId/details", async (req: any, reply) => {
  const c = adminDraft(req, reply); if (!c) return; const { u, job } = c;
  const b = req.body || {}; const g = job.payload.gen; const db = getDb();
  const str = (v: any, max: number) => String(v ?? "").trim().slice(0, max);
  const list = (v: any) => (Array.isArray(v) ? v : String(v ?? "").split(/\r?\n|;/)).map((x: any) => str(x, 160)).filter(Boolean).slice(0, 12);
  if (b.name !== undefined) {
    const name = str(b.name, 80); if (name.length < 2) return reply.code(400).send({ error: "Name is too short." });
    const clash = db.asanas.find((x: any) => x.library === "public" && x.state === "public" && x.id !== job.payload.editOf && normalizeName(x.name) === normalizeName(name));
    if (clash) return reply.code(400).send({ error: "An asana with this name already exists in the Public Library." });
    job.payload.name = name;
  }
  for (const [k, max] of [["difficulty", 30], ["bodyPart", 40], ["category", 40]] as const) if (b[k] !== undefined) { const v = str(b[k], max); if (!v) return reply.code(400).send({ error: `${k} cannot be empty.` }); g[k] = v; }
  if (b.benefits !== undefined) { const l = list(b.benefits); if (!l.length) return reply.code(400).send({ error: "Add at least one benefit." }); g.benefits = l; }
  if (b.contraindications !== undefined) { const l = list(b.contraindications); if (!l.length) return reply.code(400).send({ error: "Add at least one caution." }); g.contraindications = l; }
  audit(u.email, "creation.details.edit", job.id, { fields: Object.keys(b) }); save();
  return draftView(job);
});
app.delete("/api/creation/:draftId", async (req: any, reply) => {         // discard an unsaved draft / edit (nothing published is touched)
  const u = requireAdmin(req, reply); if (!u) return;
  const job = getDb().jobs.find((j: any) => j.id === req.params.draftId && j.ownerId === u.id && j.type === "creation.draft");
  if (!job || job.status === "accepted") return reply.code(404).send({ error: "Not found" });
  for (const st of withSids(job.payload.gen).steps) dropObject(st.imageKey);
  job.status = "cancelled"; audit(u.email, "creation.discard", job.id, { editOf: job.payload.editOf || null }); save();
  return { ok: true };
});

app.post("/api/creation/:draftId/accept", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const db = getDb(); const job = db.jobs.find((j: any) => j.id === req.params.draftId && j.ownerId === u.id);
  if (!job) return reply.code(404).send({ error: "Not found" });
  const draftSteps = withSids(job.payload.gen).steps; const blocked = acceptBlockReason(draftSteps, limits());
  if (blocked) return reply.code(400).send({ error: blocked, blocked: true });
  if (job.payload.editOf) {                                           // admin edit of a public-library asana: replace its content in place (same id, favourites and history keep working)
    if (!isAdmin(u)) return reply.code(403).send({ error: "Admin only" });
    const target = db.asanas.find((x: any) => x.id === job.payload.editOf);
    if (!target || target.library !== "public") return reply.code(404).send({ error: "The asana being edited no longer exists." });
    const ver = (target.version || 1) + 1;                             // versioned image keys: files used by earlier practice history are never overwritten
    const newSteps = draftSteps.map((s: any, i: number) => ({ n: i + 1, instruction: s.instruction, durationS: s.durationS, imageKey: `asanas/${target.id}/v${ver}/step-${i + 1}.png` }));
    mkdirSync(join(OBJECTS_DIR, `asanas/${target.id}/v${ver}`), { recursive: true });
    newSteps.forEach((s: any, i: number) => copyFileSync(join(OBJECTS_DIR, draftSteps[i].imageKey), join(OBJECTS_DIR, s.imageKey)));
    const before = { name: target.name, steps: target.steps.length };
    Object.assign(target, { name: job.payload.name, difficulty: job.payload.gen.difficulty, bodyPart: job.payload.gen.bodyPart, category: job.payload.gen.category, benefits: job.payload.gen.benefits, contraindications: job.payload.gen.contraindications, steps: newSteps, version: ver, editedAt: now(), editedBy: u.email });
    job.status = "accepted"; for (const st of draftSteps) dropObject(st.imageKey);
    audit(u.email, "asana.edit", target.id, { version: ver, before, after: { name: target.name, steps: newSteps.length } }); save();
    return pubAsana(target, u);
  }
  const aid = id();
  const admin = isAdmin(u);
  const steps = draftSteps.map((s: any, i: number) => ({ n: i + 1, instruction: s.instruction, durationS: s.durationS, imageKey: `asanas/${aid}/step-${i + 1}.png` }));
  mkdirSync(join(OBJECTS_DIR, `asanas/${aid}`), { recursive: true });
  steps.forEach((s: any, i: number) => copyFileSync(join(OBJECTS_DIR, draftSteps[i].imageKey), join(OBJECTS_DIR, s.imageKey)));   // write-once step images, copied in final order
  const asana = { id: aid, name: job.payload.name, characterId: job.payload.characterId, creatorId: u.id, library: admin ? "public" : "personal", state: admin ? "public" : "active", difficulty: job.payload.gen.difficulty, bodyPart: job.payload.gen.bodyPart, category: job.payload.gen.category, benefits: job.payload.gen.benefits, contraindications: job.payload.gen.contraindications, feedbackUsed: job.payload.feedbackUsed, rejectionReason: null, submittedByName: null, createdAt: now(), steps };
  db.asanas.push(asana); job.status = "accepted"; save();
  return pubAsana(asana, u);
});

app.post("/api/asanas/:id/feedback", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const db = getDb(); const a = db.asanas.find((x: any) => x.id === req.params.id);
  if (!a) return reply.code(404).send({ error: "Not found" });
  if (a.creatorId !== u.id && !isAdmin(u)) return reply.code(404).send({ error: "Not found" });
  if (a.state === "rejected") return reply.code(400).send({ error: "A rejected asana cannot be edited." });
  if (a.library === "public" && a.creatorId !== u.id) return reply.code(400).send({ error: "You can no longer edit this asana." });
  if (!feedbackAllowed(a.feedbackUsed, limits())) return reply.code(400).send({ error: `Feedback limit reached (${limits().maxFeedbacksPerAsana} per asana).`, limitReached: true });
  a.feedbackUsed++;
  const check = await runFeedbackChecks(u, a.name, String(req.body?.feedback || ""), isAdmin(u));
  save();
  if (!check.ok) return { ok: false, stage: check.stage, reason: check.reason, feedbackUsed: a.feedbackUsed, feedbackRemaining: limits().maxFeedbacksPerAsana - a.feedbackUsed };
  const gen = await generateSteps(a.name);
  a.steps = gen.steps.map((s: any, i: number) => ({ n: i + 1, instruction: s.instruction, durationS: s.durationS, imageKey: a.steps[i]?.imageKey || `asanas/${a.id}/step-${i + 1}.png` }));
  a.difficulty = gen.difficulty; a.bodyPart = gen.bodyPart; a.category = gen.category;
  save();
  return { ok: true, stage: "regenerate", asana: pubAsana(a, u), feedbackUsed: a.feedbackUsed, feedbackRemaining: limits().maxFeedbacksPerAsana - a.feedbackUsed };
});

// ---------------- practice sessions (REST create + history)
app.post("/api/sessions", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const db = getDb(); const a = db.asanas.find((x: any) => x.id === req.body?.asanaId);
  if (!a) return reply.code(404).send({ error: "Not found" });
  if (a.library === "personal" && a.creatorId !== u.id) return reply.code(404).send({ error: "Not found" });
  if (!canPractise(a.state)) return reply.code(400).send({ error: "This asana cannot be practised in its current state." });
  const room = createRoom(u.id, a.id);
  return { code: room.code, asana: pubAsana(a, u) };
});
app.get("/api/history", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; return getDb().practiceSessions.filter((s: any) => s.userId === u.id).map((s: any) => ({ id: s.id, date: s.startedAt, asanaId: s.asanaId, asanaName: s.asanaName, steps: s.steps })); });
app.get("/api/history/:sid", async (req: any, reply) => { const u = requireUser(req, reply); if (!u) return; const s = getDb().practiceSessions.find((x: any) => x.id === req.params.sid && x.userId === u.id); if (!s) return reply.code(404).send({ error: "Not found" }); return s; });


// ---------------- history photos: the client-side blurred (background + face) photo of each step, owner-only
app.post("/api/history/:sid/photos/:step", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const s = getDb().practiceSessions.find((x: any) => x.id === req.params.sid && x.userId === u.id);
  if (!s) return reply.code(404).send({ error: "Not found" });
  const n = Number(req.params.step); if (!Number.isInteger(n) || n < 1 || n > s.steps.length) return reply.code(400).send({ error: "Bad step" });
  if (Date.now() - new Date(s.endedAt).getTime() > 30 * 60 * 1000) return reply.code(400).send({ error: "Photos can only be added right after the session." });
  const m = String(req.body?.dataUrl || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return reply.code(400).send({ error: "A JPEG image is required." });
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 500 || buf.length > 400 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return reply.code(400).send({ error: "Invalid or oversized image." });
  // One photo per camera/device (a 2-3 device session has several photos per step): keyed by a sanitized device slot.
  const slot = String(req.body?.slot || "main").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "main";
  const label = String(req.body?.label || "Camera").replace(/[^\w \-]/g, "").trim().slice(0, 20) || "Camera";
  const st = s.steps[n - 1]; const others = (st.photos || []).filter((p: any) => p.slot !== slot);
  if (others.length >= 3) return reply.code(400).send({ error: "At most 3 photos per step." });
  const key = `practice-photos/${u.id}/${s.id}/step-${n}-${slot}.jpg`;
  mkdirSync(join(OBJECTS_DIR, `practice-photos/${u.id}/${s.id}`), { recursive: true });
  writeFileSync(join(OBJECTS_DIR, key), buf);
  st.photos = [...others, { slot, label, key, primary: !!req.body?.primary }].sort((x: any, y: any) => Number(y.primary) - Number(x.primary));
  st.photoKey = st.photos[0].key;                                                              // main (Primary) photo, kept for older clients and sessions
  audit(u.email, "history.photo.add", s.id, { step: n, bytes: buf.length, slot }); save();
  return { ok: true, photoKey: key };
});
app.delete("/api/history/:sid/photos", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  const s = getDb().practiceSessions.find((x: any) => x.id === req.params.sid && x.userId === u.id);
  if (!s) return reply.code(404).send({ error: "Not found" });
  let removed = 0;
  for (const st of s.steps) {
    const keys = new Set<string>([...(st.photos || []).map((p: any) => p.key), ...(st.photoKey ? [st.photoKey] : [])]);
    for (const k of keys) { try { unlinkSync(join(OBJECTS_DIR, k)); } catch { /* already gone */ } removed++; }
    delete st.photoKey; delete st.photos;
  }
  audit(u.email, "history.photo.delete", s.id, { removed }); save();
  return { ok: true, removed };
});

// ---------------- voice
app.post("/api/voice/match", async (req: any) => matchReady(String(req.body?.text || "")));
app.post("/api/voice/transcribe", async (req: any, reply) => {
  const u = requireUser(req, reply); if (!u) return;
  // Multipart audio upload (one-shot fallback, POC g). Audio is transcribed
  // in memory and never stored. JSON {text} remains the QA test hook.
  if (req.isMultipart?.()) {
    const data = await (req as any).file().catch(() => null);
    if (!data) return reply.code(400).send({ error: "Audio file required" });
    const buf = await data.toBuffer();
    if (buf.length > 5 * 1024 * 1024) return reply.code(400).send({ error: "Audio clip too large" });
    try {
      const t = await transcribeOneShot(buf, { filename: data.filename, mimetype: data.mimetype });
      return { transcript: t.transcript, ...matchReady(t.transcript), seconds: t.seconds };
    } catch (e: any) { return reply.code(502).send({ error: `Transcription failed: ${e.message}`, transcript: "", matched: false, phrase: null }); }
  }
  if (req.body?.text !== undefined) { const m = matchReady(String(req.body.text)); return { transcript: req.body.text, ...m, seconds: 0 }; }
  return { transcript: "", matched: false, phrase: null, seconds: 0, note: "No speech recognised" };
});

// ---------------- admin
app.get("/api/admin/submissions", async (req: any, reply) => { const u = requireAdmin(req, reply); if (!u) return; return getDb().asanas.filter((a: any) => a.state === "pending").map((a: any) => pubAsana(a, u)); });
app.get("/api/admin/settings", async (req: any, reply) => { const u = requireAdmin(req, reply); if (!u) return; return limits(); });
app.put("/api/admin/settings", async (req: any, reply) => {
  const u = requireAdmin(req, reply); if (!u) return;
  const db = getDb();
  for (const [k, v] of Object.entries(req.body || {})) { if (k in DEFAULT_LIMITS && Number(v) > 0) db.settings[k] = Number(v); }
  audit(u.email, "settings.update", "settings", req.body); save();
  return limits();
});
app.get("/api/admin/audit", async (req: any, reply) => { const u = requireAdmin(req, reply); if (!u) return; return getDb().audit.slice(-100).reverse(); });
app.get("/api/admin/ai-calls", async (req: any, reply) => { const u = requireAdmin(req, reply); if (!u) return; return getDb().aiCalls.slice(-100).reverse(); });
app.get("/api/admin/reference", async (req: any, reply) => { const u = requireAdmin(req, reply); if (!u) return; return getDb().referenceBooks; });
app.post("/api/admin/characters", async (req: any, reply) => {
  const u = requireAdmin(req, reply); if (!u) return;
  const data: any = await (req as any).file();
  if (!data) return reply.code(400).send({ error: "Image file required" });
  const ext = extname(data.filename || "").toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return reply.code(400).send({ error: "Only PNG/JPG/WebP images allowed" });
  const buf = await data.toBuffer();
  if (buf.length > 10 * 1024 * 1024) return reply.code(400).send({ error: "Image too large (max 10 MB)" });
  if (!(buf[0] === 0x89 || buf[0] === 0xff || buf.slice(0, 4).toString() === "RIFF")) return reply.code(400).send({ error: "File is not a valid image" });
  const cid = id(); const folder = String(req.query.folder || req.body?.folder || "custom");
  const key = `characters/${folder}/${cid}.png`;
  mkdirSync(dirname(join(OBJECTS_DIR, key)), { recursive: true });
  writeFileSync(join(OBJECTS_DIR, key), buf);
  const ch = { id: cid, folder, name: data.filename.replace(/\.[^.]+$/, ""), imageKey: key, isDefaultFolder: folder === "default" };
  getDb().characters.push(ch); audit(u.email, "character.upload", cid); save();
  return ch;
});
app.post("/api/admin/reference", async (req: any, reply) => {
  const u = requireAdmin(req, reply); if (!u) return;
  const data: any = await (req as any).file();
  if (!data) return reply.code(400).send({ error: "PDF file required" });
  if (!String(data.filename || "").toLowerCase().endsWith(".pdf")) return reply.code(400).send({ error: "Only PDF files allowed" });
  const buf = await data.toBuffer();
  if (buf.length > 50 * 1024 * 1024) return reply.code(400).send({ error: "PDF too large (max 50 MB)" });
  if (buf.slice(0, 4).toString() !== "%PDF") return reply.code(400).send({ error: "File is not a valid PDF", failed: true });
  const bid = id(); const key = `reference/${bid}/source.pdf`;
  mkdirSync(dirname(join(OBJECTS_DIR, key)), { recursive: true });
  writeFileSync(join(OBJECTS_DIR, key), buf);
  const book = { id: bid, title: data.filename, pdfKey: key, status: "processing", failReason: null, uploadedBy: u.email };
  getDb().referenceBooks.push(book); audit(u.email, "reference.upload", bid); save();
  // Background parse job (PyMuPDF worker if PyMuPDF present, else text-scan fallback)
  setTimeout(() => {
    const py = join(APP_ROOT, "scripts/parse_pdf.py");
    const child = spawn("python3", [py, join(OBJECTS_DIR, key), bid], { stdio: "ignore" });
    child.on("close", (code2) => {
      const db = getDb(); const b = db.referenceBooks.find((x: any) => x.id === bid);
      if (!b) return;
      try {
        const out = JSON.parse(readFileSync(join(OBJECTS_DIR, `reference/${bid}/extracted.json`), "utf8"));
        for (const name of out.asanas || []) db.referenceAsanas.push({ id: id(), bookId: bid, name, text: out.textSample || "", pageRefs: [] });
        b.status = "ready";
      } catch { b.status = code2 === 0 ? "ready" : "failed"; b.failReason = b.status === "failed" ? "PDF parsing failed. The file may be corrupt." : null; }
      save();
    });
    child.on("error", () => { const db = getDb(); const b = db.referenceBooks.find((x: any) => x.id === bid); if (b) { b.status = "failed"; b.failReason = "Parser unavailable"; save(); } });
  }, 10);
  return book;
});

// ---------------- files (stored images only; write-once keys served immutable)
app.get("/files/*", async (req: any, reply) => {
  const u = currentUser(req);
  if (!u) return reply.code(401).send({ error: "Login required" });
  const key = (req.params as any)["*"];
  if (!key || key.includes("..")) return reply.code(400).send({ error: "Bad path" });
  const path = join(OBJECTS_DIR, key);
  if (key.startsWith("practice-photos/")) {                       // blurred student photos: visible to their owner only, never cached by shared caches
    if (key.split("/")[1] !== u.id) return reply.code(404).send({ error: "Not found" });
    if (!existsSync(path)) return reply.code(404).send({ error: "Not found" });
    reply.header("Cache-Control", "private, no-store"); reply.header("Content-Type", "image/jpeg");
    return reply.send(readFileSync(path));
  }
  if (!existsSync(path)) return reply.code(404).send({ error: "Not found" });
  reply.header("Cache-Control", "public, max-age=31536000, immutable");
  return reply.send(readFileSync(path));
});

// ---- web static (one origin, design §2.5)
const WEB_DIST = join(APP_ROOT, "apps/web/dist");
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, prefix: "/", wildcard: false });
  app.setNotFoundHandler((req: any, reply: any) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/auth/") || req.url.startsWith("/files/") || req.url.startsWith("/health")) return reply.code(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
}

// Sandbox/CI hardening: Fastify logs bind addresses via os.networkInterfaces(),
// which some sandboxes forbid. Fall back to an empty map there (no behaviour change elsewhere).
import os from "node:os";
try { os.networkInterfaces(); } catch { (os as any).networkInterfaces = () => ({}); }

// ---- start
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
await app.listen({ port: PORT, host: HOST });
const wss = new WebSocketServer({
  server: (app as any).server, path: "/ws",
  // Reject foreign-origin upgrades BEFORE the 101 handshake (QA S11.4).
  verifyClient: (info: any, done: any) => {
    const origin = info.origin || info.req?.headers?.origin;
    if (origin) { try { if (new URL(origin).host !== info.req.headers.host) return done(false, 403, "Foreign origin"); } catch { return done(false, 403, "Bad origin"); } }
    const cookieHeader = info.req?.headers?.cookie || "";
    if (!/muse_session=/.test(cookieHeader)) return done(false, 401, "Login required");
    done(true);
  },
});
wss.on("connection", (ws: any, req: any) => {
  // Origin + session check (design §2.5)
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) { ws.close(1008, "Foreign origin"); return; } } catch { ws.close(1008); return; } }
  const cookieHeader = req.headers.cookie || "";
  const m = cookieHeader.match(/muse_session=([^;]+)/);
  if (!m) { ws.close(1008, "Login required"); return; }
  const db = getDb();
  const sess = db.loginSessions.find((s: any) => s.tokenHash === tokenHash(decodeURIComponent(m[1])) && !s.revokedAt);
  if (!sess) { ws.close(1008, "Login required"); return; }
  const user = db.users.find((u: any) => u.id === sess.userId);
  if (!user) { ws.close(1008, "Login required"); return; }
  let joined: { room: any; device: any } | null = null;
  ws.on("message", (data: Buffer) => {
    const text = data.toString();
    if (!joined) {
      try {
        const msg = JSON.parse(text);
        if (msg.type !== "join") { ws.send(JSON.stringify({ type: "error", error: "First message must be join" })); return; }
        const room = rooms.get(String(msg.code));
        if (!room || room.userId !== user.id) { ws.send(JSON.stringify({ type: "error", error: "Session not found for this account" })); ws.close(1008); return; }
        if (room.devices.size >= limits().sessionMaxDevices) { ws.send(JSON.stringify({ type: "error", error: "Session already has 3 devices" })); ws.close(1008); return; }
        const deviceId = id();
        const isFirst = room.devices.size === 0;
        const device: any = { deviceId, userId: user.id, label: msg.label || "Device", ws, isPrimary: isFirst, inView: true, camera: false, mic: false, lastSeen: Date.now(), fireTimes: [] };
        room.devices.set(deviceId, device);
        joined = { room, device };
        ws.send(JSON.stringify({ ...snapshot(room), you: deviceId, isPrimary: device.isPrimary }));
        broadcast(room, snapshot(room));
        return;
      } catch { ws.send(JSON.stringify({ type: "error", error: "Bad join" })); return; }
    }
    handleWsMessage(joined.room, joined.device, text);
  });
  ws.on("close", () => { if (joined) onDeviceDisconnect(joined.room, joined.device); });
});
console.log(`Muse Yoga listening on ${USE_HTTPS ? "https" : "http"}://${HOST}:${PORT} (mailer=${process.env.MAILER || "file"}, ai=${aiMode()})`);
