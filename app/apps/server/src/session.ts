import { WebSocket } from "ws";
import { matchReady, pickBestSet, CAPTURE_LEAD_MS } from "@muse/domain";
import { validateClientMessage } from "@muse/contracts";
import { getDb, save, id, now } from "./store.js";
import { validatePose, annotatePhoto } from "./ai.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OBJECTS_DIR, DATA_DIR } from "./store.js";

export interface Device { deviceId: string; userId: string; label: string; ws: WebSocket; isPrimary: boolean; inView: boolean; camera: boolean; mic: boolean; lastSeen: number; fireTimes: number[] }
export interface Room {
  code: string; userId: string; asanaId: string; state: string; stepIndex: number;
  devices: Map<string, Device>; pendingPrimary: string | null; captures: Record<number, Array<{ set: number; deviceIds: string[]; at: number }>>;
  photosInMemory: Record<string, Buffer>; createdAt: string; voiceTimer: any; listenTimerOn: boolean; timers: any[];
  demoTimer: any; results: any; practiceId: string | null; framingBadDevice: string | null; switchQueued: boolean; demoIdx: number; demoPaused: boolean; demoAwait: number;
}

export const rooms = new Map<string, Room>();

export function createRoom(userId: string, asanaId: string): Room {
  let code = String(Math.floor(100000 + Math.random() * 900000));
  while (rooms.has(code)) code = String(Math.floor(100000 + Math.random() * 900000));
  const room: Room = { code, userId, asanaId, state: "setup", stepIndex: 0, devices: new Map(), pendingPrimary: null, captures: {}, photosInMemory: {}, createdAt: now(), voiceTimer: null, listenTimerOn: false, timers: [], demoTimer: null, results: null, practiceId: null, framingBadDevice: null, switchQueued: false, demoIdx: 0, demoPaused: false, demoAwait: -1 };
  rooms.set(code, room);
  return room;
}

function send(ws: WebSocket, obj: unknown) { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch {} }
export function broadcast(room: Room, obj: unknown) { for (const d of room.devices.values()) send(d.ws, obj); }
export function snapshot(room: Room) {
  const db = getDb();
  const asana = db.asanas.find((a: any) => a.id === room.asanaId);
  return {
    type: "state", code: room.code, state: room.state, stepIndex: room.stepIndex, demoIdx: room.demoIdx,
    asana: asana ? { id: asana.id, name: asana.name, difficulty: asana.difficulty, category: asana.category, contraindications: asana.contraindications, steps: asana.steps } : null,
    devices: [...room.devices.values()].map((d) => ({ deviceId: d.deviceId, label: d.label, isPrimary: d.isPrimary, inView: d.inView, camera: d.camera })),
    primaryId: [...room.devices.values()].find((d) => d.isPrimary)?.deviceId || null,
    pendingPrimary: room.pendingPrimary, framingBadDevice: room.framingBadDevice,
    captures: room.captures, results: room.results,
  };
}
function broadcastState(room: Room) { broadcast(room, snapshot(room)); }
function clearTimers(room: Room) { room.timers.forEach(clearTimeout); room.timers = []; if (room.voiceTimer) { clearTimeout(room.voiceTimer); room.voiceTimer = null; } }
function later(room: Room, fn: () => void, ms: number) { const t = setTimeout(fn, ms); room.timers.push(t); return t; }

export function speak(room: Room, text: string) { broadcast(room, { type: "spoken", text, at: Date.now() }); }

function promoteEarliest(room: Room, reason: string) {
  const remaining = [...room.devices.values()];
  if (!remaining.length) return;
  remaining.sort((a, b) => a.lastSeen - b.lastSeen);
  // earliest joined = first inserted
  const first = [...room.devices.values()][0];
  for (const d of room.devices.values()) d.isPrimary = d.deviceId === first.deviceId;
  broadcast(room, { type: "roleChanged", primaryId: first.deviceId, atStep: room.stepIndex, reason });
  speak(room, `${first.label} is now the Primary device.`);
}

function applyPendingPrimary(room: Room) {
  if (!room.pendingPrimary) return;
  const target = room.devices.get(room.pendingPrimary);
  room.pendingPrimary = null; room.switchQueued = false;
  if (!target) return;
  for (const d of room.devices.values()) d.isPrimary = d.deviceId === target.deviceId;
  broadcast(room, { type: "roleChanged", primaryId: target.deviceId, atStep: room.stepIndex });
  speak(room, `${target.label} is now the Primary device.`);
}

