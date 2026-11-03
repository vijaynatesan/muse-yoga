// Draws a skeleton (pixel-space pts) on a plain white canvas. No video, no background.
import { CONNECTIONS } from "./pose.js";
export function drawSkeleton(ctx, p, { mirror = false, dots = true } = {}) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.lineCap = "round"; ctx.lineWidth = 5;
  const skip = new Set([17,18,19,20,21,22,29,30]);   // hand fingers + heels: clutter, not needed
  for (const [a, b] of CONNECTIONS) {
    if (a <= 10 && b <= 10) continue;            // face lines replaced by head circle
    if (skip.has(a) || skip.has(b)) continue;
    if (p[a].v < 0.4 || p[b].v < 0.4) continue;
    ctx.strokeStyle = (a % 2 === 1 || b % 2 === 1) && a > 10 && b > 10 ? "#2F5D43" : "#4d8a69";
    ctx.beginPath(); ctx.moveTo(p[a].x, p[a].y); ctx.lineTo(p[b].x, p[b].y); ctx.stroke();
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const sOk = p[11].v > 0.4 && p[12].v > 0.4, hOk = p[23].v > 0.4 && p[24].v > 0.4;
  const M = sOk && mid(p[11], p[12]), H = hOk && mid(p[23], p[24]);
  ctx.strokeStyle = "#2F5D43";
  if (M && H) { ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(H.x, H.y); ctx.stroke(); }  // spine
  // head circle + neck joining it to the shoulders
  const earsOk = p[7].v > 0.4 && p[8].v > 0.4;
  if (M && (earsOk || p[0].v > 0.4)) {
    const C = earsOk ? mid(p[7], p[8]) : p[0];
    const r = Math.max(14, Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) * 0.3);
    const d = Math.hypot(C.x - M.x, C.y - M.y);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(C.x, C.y, r, 0, 7); ctx.stroke();
    if (d > r) { const k = (d - r) / d; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(M.x + (C.x - M.x) * k, M.y + (C.y - M.y) * k); ctx.stroke(); }
  }
  if (dots) {
    ctx.fillStyle = "#c0572a";
    p.forEach((q, i) => { if (i > 10 && !skip.has(i) && q.v >= 0.4) { ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 7); ctx.fill(); } });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
