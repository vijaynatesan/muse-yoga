import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// C16: admin-only step editing on the creation draft (behavioural, mock AI, own server on its own port).
process.env.NO_PROXY = "127.0.0.1,localhost"; process.env.no_proxy = "127.0.0.1,localhost";
delete process.env.HTTP_PROXY; delete process.env.http_proxy; delete process.env.HTTPS_PROXY; delete process.env.https_proxy;
const PORT = 18097, BASE = `http://127.0.0.1:${PORT}`, STAMP = Date.now();
const ADMIN_EMAIL = `qa-admin-${STAMP}@example.com`, USER_EMAIL = `qa-user-${STAMP}@example.com`;
let proc: any; const DATA = mkdtempSync(join(tmpdir(), "muse-admin-steps-"));   // throw-away data folder: tests never touch the real data

function client() {
  let cookie = "", csrf = "";
  const req = async (path: string, method = "GET", body?: any) => {
    const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie");
    if (sc) { cookie = sc.split(/,(?=\s*muse_)/).map((x) => x.split(";")[0].trim()).join("; "); const m = sc.match(/muse_csrf=([^;]+)/); if (m) csrf = decodeURIComponent(m[1]); }
    return { status: r.status, body: await r.json().catch(() => ({})) as any };
  };
  const register = async (email: string, first: string) => {
    await req("/auth/otp/request", "POST", { email, purpose: "register" });
    const mails: any[] = await (await fetch(BASE + "/api/dev/mail")).json();
    const code = mails.find((m) => m.to === email && m.purpose === "registration")?.code;
    const r = await req("/auth/otp/verify", "POST", { email, code, purpose: "register", profile: { firstName: first, lastName: "Qa", age: 30, zip: "12345" } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); return r;
  };
  return { req, register, file: (key: string) => fetch(`${BASE}/files/${key}`, { headers: { Cookie: cookie } }) };
}
const admin = client(), user = client();

before(async () => {
  proc = spawn("node", ["--import", "tsx", "apps/server/src/index.ts"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DISABLE_HTTPS: "1", MAILER: "file", AI_PROVIDER: "mock", ADMIN_EMAILS: ADMIN_EMAIL, MUSE_DATA_DIR: DATA }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(200); }
  await admin.register(ADMIN_EMAIL, "Admin"); await user.register(USER_EMAIL, "User");
});
after(() => { proc?.kill(); rmSync(DATA, { recursive: true, force: true }); });

let draftId = "", view: any;
const steps = (v = view) => v.steps as any[];
const base = () => `/api/creation/${draftId}/steps`;

test("setup: admin creates a draft; every step has a stable id and starts without an image", async () => {
  const r = await admin.req("/api/creation/start", "POST", { name: "Bhujangasana", characterId: "char-boy" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); view = r.body; draftId = view.draftId;
  assert.ok(steps().length >= 3, "enough steps to test with"); assert.equal(new Set(steps().map((s) => s.sid)).size, steps().length);
  assert.ok(steps().every((s) => s.imageStatus === "none")); assert.deepEqual(view.limits, { minSteps: 2, maxSteps: 12 }); assert.match(view.blocked, /no up-to-date image/);
});

test("regular users get 403 on every step-editing route (server-enforced), and the admin's draft is untouched", async () => {
  const sid = steps()[0].sid, before = JSON.stringify(steps());
  const calls: Array<[string, string, any?]> = [["PATCH", `${base()}/${sid}`, { instruction: "Hack the pose text now." }], ["POST", base(), { instruction: "Sneaky extra step here." }], ["DELETE", `${base()}/${sid}`], ["POST", `${base()}/${sid}/move`, { dir: "down" }], ["POST", `${base()}/${sid}/image`, { adjustment: "bigger" }]];
  for (const [m, p, b] of calls) assert.equal((await user.req(p, m, b)).status, 403, `${m} ${p}`);
  const g = await admin.req(`${base()}/${sid}`, "PATCH", {});                      // admin no-op read of current state
  assert.equal(JSON.stringify(steps(g.body)), before, "draft unchanged by the rejected calls");
});

test("generate images: every step becomes fresh and Accept is no longer blocked", async () => {
  const r = await admin.req(`/api/creation/${draftId}/images`, "POST", {}); assert.equal(r.status, 200, JSON.stringify(r.body));
  view = r.body.draft; assert.ok(steps().every((s) => s.imageStatus === "fresh" && s.imageKey)); assert.equal(view.blocked, null);
});

test("editing text marks ONLY that step stale and blocks accept; duration-only edit stays fresh", async () => {
  const s2 = steps()[1], others = steps().filter((s) => s.sid !== s2.sid).map((s) => s.imageKey);
  let r = await admin.req(`${base()}/${s2.sid}`, "PATCH", { durationS: 33 }); assert.equal(r.status, 200);
  assert.equal(steps(r.body)[1].durationS, 33); assert.equal(steps(r.body)[1].imageStatus, "fresh");
  r = await admin.req(`${base()}/${s2.sid}`, "PATCH", { instruction: "Lie on your belly, palms beside the ribs, and lift the chest gently." });
  assert.equal(r.status, 200, JSON.stringify(r.body)); view = r.body;
  assert.equal(steps()[1].instruction, "Lie on your belly, palms beside the ribs, and lift the chest gently."); assert.equal(steps()[1].imageStatus, "stale");
  assert.deepEqual(steps().filter((s) => s.sid !== s2.sid).map((s) => s.imageStatus), steps().filter((s) => s.sid !== s2.sid).map(() => "fresh"));
  assert.deepEqual(steps().filter((s) => s.sid !== s2.sid).map((s) => s.imageKey), others, "other images untouched");
  assert.match(view.blocked, /Step 2 has no up-to-date image \(stale\)/);
  const acc = await admin.req(`/api/creation/${draftId}/accept`, "POST", {}); assert.equal(acc.status, 400); assert.equal(acc.body.blocked, true);
});

test("adjust image regenerates ONE step, saves the note, gives a new file, and unblocks accept", async () => {
  const s2 = steps()[1], otherKeys = steps().filter((s) => s.sid !== s2.sid).map((s) => s.imageKey);
  const r = await admin.req(`${base()}/${s2.sid}/image`, "POST", { adjustment: "feet closer together" }); assert.equal(r.status, 200, JSON.stringify(r.body));
  view = r.body; assert.equal(steps()[1].imageStatus, "fresh"); assert.equal(steps()[1].imageNote, "feet closer together");
  assert.notEqual(steps()[1].imageKey, s2.imageKey, "new key so browsers do not show the old picture");
  assert.deepEqual(steps().filter((s) => s.sid !== s2.sid).map((s) => s.imageKey), otherKeys, "only this step's image changed");
  assert.equal((await admin.file(steps()[1].imageKey)).status, 200); assert.equal(view.blocked, null);
});

test("text that is not a yoga instruction is rejected by the intent check (edit and add)", async () => {
  const sid = steps()[0].sid, snap = JSON.stringify(steps());
  let r = await admin.req(`${base()}/${sid}`, "PATCH", { instruction: "buy my course at www.example.com today" }); assert.equal(r.status, 400); assert.equal(r.body.stage, "intent");
  r = await admin.req(base(), "POST", { afterSid: sid, instruction: "tell me a joke or a song please" }); assert.equal(r.status, 400); assert.equal(r.body.stage, "intent");
  r = await admin.req(`${base()}/${sid}`, "PATCH", { durationS: 0 }); assert.equal(r.status, 400);
  assert.equal(JSON.stringify(steps((await admin.req(`${base()}/${sid}`, "PATCH", {})).body)), snap, "nothing changed");
});

test("add step inserts at the chosen position with no image; generating it unblocks accept", async () => {
  const after = steps()[0].sid, n = steps().length;
  let r = await admin.req(base(), "POST", { afterSid: after, instruction: "Breathe in and lengthen the spine before lifting.", durationS: 15 });
  assert.equal(r.status, 200, JSON.stringify(r.body)); view = r.body;
  assert.equal(steps().length, n + 1); assert.equal(steps()[1].instruction, "Breathe in and lengthen the spine before lifting."); assert.equal(steps()[1].durationS, 15);
  assert.equal(steps()[1].imageStatus, "none"); assert.match(view.blocked, /Step 2 has no up-to-date image \(none\)/);
  r = await admin.req(`${base()}/${steps()[1].sid}/image`, "POST", {}); assert.equal(r.status, 200); view = r.body; assert.equal(steps()[1].imageStatus, "fresh"); assert.equal(view.blocked, null);
  r = await admin.req(base(), "POST", { afterSid: null, instruction: "Stand tall at the front of the mat to begin." }); assert.equal(r.status, 200);
  assert.equal(steps(r.body)[0].instruction, "Stand tall at the front of the mat to begin.", "afterSid:null inserts at the very start"); view = r.body;
});

test("delete removes exactly that step; the others keep text, duration and image and shift up", async () => {
  const before = steps(), victim = before[2], expected = before.filter((s) => s.sid !== victim.sid);
  const r = await admin.req(`${base()}/${victim.sid}`, "DELETE"); assert.equal(r.status, 200, JSON.stringify(r.body)); view = r.body;
  assert.equal(steps().length, before.length - 1);
  assert.deepEqual(steps().map((s) => [s.sid, s.instruction, s.durationS, s.imageKey, s.imageStatus]), expected.map((s) => [s.sid, s.instruction, s.durationS, s.imageKey, s.imageStatus]));
  assert.deepEqual(steps().map((s) => s.n), steps().map((_, i) => i + 1), "numbers are renumbered 1..n");
  assert.equal((await admin.req(`${base()}/${victim.sid}`, "DELETE")).status, 404, "already gone");
});

test("move up/down reorders; images travel with their steps and stay fresh", async () => {
  const a = steps()[1].sid, b = steps()[2].sid, ka = steps()[1].imageKey, st0 = Object.fromEntries(steps().map((s) => [s.sid, s.imageStatus]));
  let r = await admin.req(`${base()}/${a}/move`, "POST", { dir: "down" }); assert.equal(r.status, 200); view = r.body;
  assert.deepEqual([steps()[1].sid, steps()[2].sid], [b, a]); assert.equal(steps()[2].imageKey, ka); assert.deepEqual(Object.fromEntries(steps().map((s) => [s.sid, s.imageStatus])), st0, "moving changes no step's image status");
  r = await admin.req(`${base()}/${steps()[0].sid}/move`, "POST", { dir: "up" }); assert.equal(steps(r.body)[0].sid, steps()[0].sid, "moving the first step up changes nothing");
  assert.equal((await admin.req(`${base()}/${a}/move`, "POST", { dir: "sideways" })).status, 400);
});

test("step count limits: cannot delete below min or add above max (from settings)", async () => {
  let r: any;
  while (steps().length > 2) { r = await admin.req(`${base()}/${steps()[0].sid}`, "DELETE"); assert.equal(r.status, 200); view = r.body; }
  r = await admin.req(`${base()}/${steps()[0].sid}`, "DELETE"); assert.equal(r.status, 400); assert.match(r.body.error, /at least 2/);
  while (steps().length < 12) { r = await admin.req(base(), "POST", { instruction: "Hold the pose and breathe steadily here.", durationS: 10 }); assert.equal(r.status, 200); view = r.body; }
  r = await admin.req(base(), "POST", { instruction: "One step too many for this asana." }); assert.equal(r.status, 400); assert.match(r.body.error, /at most 12/);
  while (steps().length > 3) { r = await admin.req(`${base()}/${steps()[steps().length - 1].sid}`, "DELETE"); view = r.body; }
});

test("bulk generate only creates images for steps that need one, then accept saves in the edited order", async () => {
  const keysBefore = steps().map((s) => s.imageKey);
  const r = await admin.req(`/api/creation/${draftId}/images`, "POST", {}); assert.equal(r.status, 200, JSON.stringify(r.body)); view = r.body.draft;
  assert.ok(steps().every((s) => s.imageStatus === "fresh"));
  steps().forEach((s, i) => { if (keysBefore[i]) assert.equal(s.imageKey, keysBefore[i], "fresh images are not regenerated"); });
  const order = steps().map((s) => s.instruction);
  const acc = await admin.req(`/api/creation/${draftId}/accept`, "POST", {}); assert.equal(acc.status, 200, JSON.stringify(acc.body));
  assert.deepEqual(acc.body.steps.map((s: any) => s.instruction), order); assert.deepEqual(acc.body.steps.map((s: any) => s.n), order.map((_, i) => i + 1));
  for (const s of acc.body.steps) assert.equal((await admin.file(s.imageKey)).status, 200, s.imageKey);
  assert.equal((await admin.req(`${base()}/${steps()[0].sid}`, "PATCH", { durationS: 5 })).status, 409, "no edits after the asana is saved");
});

test("audit log records the admin edits", async () => {
  const a = await admin.req("/api/admin/audit"); const kinds = new Set(a.body.map((x: any) => x.action || x.event || x.type));
  for (const k of ["creation.step.edit", "creation.step.add", "creation.step.delete", "creation.step.move", "creation.step.image"]) assert.ok(kinds.has(k), `audit has ${k}: ${[...kinds].join(",")}`);
});

// ---- admin edit of a Public Library asana (opens an edit draft, saves in place) ----
let editAsanaId = "", oldKeys: string[] = [];
test("edit asana: regular users are refused, admin gets a draft copy of the public asana", async () => {
  const lib = await admin.req("/api/public"); const rows: any[] = lib.body.items || lib.body.asanas || lib.body;
  editAsanaId = (rows.find((a: any) => a.name === "Chakrasana") || rows[0]).id;
  const d0 = await user.req(`/api/admin/asanas/${editAsanaId}/edit`, "POST", {});
  assert.ok(d0.status === 403 || d0.status === 404, `user must not edit: ${d0.status}`);
  const before = await admin.req(`/api/asanas/${editAsanaId}`); oldKeys = before.body.steps.map((s: any) => s.imageKey);
  const d = await admin.req(`/api/admin/asanas/${editAsanaId}/edit`, "POST", {});
  assert.equal(d.status, 200, JSON.stringify(d.body)); assert.equal(d.body.editOf, editAsanaId);
  assert.equal(d.body.steps.length, before.body.steps.length); assert.ok(d.body.steps.every((s: any) => s.imageStatus === "fresh" && s.imageKey.startsWith("drafts/")));
  const again = await admin.req(`/api/admin/asanas/${editAsanaId}/edit`, "POST", {}); assert.equal(again.body.draftId, d.body.draftId, "re-opening resumes the same edit draft");
  (globalThis as any).__edit = d.body;
});
test("edit asana: details + step text edits stay in the draft; the published asana is untouched until Save", async () => {
  const d = (globalThis as any).__edit;
  const clash = await admin.req(`/api/creation/${d.draftId}/details`, "PATCH", { name: "Tadasana" });
  assert.equal(clash.status, 400, "name clash with another public asana is refused");
  const det = await admin.req(`/api/creation/${d.draftId}/details`, "PATCH", { name: "Chakrasana (Wheel)", difficulty: "Intermediate", benefits: ["Opens chest", "Strengthens arms"] });
  assert.equal(det.status, 200, JSON.stringify(det.body)); assert.equal(det.body.difficulty, "Intermediate");
  const e = await admin.req(`/api/creation/${d.draftId}/steps/${d.steps[0].sid}`, "PATCH", { instruction: "Lie on your back, bend both knees and place your feet flat on the floor hip-width apart.", durationS: 25 });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  const pub = await admin.req(`/api/asanas/${editAsanaId}`); assert.equal(pub.body.name, "Chakrasana"); assert.notEqual(pub.body.difficulty, "Intermediate");
  const blocked = await admin.req(`/api/creation/${d.draftId}/accept`, "POST", {}); assert.equal(blocked.status, 400, "stale image blocks Save");
});
test("edit asana: regenerate the stale image, Save replaces the asana in place with new image files; old files remain", async () => {
  const d = (globalThis as any).__edit;
  const r = await admin.req(`/api/creation/${d.draftId}/steps/${d.steps[0].sid}/image`, "POST", {}); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const a = await admin.req(`/api/creation/${d.draftId}/accept`, "POST", {}); assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.id, editAsanaId, "same asana id, so favourites and history keep working");
  assert.equal(a.body.name, "Chakrasana (Wheel)"); assert.equal(a.body.difficulty, "Intermediate"); assert.equal(a.body.steps[0].durationS, 25); assert.match(a.body.steps[0].instruction, /Lie on your back/);
  assert.ok(a.body.steps.every((s: any) => /\/v2\/step-\d+\.png$/.test(s.imageKey)), "new versioned image keys");
  for (const k of oldKeys) assert.equal((await admin.file(k)).status, 200, `previous image ${k} is still served (history uses it)`);
  for (const s of a.body.steps) assert.equal((await admin.file(s.imageKey)).status, 200);
  const again = await admin.req(`/api/creation/${d.draftId}/accept`, "POST", {}); assert.ok(again.status >= 400, "an accepted draft cannot be saved twice");
});
test("edit asana: discard removes the draft and leaves the published asana alone", async () => {
  const d = await admin.req(`/api/admin/asanas/${editAsanaId}/edit`, "POST", {}); assert.equal(d.status, 200);
  await admin.req(`/api/creation/${d.body.draftId}/details`, "PATCH", { difficulty: "Beginner" });
  const x = await admin.req(`/api/creation/${d.body.draftId}`, "DELETE"); assert.equal(x.status, 200, JSON.stringify(x.body));
  const pub = await admin.req(`/api/asanas/${editAsanaId}`); assert.equal(pub.body.difficulty, "Intermediate", "discarded change to Beginner was not applied");
  const fresh = await admin.req(`/api/admin/asanas/${editAsanaId}/edit`, "POST", {}); assert.notEqual(fresh.body.draftId, d.body.draftId, "a new edit starts after a discard");
});