// Only the PRIMARY camera must see the whole body. Extra (Secondary) cameras are helper angles: from the side or head-on (e.g. lying with your head
// toward the phone) they can never see the whole body, so their framing must not pause practice. Their photos and skeletons are still used.
function allInView(room: Room): boolean { return [...room.devices.values()].filter((d) => d.isPrimary).every((d) => d.inView); }

// Demo sequencing: every tick broadcasts the step index together with the
// narration, so clients change the reference image/caption in lockstep. The
// NEXT step starts only after the Primary reports it finished speaking the
// current one (demoSpoken) plus a short pause; a text-length fallback timer
// keeps the demo moving if that message is lost (images never outrun the voice).
const DEMO_PAUSE_MS = 1500;
function demoFallbackMs(text: string) { return Math.max(9000, Math.round((text.split(/\s+/).length / 2.2) * 1000) + 5000); }
function scheduleDemoNext(room: Room, ms: number) { if (room.demoTimer) clearTimeout(room.demoTimer); room.demoTimer = setTimeout(() => demoAdvance(room), ms); }
function demoAdvance(room: Room) {
  if (room.state !== "demo" || room.demoPaused) return;
  const total = getDb().asanas.find((a: any) => a.id === room.asanaId)?.steps?.length || 0;
  if (room.demoIdx + 1 < total) { room.demoIdx++; runDemoTick(room); return; }
  room.state = "start"; room.demoIdx = 0; room.demoAwait = -1;
  broadcast(room, { type: "demoStep", n: 0, total, done: true });
  broadcastState(room);
}
function runDemoTick(room: Room) {
  if (room.state !== "demo") return;
  const asana = getDb().asanas.find((a: any) => a.id === room.asanaId);
  const total = asana?.steps?.length || 0;
  const line = `Step ${room.demoIdx + 1}. ${asana?.steps?.[room.demoIdx]?.instruction || ""}`;
  room.demoAwait = room.demoIdx;
  broadcast(room, { type: "demoStep", n: room.demoIdx + 1, total });
  speak(room, line);
  broadcastState(room);
  scheduleDemoNext(room, demoFallbackMs(line));
}

// The 10 s listening window must NOT include the spoken prompt (S8.5):
// the server speaks first, then waits for the Primary to report its TTS
// finished (promptDone) before starting the timer. A fallback starts the
// timer anyway so a lost message can never wedge the session.
function startListenTimer(room: Room) {
  if (room.voiceTimer) clearTimeout(room.voiceTimer);
  room.listenTimerOn = true;
  broadcast(room, { type: "voiceWindow", open: true, phase: "listen", until: Date.now() + 10000, seconds: 10 });
  room.voiceTimer = setTimeout(() => {
    if (room.state !== "listening") return;
    room.state = "start";
    broadcast(room, { type: "voiceWindow", open: false, reason: "timeout" });
    speak(room, "Sorry, I didn't hear you say Ready. Click Start when you want to start.");
    broadcastState(room);
  }, 10000);
}

// Steps after the first need no "Ready": speak the step, give a short settle pause, then count down.
function autoStartStep(room: Room, lead = "") {
  room.state = "prompting";
  room.listenTimerOn = false;
  broadcastState(room);
  const asana = getDb().asanas.find((x: any) => x.id === room.asanaId);
  const instr = asana?.steps?.[room.stepIndex]?.instruction || "";
  speak(room, `${lead ? lead + " " : ""}Step ${room.stepIndex + 1}. ${instr}`);
  broadcast(room, { type: "voiceWindow", open: true, phase: "autoprompt" });
  if (room.voiceTimer) clearTimeout(room.voiceTimer);
  room.voiceTimer = setTimeout(() => { if (room.state === "prompting") settleThenCount(room); }, 40000);   // fallback if the Primary never reports prompt-done
}
const SETTLE_MS = 4000;
function settleThenCount(room: Room) {
  if (room.voiceTimer) { clearTimeout(room.voiceTimer); room.voiceTimer = null; }
  room.state = "settling";
  broadcastState(room);
  // After the pause, give the student up to 8 s more to step fully into view BEFORE any warning is spoken.
  const t0 = Date.now() + SETTLE_MS;
  const check = () => {
    if (room.state !== "settling") return;
    if (allInView(room) || Date.now() - t0 > 8000) beginCounting(room); else later(room, check, 300);
  };
  later(room, check, SETTLE_MS);
}

