import WebSocket from "ws";
const ws = new WebSocket("ws://localhost:5180/ws?room=demo"); const st = {};
ws.on("message", d => { const m = JSON.parse(d); if (m.t !== "frame") return; const k = m.cam + "/" + m.role; (st[k] ??= { n: 0, nul: 0, ts: [], w: m.w, h: m.h }); st[k].n++; if (!m.p) st[k].nul++; st[k].ts.push(m.ts); });
setTimeout(() => { for (const [k, s] of Object.entries(st)) console.log(k, `${s.w}x${s.h}`, "frames", s.n, "no-person", s.nul, "fps", (s.n / 5).toFixed(1)); if (!Object.keys(st).length) console.log("NO FRAMES from anyone in room demo"); process.exit(); }, 5000);
