import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// When Meta rejects calls (e.g. 402 billing_not_configured), creation must fail with a clear message — not a bare 500 — and must not burn feedback attempts.
process.env.NO_PROXY = "127.0.0.1,localhost"; process.env.no_proxy = "127.0.0.1,localhost";
delete process.env.HTTP_PROXY; delete process.env.http_proxy; delete process.env.HTTPS_PROXY; delete process.env.https_proxy;
const PORT = 18095, STUB = 18094, BASE = `http://127.0.0.1:${PORT}`, STAMP = Date.now();
const ADMIN = `qa-aiadmin-${STAMP}@example.com`, USER = `qa-aiuser-${STAMP}@example.com`;
let proc: any, stub: any; const DATA = mkdtempSync(join(tmpdir(), "muse-aifail-")); let stubStatus = 402; let stubHits = 0;

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
    const r = await req("/auth/otp/verify", "POST", { email, code: mails.find((m) => m.to === email && m.purpose === "registration")?.code, purpose: "register", profile: { firstName: "Qa", lastName: "Ai", age: 30, zip: "12345" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  };
  return { req, register };
}
const admin = client(), user = client();

before(async () => {
  stub = createServer((req, res) => { stubHits++; req.resume(); res.writeHead(stubStatus, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: stubStatus === 402 ? "billing_not_configured" : "rate_limited", message: "Billing verification failed. Billing Issue.", type: "billing_error" } })); }).listen(STUB, "127.0.0.1");
  proc = spawn("node", ["--import", "tsx", "apps/server/src/index.ts"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DISABLE_HTTPS: "1", MAILER: "file", AI_PROVIDER: "meta", META_API_KEY: "dummy-not-a-real-key", META_API_BASE: `http://127.0.0.1:${STUB}/v1`, ADMIN_EMAILS: ADMIN, MUSE_DATA_DIR: DATA }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(200); }
  await admin.register(ADMIN); await user.register(USER);
});
after(() => { proc?.kill(); stub?.close(); rmSync(DATA, { recursive: true, force: true }); });

test("402 billing error: admin gets the real cause, as a 502 with a clear message (not a bare 500)", async () => {
  const r = await admin.req("/api/creation/start", "POST", { name: "Bhujangasana", characterId: "char-boy" });
  assert.equal(r.status, 502, JSON.stringify(r.body)); assert.match(r.body.error, /billing is not set up/i); assert.match(r.body.error, /Nothing was created/);
  assert.ok(stubHits >= 1, "the provider was really called");
});
test("402 billing error: regular users get a generic message with no billing details", async () => {
  const r = await user.req("/api/creation/start", "POST", { name: "Bhujangasana", characterId: "char-boy" });
  assert.equal(r.status, 502, JSON.stringify(r.body)); assert.match(r.body.error, /unavailable right now/i); assert.doesNotMatch(JSON.stringify(r.body), /billing|402|api key/i);
});
test("failed AI calls are logged as zero cost", async () => {
  const calls = await admin.req("/api/admin/ai-calls"); const failed = calls.body.filter((c: any) => c.mode === "failed");
  assert.ok(failed.length >= 1 && failed.every((c: any) => c.estUsd === 0), JSON.stringify(failed.slice(0, 1)));
});
test("an outage during whole-asana feedback does not use up a feedback attempt", async () => {
  stubStatus = 200;                                                          // let the draft start with a valid stub reply, then break the provider
  const good = JSON.stringify({ output_text: JSON.stringify({ steps: [{ instruction: "Lie on your belly with palms beside the ribs.", duration_seconds: 15 }, { instruction: "Lift the chest gently and breathe.", duration_seconds: 20 }], difficulty: "Beginner", body_part: "Back", category: "Backbend", benefits: ["x"], contraindications: ["y"] }) });
  stub.removeAllListeners("request"); stub.on("request", (req: any, res: any) => { req.resume(); res.writeHead(200, { "Content-Type": "application/json" }); res.end(good); });
  const start = await admin.req("/api/creation/start", "POST", { name: "Bhujangasana", characterId: "char-boy" }); assert.equal(start.status, 200, JSON.stringify(start.body));
  stub.removeAllListeners("request"); stub.on("request", (req: any, res: any) => { req.resume(); res.writeHead(402, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: "billing_not_configured" } })); });
  const fb = await admin.req(`/api/creation/${start.body.draftId}/feedback`, "POST", { feedback: "In step 1 the palms should be beside the ears." });
  assert.equal(fb.status, 502, JSON.stringify(fb.body));                       // intent/alignment judges fall back to heuristics; only the regeneration hits the outage
  assert.equal(fb.body.feedbackUsed, 0, "attempt refunded"); assert.match(fb.body.error, /attempt was not used/);
  const again = await admin.req(`/api/creation/${start.body.draftId}/feedback`, "POST", { feedback: "Lift the chest a little higher." });
  assert.equal(again.status, 502); assert.equal(again.body.feedbackUsed, 0, "repeated outages still never consume attempts");
});