function openVoiceWindow(room: Room, lead = "") {
  room.state = "listening";
  room.listenTimerOn = false;
  broadcastState(room);
  const db = getDb();
  const asana = db.asanas.find((x: any) => x.id === room.asanaId);
  const n = room.stepIndex + 1;
  const instr = asana?.steps?.[room.stepIndex]?.instruction || "";
  // One combined line so the Primary only starts listening after ALL of it is spoken.
  speak(room, `${lead ? lead + " " : ""}Step ${n}. ${instr} Say Ready when you are in position.`);
  broadcast(room, { type: "voiceWindow", open: true, phase: "prompt" });
  // Fallback only: if the Primary never reports prompt-done, listen anyway (long: the prompt reads a whole instruction).
  if (room.voiceTimer) clearTimeout(room.voiceTimer);
  room.voiceTimer = setTimeout(() => { if (room.state === "listening" && !room.listenTimerOn) startListenTimer(room); }, 40000);
}

function beginCounting(room: Room) {
  if (!allInView(room)) {
    const bad = [...room.devices.values()].find((d) => d.isPrimary && !d.inView);
    room.framingBadDevice = bad?.deviceId || null;
    room.state = "warning";
    speak(room, `I cannot measure your pose. Please come fully within the ${bad?.label || "camera"} camera.`);
    broadcast(room, { type: "framing", deviceId: room.framingBadDevice, inView: false });
    broadcastState(room);
    // repeat warning once after 10s (C5/S9.3)
    later(room, () => { if (room.state === "warning") speak(room, `I cannot measure your pose. Please come fully within the ${bad?.label || "camera"} camera.`); }, 10000);
    return;
  }
  room.state = "counting";
  room.framingBadDevice = null;
  const db = getDb();
  const asana = db.asanas.find((x: any) => x.id === room.asanaId);
  const totalSteps = asana?.steps?.length || 0;
  const stepN = room.stepIndex + 1;
  // Fresh capture for this step (a framing pause restarts the step's capture).
  room.captures[stepN] = [];
  for (const k of Object.keys(room.photosInMemory)) if (k.startsWith(`${stepN}:`)) delete room.photosInMemory[k];
  broadcastState(room);

  // Timeline (ms from "Ready"): Get ready -> 1 @2000 -> 2 @4000 -> 3 @6000 = THE photo (one per device, same instant).
  // Clients play the shutter effect + sound as they capture; a short pause later the flow moves on (no hold).
  const COUNT_GAP = 2000, AFTER_SHOT_MS = 1600;
  const t3 = 3 * COUNT_GAP;                       // moment of "3" = the photo
  const photoAt = [t3];
  const guard = () => room.state === "counting";
  const t0 = Date.now();
  speak(room, "Get ready.");
  for (let i = 1; i <= 3; i++) {
    later(room, () => {
      if (!guard()) return;
      if (!allInView(room)) { beginCounting(room); return; } // framing lost -> warning, then restart the step
      speak(room, String(i));
      broadcast(room, { type: "count", step: stepN, set: 1, value: i });
    }, i * COUNT_GAP);
  }
  photoAt.forEach((at, idx) => {
    const set = idx + 1;
    // clients capture at this absolute time; same moment on every device
    later(room, () => { if (guard()) broadcast(room, { type: "captureAt", ts: t0 + at + CAPTURE_LEAD_MS, delayMs: 2 * CAPTURE_LEAD_MS, step: stepN, set, serverNow: Date.now() }); }, Math.max(0, at - CAPTURE_LEAD_MS));
    later(room, () => {
      if (!guard()) return;
      const reported = Object.keys(room.photosInMemory).filter((k) => k.startsWith(`${stepN}:${set}:`)).map((k) => k.split(":")[2]);
      const deviceIds = reported.length ? reported : [...room.devices.keys()];
      (room.captures[stepN] ||= []).push({ set, deviceIds, at: Date.now() });
      broadcastState(room);
    }, at + CAPTURE_LEAD_MS + 600);
  });
  // Photo taken -> ask before moving on (or analyse after the last step).
  later(room, () => {
    if (!guard()) return;
    applyPendingPrimary(room);
    if (room.stepIndex + 1 < totalSteps) {
      room.stepIndex++;
      room.state = "start";
      broadcast(room, { type: "hold", done: true });
      broadcastState(room);
      autoStartStep(room, "Well done. Relax.");
    } else {
      broadcast(room, { type: "hold", done: true });
      // Do not analyse until every device's last photo has actually arrived (uploads lag the shutter).
      const waitFrom = Date.now();
      const photosIn = () => [...room.devices.keys()].every((dev) => room.photosInMemory[`${stepN}:1:${dev}`] !== undefined);
      const poll = () => {
        if (room.state !== "counting") return;
        if (photosIn() || Date.now() - waitFrom > 10000) finishSession(room); else later(room, poll, 200);
      };
      poll();
    }
  }, t3 + CAPTURE_LEAD_MS + AFTER_SHOT_MS);
}

