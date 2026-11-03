// Static file server + tiny landmark relay. No video ever passes through here:
// cameras send ~700-byte landmark frames; the server only forwards them within a room.
// HTTPS if certs/cert.pem + certs/key.pem exist (needed for phone cameras on the LAN).
import http from "node:http"; import https from "node:https"; import fs from "node:fs"; import path from "node:path";
import { WebSocketServer } from "ws";

const PORT = +process.env.PORT || 5180, ROOT = path.resolve(import.meta.dirname);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".task": "application/octet-stream", ".webm": "video/webm", ".png": "image/png", ".json": "application/json" };
const rooms = new Map();                       // room -> Set<ws>

// ---------- pose check: two stills -> vision model -> verdict text. Images live in RAM only. ----------
const KEY_FILE = path.resolve(ROOT, "../../.api.txt");
const apiKey = () => { try { return fs.readFileSync(KEY_FILE, "utf8").trim(); } catch { return ""; } };   // read server-side only, never logged/sent to browsers
const MOCK = process.env.JUDGE === "mock";
const pending = new Map();                      // room -> { id, instruction, imgs:{front,side}, timer, t0 }
const lastCheck = new Map();                    // room -> time of last check (cool-down)
const broadcast = (room, obj) => { const m = JSON.stringify(obj); for (const o of rooms.get(room) || []) if (o.readyState === 1) o.send(m); };
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, n);

