import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Behavioural API tests against a spawned server on a test port.
process.env.NO_PROXY = "127.0.0.1,localhost";
process.env.no_proxy = "127.0.0.1,localhost";
delete process.env.HTTP_PROXY; delete process.env.http_proxy; delete process.env.HTTPS_PROXY; delete process.env.https_proxy;
const PORT = 18099;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = mkdtempSync(join(tmpdir(), "muse-api-test-"));   // throw-away data folder: freshly seeded, never the real data
let proc: any; let cookie = ""; let csrf = "";
async function req(path: string, opts: any = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), ...(opts.headers || {}) } });
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) { const parts = setCookie.split(/,(?=\s*muse_)/).map((s: string) => s.split(";")[0].trim()); cookie = parts.join("; "); const m = setCookie.match(/muse_csrf=([^;]+)/); if (m) csrf = decodeURIComponent(m[1]); }
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function latestCode(email: string, purpose: string) {
  const mails: any[] = await (await fetch(BASE + "/api/dev/mail")).json();
  const m = mails.find((x: any) => x.to === email && x.purpose === (purpose === "register" ? "registration" : "login"));
  return m?.code;
}
before(async () => {
  proc = spawn("node", ["--import", "tsx", "apps/server/src/index.ts"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DISABLE_HTTPS: "1", MAILER: "file", AI_PROVIDER: "mock", MUSE_DATA_DIR: DATA }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(BASE + "/health"); if (r.ok) return; } catch {} await sleep(200); }
  throw new Error("server did not start");
});
after(() => { proc?.kill(); rmSync(DATA, { recursive: true, force: true }); });