async function finishSession(room: Room) {
  room.state = "analysing";
  speak(room, "Analyzing, please wait.");
  broadcastState(room);
  const db = getDb();
  const asana = db.asanas.find((a: any) => a.id === room.asanaId);
  const steps: any[] = [];
  const debugBySet: Record<number, any> = {};
  for (let i = 0; i < (asana?.steps?.length || 0); i++) {
    broadcast(room, { type: "analysing", step: i + 1 });
    const sets = room.captures[i + 1] || [];
    const best = sets.length ? pickBestSet(sets) : 1;
    // One photo per device/camera for this step (in memory only); the model judges them together.
    // Primary camera first, then the others in join order, each with its device label so the model knows which photo is which camera.
    const order = [...room.devices.values()].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((d) => d.deviceId);
    const entries = Object.entries(room.photosInMemory).filter(([k]) => k.startsWith(`${i + 1}:`)).map(([k, b]) => { const devId = k.split(":")[2]; const dev = room.devices.get(devId); return { devId, buf: b, label: dev ? dev.label : "Camera", primary: !!dev?.isPrimary }; })
      .sort((a, b) => (order.indexOf(a.devId) < 0 ? 99 : order.indexOf(a.devId)) - (order.indexOf(b.devId) < 0 ? 99 : order.indexOf(b.devId)));
    const photos = entries.map((e) => e.buf);
    const photoLabels = entries.map((e) => e.label + (e.primary ? " (Primary)" : ""));
    let reference: Buffer | null = null;
    try { const f = join(OBJECTS_DIR, asana!.steps[i].imageKey); if (existsSync(f)) reference = readFileSync(f); } catch {}
    const v = await validatePose(asana!.steps[i].instruction, photos, reference, photoLabels);
    // DEBUG ONLY (env DEBUG_SHOW_PHOTOS=1): hand the photos that were sent back to the
    // user's own browser so they can verify what was compared. Never written to DB/disk/log.
    if (process.env.DEBUG_SHOW_PHOTOS === "1") {
      const usable = photos.filter((b) => b.length);
      let annotated: string | null = null;
      if (v.verdict === "incorrect" && v.issues?.length && usable.length) {
        try { const ab = await annotatePhoto(usable[Math.min(usable.length, v.bestPhoto || 1) - 1], v.issues); if (ab) annotated = `data:image/png;base64,${ab.toString("base64")}`; } catch {}
      }
      debugBySet[i + 1] = { photos: usable.map((b) => `data:image/jpeg;base64,${b.toString("base64")}`), sent: v.sent, bestPhoto: v.bestPhoto, issues: v.issues, annotatedPhoto: annotated };
    }
    for (const k of Object.keys(room.photosInMemory)) if (k.startsWith(`${i + 1}:`)) delete room.photosInMemory[k];
    // Programmatic overlay only: the client draws marks over the stored
    // image (never a regenerated person), so annotatedKey == stored imageKey.
    const annotatedKey = asana!.steps[i].imageKey;
    steps.push({ n: i + 1, verdict: v.verdict, correctionText: v.correctionText, annotatedKey, marks: v.marks, bestSet: best, imageKey: asana!.steps[i].imageKey, ...(v.checks?.length ? { checks: v.checks } : {}) });
  }
  const practice = { id: id(), userId: room.userId, asanaId: room.asanaId, asanaName: asana?.name, startedAt: room.createdAt, endedAt: now(), steps };
  db.practiceSessions.push(practice);
  room.practiceId = practice.id;
  room.results = { practiceId: practice.id, asanaName: asana?.name, debug: process.env.DEBUG_SHOW_PHOTOS === "1", steps: process.env.DEBUG_SHOW_PHOTOS === "1" ? steps.map((st) => ({ ...st, debug: debugBySet[st.n] })) : steps, correctCount: steps.filter((s) => s.verdict === "correct").length, total: steps.length };
  // Photos existed only in memory: drop references
  room.photosInMemory = {};
  save();
  room.state = "results";
  speak(room, `Results. ${room.results.correctCount} of ${steps.length} steps correct. This is a factual count, not a grade.`);
  broadcast(room, { type: "results", results: room.results });
  broadcastState(room);
}