async function judge(instruction, imgs) {
  const views = Object.keys(imgs);
  if (MOCK) return { verdict: "correct", correction: `mock verdict (views: ${views.join("+")}, bytes ${views.map((v) => imgs[v].length).join("/")})`, checks: [{ requirement: "mock", status: "met", view: "both", note: "mock" }] };
  const key = apiKey(); if (!key) return { verdict: "could_not_check", correction: "No API key configured on the server.", checks: [] };
  const order = ["front", "side"].filter((v) => imgs[v]);
  const desc = order.map((v, i) => `Image ${i + 1} = ${v.toUpperCase()} view (${v === "front" ? "camera faces the student" : "camera is at the student's side"})`).join("; ");
  const prompt = `You are a kind, practical yoga teacher checking a student's pose. The photos were taken at the SAME moment from ${order.length > 1 ? "two cameras" : "one camera"}. ${desc}.${order.length < 2 ? " The other view was not available - say which requirements you could not see." : ""}
Pose instruction: "${instruction}"
How to judge:
1. Split the instruction into separate body-position requirements.
2. For EACH requirement mark "met", "not_met" (visibly different or missing) or "unseen" (not visible in any view). Use whichever view shows it best: front for symmetry, arm height, foot width; side for spine, hips, knee bend, forward/back lean.
3. Compare body POSITION only. Be tolerant of exact angles, small asymmetry, clothing, background and image quality, but strict about WHERE limbs are.
4. verdict = "incorrect" if ANY requirement is "not_met"; "unseen" does not make it incorrect but mention it. Otherwise "correct".
Reply with JSON only, no prose:
{"checks":[{"requirement":"short phrase","status":"met"|"not_met"|"unseen","view":"front"|"side"|"both","note":"what you see, max 12 words"}],"verdict":"correct"|"incorrect","correction":"plain sentences with the fix for each not_met requirement; if correct, one short encouraging sentence"}`;
  const content = [{ type: "input_text", text: prompt }, ...order.map((v) => ({ type: "input_image", image_url: `data:image/jpeg;base64,${imgs[v].toString("base64")}` }))];
  const t0 = Date.now();
  try {
    const r = await fetch("https://api.meta.ai/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "muse-wonder-1.0", input: [{ role: "user", content }], max_output_tokens: 1600, reasoning: { effort: "low" }, store: false }) });
    console.log("judge", r.status, Date.now() - t0, "ms", "views:", order.join("+"));           // no image bytes, no key
    if (!r.ok) throw new Error("status " + r.status);
    const data = await r.json();
    const text = data.output_text || (data.output || []).flatMap((o) => o.content || []).map((c) => c.text || "").join("\n");
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    const checks = (Array.isArray(j.checks) ? j.checks : []).slice(0, 12).map((c) => ({ requirement: clean(c?.requirement, 80), status: clean(c?.status, 10), view: clean(c?.view, 6), note: clean(c?.note, 100) }));
    const verdict = j.verdict === "incorrect" || checks.some((c) => c.status === "not_met") ? "incorrect" : "correct";
    return { verdict, correction: clean(j.correction, 600), checks, ms: Date.now() - t0, views: order };
  } catch (e) { console.log("judge failed:", clean(e.message, 80)); return { verdict: "could_not_check", correction: "Could not check the pose - the validation service was unavailable.", checks: [] }; }
}

async function finish(room) {
  const p = pending.get(room); if (!p) return; pending.delete(room); clearTimeout(p.timer);
  const imgs = p.imgs; p.imgs = null;
  if (!Object.keys(imgs).length) { broadcast(room, { t: "result", id: p.id, verdict: "could_not_check", correction: "No camera sent a photo.", checks: [] }); return; }
  const res = await judge(p.instruction, imgs);
  for (const k of Object.keys(imgs)) imgs[k] = null;                                  // drop the photos; only text is kept/sent on
  broadcast(room, { t: "result", id: p.id, sent: Object.keys(res.views || []).length || undefined, ...res });
}
function startCheck(room, instruction) {
  const now = Date.now();
  if (pending.has(room) || now - (lastCheck.get(room) || 0) < 4000) return false;
  lastCheck.set(room, now);
  const id = Math.random().toString(36).slice(2, 8), at = now + 3000;
  pending.set(room, { id, instruction: clean(instruction, 600) || "Hold the pose.", imgs: {}, timer: setTimeout(() => finish(room), 12000), t0: now });
  broadcast(room, { t: "capture", id, at, countdown: 3 });
  return true;
}
function readBody(req, limit) {
  return new Promise((ok, no) => { const ch = []; let n = 0; req.on("data", (c) => { n += c.length; if (n > limit) { no(new Error("too big")); req.destroy(); } else ch.push(c); }); req.on("end", () => ok(Buffer.concat(ch))); req.on("error", no); });
}

const handler = async (req, res) => {
  if (req.method === "POST" && req.url.startsWith("/capture/")) {          // POST /capture/<id>/<role>?room=<room>  body = image/jpeg
    const u = new URL(req.url, "http://x"), [, , id, role] = u.pathname.split("/"), room = ((u.searchParams.get("room") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "default").slice(0, 32);
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) { res.writeHead(403).end(); return; }
    const p = pending.get(room);
    if (!p || p.id !== id || !p.imgs || (role !== "front" && role !== "side")) { res.writeHead(409).end("no such check"); return; }
    try { const b = await readBody(req, 1.5 * 1024 * 1024); if (b.length < 1000 || b[0] !== 0xff || b[1] !== 0xd8) { res.writeHead(400).end("not a jpeg"); return; } p.imgs[role] = b; }
    catch { res.writeHead(413).end(); return; }
    res.writeHead(204).end();
    if (p.imgs.front && p.imgs.side) finish(room);                           // both arrived -> judge now
    return;
  }
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p === "/") p = "/two.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || /node_modules|certs|server\.log|\.y4m/.test(p)) { res.writeHead(403).end(); return; }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404).end("not found"); return; }
    const type = MIME[path.extname(f)] || "application/octet-stream", size = st.size, range = req.headers.range;
    if (range) { // video seeking for test clips
      const m = /bytes=(\d*)-(\d*)/.exec(range), s = +m[1] || 0, e2 = m[2] ? +m[2] : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${s}-${e2}/${size}`, "Accept-Ranges": "bytes", "Content-Length": e2 - s + 1 });
      fs.createReadStream(f, { start: s, end: e2 }).pipe(res);
    } else { res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" }); fs.createReadStream(f).pipe(res); }
  });
};
const certOk = fs.existsSync(path.join(ROOT, "certs/cert.pem")) && fs.existsSync(path.join(ROOT, "certs/key.pem"));
const HTTPS_PORT = +process.env.HTTPS_PORT || 5181;
const servers = [http.createServer(handler)];                       // :5180 plain HTTP (PC, Linux with Firefox flag)
if (certOk) servers.push(https.createServer({ cert: fs.readFileSync(path.join(ROOT, "certs/cert.pem")), key: fs.readFileSync(path.join(ROOT, "certs/key.pem")) }, handler)); // :5181 self-signed HTTPS (iPhone)

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
for (const srv of servers) srv.on("upgrade", (req, sock, head) => {
  const u = new URL(req.url, "http://x"), origin = req.headers.origin;
  if (u.pathname !== "/ws" || (origin && new URL(origin).host !== req.headers.host)) { sock.write("HTTP/1.1 403 Forbidden\r\n\r\n"); sock.destroy(); return; }   // same-origin only
  wss.handleUpgrade(req, sock, head, (ws) => wss.emit("connection", ws, req));
});
wss.on("connection", (ws, req) => {
  const room = ((new URL(req.url, "http://x").searchParams.get("room") || "default").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "default").slice(0, 32);
  if (!rooms.has(room)) rooms.set(room, new Set());
  const set = rooms.get(room); set.add(ws);
  console.log(new Date().toISOString().slice(11,19), "join", room, req.socket.remoteAddress, "clients:", set.size);
  ws.on("message", (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === "ping") { ws.send(JSON.stringify({ t: "pong", c: m.c, s: Date.now() })); return; }   // clock sync
    if (m.t === "check") { if (!startCheck(room, m.instruction)) ws.send(JSON.stringify({ t: "busy" })); return; }
    if (m.t !== "frame" && m.t !== "hello") return;
    for (const o of set) if (o !== ws && o.readyState === 1) o.send(data.toString());
  });
  ws.on("close", () => { set.delete(ws); console.log(new Date().toISOString().slice(11,19), "leave", room, req.socket.remoteAddress, "clients:", set.size); if (!set.size) rooms.delete(room); });
});
servers[0].listen(PORT, "0.0.0.0", () => console.log(`http://localhost:${PORT}  (two-camera page: /two.html?room=demo)`));
if (certOk) servers[1].listen(HTTPS_PORT, "0.0.0.0", () => console.log(`https://localhost:${HTTPS_PORT}  (self-signed, for iPhone)`));
