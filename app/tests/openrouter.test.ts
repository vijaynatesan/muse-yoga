import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// AI_PROVIDER=openrouter: requests must use OpenRouter's shapes and the meta/* model ids (stub server, no spend).
process.env.NO_PROXY = "127.0.0.1,localhost"; process.env.no_proxy = "127.0.0.1,localhost";
delete process.env.HTTP_PROXY; delete process.env.http_proxy; delete process.env.HTTPS_PROXY; delete process.env.https_proxy;
const PORT = 18093, STUB = 18092, BASE = `http://127.0.0.1:${PORT}`, STAMP = Date.now(), EMAIL = `qa-or-${STAMP}@example.com`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 7)]).toString("base64");
let proc: any, stub: any; const DATA = mkdtempSync(join(tmpdir(), "muse-or-")); const hits: Array<{ url: string; auth: string; body: any }> = [];
let cookie = "", csrf = "";
const req = async (path: string, method = "GET", body?: any, raw?: FormData) => {
  const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const sc = r.headers.get("set-cookie");
  if (sc) { cookie = sc.split(/,(?=\s*muse_)/).map((x) => x.split(";")[0].trim()).join("; "); const m = sc.match(/muse_csrf=([^;]+)/); if (m) csrf = decodeURIComponent(m[1]); }
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
};
before(async () => {
  stub = createServer((rq, rs) => {
    let b = ""; rq.on("data", (c) => (b += c)); rq.on("end", () => {
      let body: any = null; try { body = JSON.parse(b); } catch { /* multipart */ }
      hits.push({ url: rq.url || "", auth: String(rq.headers.authorization || ""), body });
      const send = (o: any) => { rs.writeHead(200, { "Content-Type": "application/json" }); rs.end(JSON.stringify(o)); };
      if (rq.url?.endsWith("/chat/completions")) return send({ choices: [{ message: { content: '{"steps":[{"instruction":"Stand tall.","duration_seconds":15},{"instruction":"Raise arms.","duration_seconds":20}],"difficulty":"Beginner","body_part":"Full Body","category":"Standing","benefits":["Posture"],"contraindications":["Vertigo"]}' } }], usage: { cost: 0.0123 } });
      if (rq.url?.endsWith("/audio/transcriptions")) return send({ text: "I am ready.", usage: { cost: 0.00008 } });
      if (rq.url?.endsWith("/images")) return send({ data: [{ b64_json: PNG, media_type: "image/png" }], usage: { cost: 0.04 } });
      rs.writeHead(404); rs.end("{}");
    });
  }).listen(STUB);
  proc = spawn("node", ["--import", "tsx", "apps/server/src/index.ts"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DISABLE_HTTPS: "1", MAILER: "file", AI_PROVIDER: "openrouter", AI_IMAGE_PROVIDER: "openrouter", OPENROUTER_API_KEY: "or-test-key", OPENROUTER_API_BASE: `http://127.0.0.1:${STUB}/api/v1`, ADMIN_EMAILS: EMAIL, MUSE_DATA_DIR: DATA }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(200); }
  await req("/auth/otp/request", "POST", { email: EMAIL, purpose: "register" });
  const mails: any[] = await (await fetch(BASE + "/api/dev/mail")).json();
  const r = await req("/auth/otp/verify", "POST", { email: EMAIL, code: mails.find((m) => m.to === EMAIL && m.purpose === "registration")?.code, purpose: "register", profile: { firstName: "Or", lastName: "Qa", age: 30, zip: "12345" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
after(() => { proc?.kill(); stub?.close(); rmSync(DATA, { recursive: true, force: true }); });

let draftId = "";
test("steps generation uses OpenRouter chat/completions with meta/muse-wonder and the OpenRouter key", async () => {
  const r = await req("/api/creation/start", "POST", { name: "Padmasana", characterId: "char-boy" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.steps.length, 2); draftId = r.body.draftId;
  const h = hits.find((x) => x.url.endsWith("/chat/completions"))!;
  assert.equal(h.auth, "Bearer or-test-key"); assert.equal(h.body.model, "meta/muse-wonder"); assert.equal(h.body.messages[0].content[0].type, "text");
});
test("step images use OpenRouter /images with meta/muse-image and a reference image; real bytes are stored", async () => {
  const r = await req(`/api/creation/${draftId}/images`, "POST", {});
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const h = hits.find((x) => x.url.endsWith("/images"))!;
  assert.equal(h.body.model, "meta/muse-image"); assert.match(h.body.input_references[0].image_url.url, /^data:image\/png;base64,/); assert.match(h.body.prompt, /continuous yoga sequence/);
});
test("one-shot transcribe uses OpenRouter /audio/transcriptions with meta/muse-voice-transcribe-1.0", async () => {
  const fd = new FormData(); fd.set("audio", new Blob([Buffer.alloc(3000, 1)], { type: "audio/wav" }), "clip.wav");
  const r = await req("/api/voice/transcribe", "POST", undefined, fd);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const h = hits.find((x) => x.url.endsWith("/audio/transcriptions"))!;
  assert.equal(h.body.model, "meta/muse-voice-transcribe-1.0"); assert.equal(h.body.input_audio.format, "wav"); assert.ok(h.body.input_audio.data.length > 100);
});
test("actual OpenRouter cost is logged, tagged with the provider", async () => {
  const calls = await req("/api/admin/ai-calls");
  const c = calls.body.find((x: any) => x.purpose === "creation.steps");
  assert.ok(c && c.estUsd === 0.0123 && c.provider === "openrouter", JSON.stringify(c));
});

test("step image prompts carry earlier steps forward (no independent per-step drawings)", async () => {
  const { imagePrompt } = await import("../apps/server/src/ai.ts");
  const p = imagePrompt("Bring your palms together.", 4, { total: 6, pose: "Standing on the left leg, right foot on the left thigh, palms together at the chest.", previous: ["Stand tall.", "Shift weight left.", "Slide right foot to the inner left thigh."] });
  assert.match(p, /step 4 of 6/); assert.match(p, /STILL HELD/); assert.match(p, /3\) Slide right foot/); assert.match(p, /COMPLETE body position[^\n]*right foot on the left thigh/);
  const noPose = imagePrompt("Raise arms.", 2, { previous: ["Stand tall."] });
  assert.match(noPose, /apply it on top of the positions held from earlier steps/);
});