export function handleWsMessage(room: Room, device: Device, raw: string) {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { send(device.ws, { type: "error", error: "Invalid JSON" }); return; }
  const v = validateClientMessage(parsed);
  if (!v.ok) { send(device.ws, { type: "error", error: v.error }); return; }
  const msg: any = v.msg;
  device.lastSeen = Date.now();
  switch (msg.type) {
    case "ping": send(device.ws, { type: "pong", serverNow: Date.now(), clientTs: msg.ts }); return;
    case "enableState": device.camera = !!msg.camera; if (msg.inView !== undefined) device.inView = !!msg.inView; broadcastState(room); return;
    case "frameState": {
      device.inView = !!msg.inView;
      broadcast(room, { type: "framing", deviceId: device.deviceId, inView: device.inView });
      // Framing only matters once the countdown runs. Out-of-frame flickers while we wait for "Ready" must not interrupt the listening window.
      if (!device.inView && device.isPrimary && room.state === "counting") {
        clearTimers(room); room.state = "warning"; room.framingBadDevice = device.deviceId;
        speak(room, `I cannot measure your pose. Please come fully within the ${device.label} camera.`);
        broadcastState(room);
      } else if (device.inView && room.state === "warning" && allInView(room)) {
        room.framingBadDevice = null;
        // ~1s all-in-view then automatic recount of interrupted capture (no tap)
        later(room, () => {
          if (room.state !== "warning" || !allInView(room)) return;
          beginCounting(room);   // "Ready" was already said (or not needed): just resume the countdown, never re-ask
        }, 1000);
        broadcastState(room);
      }
      return;
    }
    case "setFraming": device.inView = !!msg.inView; broadcastState(room); return;
    case "claimPrimary": case "switchPrimary": {
      const inCapture = room.state === "counting";
      if (inCapture) {
        room.pendingPrimary = device.deviceId; room.switchQueued = true;
        send(device.ws, { type: "state", note: "Primary after this step", pendingPrimary: device.deviceId });
        broadcastState(room);
      } else {
        for (const d of room.devices.values()) d.isPrimary = d.deviceId === device.deviceId;
        broadcast(room, { type: "roleChanged", primaryId: device.deviceId, atStep: room.stepIndex });
        speak(room, `${device.label} is now the Primary device.`);
        broadcastState(room);
      }
      return;
    }
    case "startDemo": {
      if (room.state === "demo") return; // duplicate Start taps must not restart/corrupt the sequence
      room.state = "demo";
      room.demoIdx = 0; room.demoPaused = false; room.demoAwait = -1;
      broadcastState(room);
      runDemoTick(room);
      return;
    }
    case "demoControl": {
      if (msg.action === "end") { if (room.demoTimer) clearTimeout(room.demoTimer); room.demoPaused = false; room.demoAwait = -1; room.state = "start"; broadcastState(room); }
      if (msg.action === "pause" && room.state === "demo") { room.demoPaused = true; if (room.demoTimer) clearTimeout(room.demoTimer); }
      if (msg.action === "resume" && room.state === "demo") {
        room.demoPaused = false;
        const t = getDb().asanas.find((a: any) => a.id === room.asanaId)?.steps?.[room.demoIdx]?.instruction || "";
        scheduleDemoNext(room, room.demoAwait === -1 ? DEMO_PAUSE_MS : demoFallbackMs(t));   // current step already spoken -> go on; otherwise wait for it
      }
      if (msg.action === "again" && room.state === "demo") {
        const asana = getDb().asanas.find((a: any) => a.id === room.asanaId);
        const line = `Step ${room.demoIdx + 1}. ${asana?.steps?.[room.demoIdx]?.instruction || ""}`;
        room.demoAwait = room.demoIdx;
        broadcast(room, { type: "demoStep", n: room.demoIdx + 1, again: true });
        speak(room, line);
        if (!room.demoPaused) scheduleDemoNext(room, demoFallbackMs(line));
      }
      return;
    }
    case "demoSpoken": {
      // Primary finished speaking demo step n: pause briefly, then show/speak the next one.
      if (room.state !== "demo" || !device.isPrimary || Number(msg.n) !== room.demoIdx + 1 || room.demoAwait !== room.demoIdx) return;
      room.demoAwait = -1;
      if (!room.demoPaused) scheduleDemoNext(room, DEMO_PAUSE_MS);
      return;
    }
    case "readyClicked": {
      // Start screen: the ONLY click. It opens the voice window; it never starts counting itself (S6.4).
      if (room.state === "results") { room.stepIndex = 0; room.captures = {}; room.results = null; }
      room.state = "start"; broadcastState(room); openVoiceWindow(room);
      return;
    }
    case "promptDone": {
      // Primary finished speaking the prompt: start the 10 s listening
      // window now. Ignored once the timer is running (fallback) so the
      // window is never shortened or restarted by a duplicate.
      if (room.state === "prompting" && device.isPrimary) { settleThenCount(room); return; }
      if (room.state !== "listening" || !device.isPrimary || room.listenTimerOn) return;
      startListenTimer(room);
      return;
    }
    case "voiceText": {
      if (room.state !== "listening") return;
      const m = matchReady(String(msg.text || ""));
      broadcast(room, { type: "voiceDecision", heard: !!m.matched, phrase: m.phrase, latencyMs: msg.latencyMs ?? null });
      if (m.matched) { if (room.voiceTimer) clearTimeout(room.voiceTimer); broadcast(room, { type: "voiceWindow", open: false }); beginCounting(room); }
      return;
    }
    case "captureBlob": {
      // Photos held in MEMORY ONLY (Buffer in the room, dropped after
      // validation): never to disk/DB/log. JPEG data URL, capped ~700 KB.
      const key = `${msg.step}:${msg.set}:${device.deviceId}`;
      const dataUrl = String((msg as any).dataUrl || "");
      const m = dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
      if (m && m[1].length < 950_000) {
        room.photosInMemory[key] = Buffer.from(m[1], "base64");
        // DEBUG ONLY (DEBUG_SHOW_PHOTOS=1): keep a local copy so the owner/developer can inspect what was captured.
        if (process.env.DEBUG_SHOW_PHOTOS === "1") { try { const dir = join(DATA_DIR, "debug-photos", room.code); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `step${msg.step}-set${msg.set}-${device.label.replace(/\W/g, "")}.jpg`), room.photosInMemory[key]); } catch {} }
      }
      else if (!room.photosInMemory[key]) room.photosInMemory[key] = Buffer.alloc(0); // presence only (simulator)
      device.fireTimes.push(Number(msg.fireAt || Date.now()));
      return;
    }
    case "skelFrame": {
      // Skeleton keypoints only (no video, no image) from a Secondary camera, relayed to the Primary for its small thumbnail. Validated and rate-limited.
      if (device.isPrimary) return;
      const t = Date.now(); if (t - ((device as any).lastSkel || 0) < 80) return; (device as any).lastSkel = t;
      const w = Number(msg.w), h = Number(msg.h), pts = msg.pts;
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096 || !Array.isArray(pts) || pts.length !== 33) return;
      const clean: number[][] = [];
      for (const p of pts) { if (!Array.isArray(p) || p.length !== 3 || !p.every((n: any) => typeof n === "number" && isFinite(n))) return; clean.push([p[0], p[1], p[2]]); }
      const primary = [...room.devices.values()].find((d) => d.isPrimary);
      if (primary) send(primary.ws, { type: "skel", from: device.deviceId, label: device.label, w, h, pts: clean });
      return;
    }
    case "rtc": broadcastExcept(room, device, { type: "rtc", from: device.deviceId, payload: msg.payload }); return;
    case "beginStep": if (room.state === "start") openVoiceWindow(room); return;
    case "endSession": room.state = "ended"; clearTimers(room); broadcastState(room); return;
  }
}
function broadcastExcept(room: Room, except: Device, obj: unknown) { for (const d of room.devices.values()) if (d.deviceId !== except.deviceId) send(d.ws, obj); }

export function onDeviceDisconnect(room: Room, device: Device) {
  const wasPrimary = device.isPrimary;
  room.devices.delete(device.deviceId);
  broadcast(room, { type: "deviceOffline", id: device.deviceId, label: device.label });
  if (room.devices.size) {
    speak(room, `${device.label} has gone offline.`);
    if (wasPrimary) promoteEarliest(room, "primary-left");
  }
  broadcastState(room);
  if (!room.devices.size) { clearTimers(room); rooms.delete(room.code); }
}