test("health returns booleans only", async () => {
  const { body } = await req("/health");
  assert.equal(body.ok, true); assert.equal(typeof body.db, "boolean");
  assert.ok(Object.values(body).every((v) => typeof v === "boolean"), "every /health value is boolean (S11.1)");
  assert.equal(JSON.stringify(body).includes("META"), false);
});
test("WS upgrade from foreign origin rejected before handshake (S11.4)", async () => {
  const { default: WebSocket } = await import("ws");
  const outcome = await new Promise<string>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: "https://evil.example", Cookie: cookie } });
    const to = setTimeout(() => resolve("timeout"), 4000);
    ws.on("open", () => { clearTimeout(to); ws.close(); resolve("opened"); });
    ws.on("error", (e: any) => { clearTimeout(to); resolve(`error:${e.message}`); });
    ws.on("unexpected-response", (_r: any, res: any) => { clearTimeout(to); resolve(`status:${res.statusCode}`); });
  });
  assert.notEqual(outcome, "opened", outcome);
});
test("register + login OTP flow with device cap shape", async () => {
  const email = `qa-${Date.now()}@example.com`;
  let r = await req("/auth/otp/request", { method: "POST", body: JSON.stringify({ email, purpose: "register" }) });
  assert.equal(r.status, 200);
  const code = await latestCode(email, "register"); assert.ok(code, "code in file mail");
  r = await req("/auth/otp/verify", { method: "POST", body: JSON.stringify({ email, code, purpose: "register", profile: { firstName: "Qa", lastName: "One", age: 30, zip: "12345" } }) });
  assert.equal(r.status, 200); assert.equal(r.body.user.email, email);
  const pub = await req("/api/public?search=Vrikshasana");
  assert.ok(pub.body.items.some((a: any) => a.name.includes("k")), "Vrikshasana found without diacritics (S2.1)");
  const foreign = await req("/api/asanas/asana-chakrasana");
  assert.equal(foreign.status, 200);
});
test("voice matcher endpoint (S8.1)", async () => {
  for (const [text, want] of [["ready", true], ["I'm ready", true], ["let us start", true], ["already", false], ["not ready", false], ["let us stop", false]] as const) {
    const r = await fetch(BASE + "/api/voice/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const b: any = await r.json(); assert.equal(b.matched, want, text);
  }
});
test("admin routes 403 for normal user (S5.7)", async () => {
  const r = await req("/api/admin/settings");
  assert.equal(r.status, 403);
});
test("unauthenticated API rejected (S1.6 API equivalent)", async () => {
  const r = await fetch(BASE + "/api/public"); assert.equal(r.status, 401);
});
test("creation images write step files, then accept (S3.4/S3.5 mock)", async () => {
  const start = await req("/api/creation/start", { method: "POST", body: JSON.stringify({ name: "Bhujangasana", characterId: "char-boy" }) });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const imgs = await req(`/api/creation/${start.body.draftId}/images`, { method: "POST", body: JSON.stringify({}) });
  assert.equal(imgs.status, 200, JSON.stringify(imgs.body));
  assert.ok(imgs.body.results.every((r: any) => r.gate && r.imageKey), "every step gated with an imageKey");
  const accepted = await req(`/api/creation/${start.body.draftId}/accept`, { method: "POST", body: JSON.stringify({}) });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  for (const s of accepted.body.steps) {
    const r = await fetch(`${BASE}/files/${s.imageKey}`, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200, s.imageKey);
    assert.ok((await r.arrayBuffer()).byteLength > 100, "stored step image has real bytes");
  }
});
test("voice transcribe: multipart upload + JSON hook (S8.7 seam)", async () => {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69])], { type: "audio/wav" }), "clip.wav");
  const r = await fetch(BASE + "/api/voice/transcribe", { method: "POST", headers: { Cookie: cookie, "x-csrf-token": csrf }, body: form });
  assert.equal(r.status, 200);
  const b: any = await r.json();
  assert.equal(b.matched, false, "mock transcribe hears nothing, matches nothing");
  const hook = await req("/api/voice/transcribe", { method: "POST", body: JSON.stringify({ text: "let us start" }) });
  assert.equal(hook.body.matched, true);
});
test("WS practice flow: photos in memory only, results + clean history (S7/S10)", { timeout: 120000 }, async () => {
  const sess = await req("/api/sessions", { method: "POST", body: JSON.stringify({ asanaId: "asana-tadasana" }) });
  assert.equal(sess.status, 200, JSON.stringify(sess.body));
  const { default: WebSocket } = await import("ws");
  const results: any = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
    const to = setTimeout(() => reject(new Error("WS flow timed out")), 110000);
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAAQABADAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwEf/9k=";
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", code: sess.body.code, label: "Test Laptop" })));
    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "state" && msg.state === "setup") ws.send(JSON.stringify({ type: "readyClicked" }));
      if (msg.type === "voiceWindow" && msg.open) ws.send(JSON.stringify({ type: "voiceText", text: "ready" }));
      if (msg.type === "captureAt") setTimeout(() => ws.send(JSON.stringify({ type: "captureBlob", step: msg.step, set: msg.set, dataUrl: jpeg, bytes: jpeg.length, fireAt: Date.now() })), Math.max(0, msg.ts - Date.now()));
      if (msg.type === "results") { clearTimeout(to); ws.close(); resolve(msg.results); }
      if (msg.type === "error") { clearTimeout(to); reject(new Error(msg.error)); }
    });
    ws.on("error", (e: any) => { clearTimeout(to); reject(e); });
  });
  assert.equal(results.total, 2);
  assert.ok(results.steps.every((s: any) => s.verdict === "correct"), "mock vision verdicts correct");
  assert.ok(results.steps.every((s: any) => s.imageKey && s.annotatedKey === s.imageKey), "annotation overlays stored image");
  const hist = await req("/api/history");
  const mine = hist.body.find((h: any) => h.id === results.practiceId);
  assert.ok(mine, "session in history");
  const blob = JSON.stringify(mine);
  for (const bad of ["data:image", "photoData", "audioData", "transcript"]) assert.equal(blob.includes(bad), false, `history must not contain ${bad} (S11.5)`);
});
test("demo broadcasts each step index with its narration, in order (demo image sync)", { timeout: 60000 }, async () => {
  const sess = await req("/api/sessions", { method: "POST", body: JSON.stringify({ asanaId: "asana-tadasana" }) });
  assert.equal(sess.status, 200, JSON.stringify(sess.body));
  const { default: WebSocket } = await import("ws");
  const seen = await new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
    const steps: number[] = []; const spoken: string[] = []; const at: number[] = [];
    const to = setTimeout(() => reject(new Error(`demo timed out, steps=${steps}`)), 50000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", code: sess.body.code, label: "Demo Test" })));
    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "state" && msg.state === "setup") ws.send(JSON.stringify({ type: "startDemo" }));
      if (msg.type === "demoStep" && msg.n >= 1) {
        steps.push(msg.n); at.push(Date.now());
        // the Primary's TTS takes a while to finish step 1; the next step must wait for it (images never outrun the voice)
        const n = msg.n; setTimeout(() => ws.send(JSON.stringify({ type: "demoSpoken", n })), n === 1 ? 4000 : 100);
      }
      if (msg.type === "spoken") spoken.push(msg.text);
      if (msg.type === "demoStep" && msg.done) { clearTimeout(to); ws.close(); resolve({ steps, spoken, at }); }
    });
    ws.on("error", (e: any) => { clearTimeout(to); reject(e); });
  });
  assert.deepEqual(seen.steps, [1, 2], "demo steps broadcast in order, one per step");
  assert.ok(seen.at[1] - seen.at[0] >= 5300, `step 2 waited for step 1's speech to finish (+1.5 s pause), gap=${seen.at[1] - seen.at[0]} ms`);
  assert.ok(seen.spoken.some((t: string) => t.startsWith("Step 1.")), "Step 1 narrated");
  assert.ok(seen.spoken.some((t: string) => t.startsWith("Step 2.")), "Step 2 narrated with its own step index");
});
test("listening window starts after the prompt, not during it (S8.5)", { timeout: 60000 }, async () => {
  const sess = await req("/api/sessions", { method: "POST", body: JSON.stringify({ asanaId: "asana-tadasana" }) });
  assert.equal(sess.status, 200);
  const { default: WebSocket } = await import("ws");
  const seen = await new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
    const phases: string[] = []; const spoken: string[] = [];
    const to = setTimeout(() => reject(new Error(`voice handshake timed out, phases=${phases}`)), 50000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", code: sess.body.code, label: "Voice Test" })));
    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "state" && msg.state === "setup") ws.send(JSON.stringify({ type: "readyClicked" }));
      if (msg.type === "spoken" && /say ready/i.test(msg.text)) spoken.push(msg.text);
      if (msg.type === "voiceWindow" && msg.open && msg.phase === "prompt") {
        // client reports TTS done only after the prompt finished speaking
        setTimeout(() => ws.send(JSON.stringify({ type: "promptDone" })), 500);
      }
      if (msg.type === "voiceWindow" && msg.open && msg.phase === "listen") {
        phases.push("listen");
        ws.send(JSON.stringify({ type: "voiceText", text: "ready" }));
      }
      if (msg.type === "count" && msg.value === 3) { clearTimeout(to); ws.close(); resolve({ phases, spoken }); }
      if (msg.type === "error") { clearTimeout(to); reject(new Error(msg.error)); }
    });
    ws.on("error", (e: any) => { clearTimeout(to); reject(e); });
  });
  assert.ok(seen.spoken.length > 0, "prompt was spoken before listening");
  assert.deepEqual(seen.phases, ["listen"], "exactly one listen window, started by promptDone");
});
test("step timeline: 1-2-3 at 2 s gaps, ONE photo on the 3 (no hold), then starts the next step by itself (no Ready)", { timeout: 60000 }, async () => {
  const sess = await req("/api/sessions", { method: "POST", body: JSON.stringify({ asanaId: "asana-tadasana" }) });
  const { default: WebSocket } = await import("ws");
  const seen = await new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
    const counts: Array<[number, number]> = []; let holdAt = 0; const spoken: string[] = []; const sets: number[] = [];
    const to = setTimeout(() => reject(new Error("timeline timed out " + JSON.stringify({ counts, holdAt, spoken }))), 50000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", code: sess.body.code, label: "T" })));
    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "state" && msg.state === "setup") ws.send(JSON.stringify({ type: "readyClicked" }));
      if (msg.type === "voiceWindow" && msg.open && msg.phase === "prompt") setTimeout(() => ws.send(JSON.stringify({ type: "promptDone" })), 200);
      if (msg.type === "voiceWindow" && msg.open && msg.phase === "listen" && !counts.length) ws.send(JSON.stringify({ type: "voiceText", text: "ready" }));
      if (msg.type === "voiceWindow" && msg.open && msg.phase === "autoprompt") setTimeout(() => ws.send(JSON.stringify({ type: "promptDone" })), 200);
      if (msg.type === "count") counts.push([msg.value, Date.now()]);
      if (msg.type === "captureAt") sets.push(msg.set);
      if (msg.type === "hold" && !msg.done) holdAt = Date.now();
      if (msg.type === "spoken") spoken.push(msg.text);
      if (msg.type === "voiceWindow" && msg.open && msg.phase === "autoprompt" && counts.length === 3) { clearTimeout(to); ws.close(); resolve({ counts, holdAt, spoken, sets, promptAt: Date.now() }); }
    });
    ws.on("error", (e: any) => { clearTimeout(to); reject(e); });
  });
  assert.deepEqual(seen.counts.map((c: any) => c[0]), [1, 2, 3]);
  assert.ok(seen.counts[1][1] - seen.counts[0][1] >= 1800 && seen.counts[2][1] - seen.counts[1][1] >= 1800, "2 s between numbers");
  assert.deepEqual(seen.sets, [1], "exactly one photo per step (per device)");
  assert.equal(seen.holdAt, 0, "no multi-second hold any more");
  assert.ok(!seen.spoken.some((t: string) => /stay in that pose/i.test(t)));
  assert.ok(seen.promptAt - seen.counts[2][1] < 5000, "moves on within a few seconds of the photo");
  assert.ok(seen.spoken.some((t: string) => /Step 2\./i.test(t)), "reads step 2 aloud");
  assert.ok(!seen.spoken.some((t: string) => /Step 2\..*Say Ready/i.test(t)), "no Ready needed after step 1");
});
test("skeleton keypoints from a Secondary reach the Primary only; bad frames are dropped", { timeout: 30000 }, async () => {
  const sess = await req("/api/sessions", { method: "POST", body: JSON.stringify({ asanaId: "asana-tadasana" }) });
  const { default: WebSocket } = await import("ws");
  const open = (label: string) => new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
    const got: any[] = []; ws.on("message", (d: Buffer) => got.push(JSON.parse(d.toString())));
    ws.on("open", () => { ws.send(JSON.stringify({ type: "join", code: sess.body.code, label })); setTimeout(() => resolve({ ws, got }), 600); });
    ws.on("error", reject);
  });
  const prim = await open("Laptop"); const sec = await open("Phone");
  const good = Array.from({ length: 33 }, (_, i) => [i / 40, i / 50, 0.9]);
  sec.ws.send(JSON.stringify({ type: "skelFrame", w: 480, h: 640, pts: good }));
  await new Promise((r) => setTimeout(r, 300));
  sec.ws.send(JSON.stringify({ type: "skelFrame", w: 480, h: 640, pts: good.slice(0, 5) }));        // wrong length: dropped
  await new Promise((r) => setTimeout(r, 300));
  prim.ws.send(JSON.stringify({ type: "skelFrame", w: 480, h: 640, pts: good }));                  // Primary never relays to itself/others
  await new Promise((r) => setTimeout(r, 300));
  const skel = prim.got.filter((m: any) => m.type === "skel");
  prim.ws.close(); sec.ws.close();
  assert.equal(skel.length, 1, "exactly the one valid Secondary frame reached the Primary");
  assert.equal(skel[0].label, "Phone"); assert.equal(skel[0].pts.length, 33);
  assert.equal(sec.got.filter((m: any) => m.type === "skel").length, 0, "Secondary receives no skeleton frames");
});
test("favourites list delete with empty body (QA D2 regression, S2.4)", async () => {
  const created = await req("/api/favourites", { method: "POST", body: JSON.stringify({ name: "ToDelete" }) });
  assert.equal(created.status, 200);
  // Exactly what a browser DELETE sends: Content-Type set, no body.
  const r = await fetch(`${BASE}/api/favourites/${created.body.id}`, { method: "DELETE", headers: { "Content-Type": "application/json", Cookie: cookie, "x-csrf-token": csrf } });
  assert.equal(r.status, 200);
  const lists = await req("/api/favourites");
  assert.equal(lists.body.some((l: any) => l.id === created.body.id), false);
});
