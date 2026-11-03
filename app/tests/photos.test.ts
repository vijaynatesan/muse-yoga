import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// History photos: the (client-blurred) photo of each step is saved for its owner only, validated, time-limited and deletable.
process.env.NO_PROXY = "127.0.0.1,localhost"; process.env.no_proxy = "127.0.0.1,localhost";
delete process.env.HTTP_PROXY; delete process.env.http_proxy; delete process.env.HTTPS_PROXY; delete process.env.https_proxy;
const PORT = 18098, BASE = `http://127.0.0.1:${PORT}`, STAMP = Date.now();
let proc: any; const DATA = mkdtempSync(join(tmpdir(), "muse-photos-"));
const JPEG = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1500, 9), Buffer.from([0xff, 0xd9])]).toString("base64");

function client() {
  let cookie = "", csrf = "";
  const req = async (path: string, method = "GET", body?: any) => {
    const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie");
    if (sc) { cookie = sc.split(/,(?=\s*muse_)/).map((x) => x.split(";")[0].trim()).join("; "); const m = sc.match(/muse_csrf=([^;]+)/); if (m) csrf = decodeURIComponent(m[1]); }
    return { status: r.status, body: await r.json().catch(() => ({})) as any };
  };
  const register = async (email: string) => {
    await req("/auth/otp/request", "POST", { email, purpose: "register" });
    const mails: any[] = await (await fetch(BASE + "/api/dev/mail")).json();
    const r = await req("/auth/otp/verify", "POST", { email, code: mails.find((m) => m.to === email && m.purpose === "registration")?.code, purpose: "register", profile: { firstName: "Ph", lastName: "Qa", age: 30, zip: "12345" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  };
  return { req, register, file: (key: string) => fetch(`${BASE}/files/${key}`, { headers: { Cookie: cookie } }), cookie: () => cookie };
}
const a = client(), b = client(); let pid = "", keys: string[] = [];

before(async () => {
  proc = spawn("node", ["--import", "tsx", "apps/server/src/index.ts"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DISABLE_HTTPS: "1", MAILER: "file", AI_PROVIDER: "mock", MUSE_DATA_DIR: DATA }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(200); }
  await a.register(`qa-ph-a-${STAMP}@example.com`); await b.register(`qa-ph-b-${STAMP}@example.com`);
  const sess = await a.req("/api/sessions", "POST", { asanaId: "asana-tadasana" }); assert.equal(sess.status, 200, JSON.stringify(sess.body));
  const { default: WebSocket } = await import("ws");
  pid = await new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: a.cookie(), Origin: BASE } });
    const to = setTimeout(() => reject(new Error("practice flow timed out")), 100000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", code: sess.body.code, label: "Laptop" })));
    ws.on("message", (d: Buffer) => {
      const m = JSON.parse(d.toString());
      if (m.type === "state" && m.state === "setup") ws.send(JSON.stringify({ type: "readyClicked" }));
      if (m.type === "voiceWindow" && m.open) ws.send(JSON.stringify({ type: "voiceText", text: "ready" }));
      if (m.type === "captureAt") setTimeout(() => ws.send(JSON.stringify({ type: "captureBlob", step: m.step, set: m.set, dataUrl: JPEG, bytes: JPEG.length, fireAt: Date.now() })), Math.max(0, m.ts - Date.now()));
      if (m.type === "results") { clearTimeout(to); ws.close(); resolve(m.results.practiceId); }
    });
    ws.on("error", (e: any) => { clearTimeout(to); reject(e); });
  });
});
after(() => { proc?.kill(); rmSync(DATA, { recursive: true, force: true }); });

test("owner can save a blurred photo for each step; history lists the keys; the file is served to the owner only", { timeout: 120000 }, async () => {
  for (const n of [1, 2]) { const r = await a.req(`/api/history/${pid}/photos/${n}`, "POST", { dataUrl: JPEG }); assert.equal(r.status, 200, JSON.stringify(r.body)); keys.push(r.body.photoKey); }
  const h = await a.req(`/api/history/${pid}`); assert.deepEqual(h.body.steps.map((s: any) => s.photoKey), keys);
  const own = await a.file(keys[0]); assert.equal(own.status, 200); assert.equal(own.headers.get("content-type"), "image/jpeg"); assert.match(own.headers.get("cache-control") || "", /private/);
  const other = await b.file(keys[0]); assert.equal(other.status, 404, "another user cannot fetch it");
  const anon = await fetch(`${BASE}/files/${keys[0]}`); assert.equal(anon.status, 401);
});
test("other users cannot add photos to or delete photos from someone else's session; bad images are refused", async () => {
  assert.equal((await b.req(`/api/history/${pid}/photos/1`, "POST", { dataUrl: JPEG })).status, 404);
  assert.equal((await b.req(`/api/history/${pid}/photos`, "DELETE")).status, 404);
  assert.equal((await a.req(`/api/history/${pid}/photos/1`, "POST", { dataUrl: "data:image/png;base64,AAAA" })).status, 400, "only JPEG data URLs");
  assert.equal((await a.req(`/api/history/${pid}/photos/1`, "POST", { dataUrl: "data:image/jpeg;base64," + Buffer.from("not a jpeg at all".repeat(60)).toString("base64") })).status, 400, "magic bytes checked");
  assert.equal((await a.req(`/api/history/${pid}/photos/9`, "POST", { dataUrl: JPEG })).status, 400, "step out of range");
  assert.equal((await a.req(`/api/history/${pid}/photos/1`, "POST", { dataUrl: "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(450 * 1024, 1)]).toString("base64") })).status, 400, "size cap");
});
test("owner can delete the saved photos of a session; files and history keys are removed", async () => {
  const d = await a.req(`/api/history/${pid}/photos`, "DELETE"); assert.equal(d.status, 200); assert.equal(d.body.removed, 2);
  const h = await a.req(`/api/history/${pid}`); assert.ok(h.body.steps.every((s: any) => !s.photoKey));
  assert.equal((await a.file(keys[0])).status, 404);
  assert.equal(existsSync(join(DATA, "objects", keys[0])), false, "file removed from disk");
});
