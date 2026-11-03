// On-device pose → skeleton view (ported from poc/skeleton-web pose.js + draw.js).
// MediaPipe BlazePose (lite) runs in the browser; the camera video is never shown and nothing leaves the device.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export interface Pt { x: number; y: number; v: number; nx: number; ny: number }
export interface PoseResult { pts: Pt[]; inFrame: boolean; missing: string[] }

const FRAME_JOINTS = [11, 12, 23, 24, 25, 26, 27, 28];
const NAMES: Record<number, string> = { 11: "L shoulder", 12: "R shoulder", 23: "L hip", 24: "R hip", 25: "L knee", 26: "R knee", 27: "L ankle", 28: "R ankle" };
const CONNECTIONS: Array<[number, number]> = (PoseLandmarker.POSE_CONNECTIONS as any[]).map((c) => [c.start, c.end]);

export interface PoseEngine { delegate: string; detect(video: HTMLVideoElement, tsMs: number): PoseResult | null; reset(): void; close(): void }

export async function createPose(): Promise<PoseEngine> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const make = (d: "GPU" | "CPU") => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: d },
    runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  let delegate = "GPU"; let lm: PoseLandmarker;
  try { lm = await make("GPU"); } catch { delegate = "CPU"; lm = await make("CPU"); }
  let prev: Pt[] | null = null; const smooth = 0.5;
  return {
    delegate,
    reset() { prev = null; },
    detect(video, tsMs) {
      const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return null;
      const raw = lm.detectForVideo(video, tsMs).landmarks?.[0];
      if (!raw) { prev = null; return null; }
      const pts: Pt[] = raw.map((p: any, i: number) => {
        const x = p.x * w, y = p.y * h, v = p.visibility ?? 0, q = prev?.[i];
        return q ? { x: q.x + (x - q.x) * (1 - smooth), y: q.y + (y - q.y) * (1 - smooth), v, nx: p.x, ny: p.y } : { x, y, v, nx: p.x, ny: p.y };
      });
      prev = pts;
      const missing: string[] = [];
      for (const i of FRAME_JOINTS) { const q = pts[i]; if (q.v < 0.5 || !(q.nx > 0.02 && q.nx < 0.98 && q.ny > 0.02 && q.ny < 0.98)) missing.push(NAMES[i]); }
      return { pts, inFrame: missing.length === 0, missing };
    },
    close() { try { lm.close(); } catch {} },
  };
}

/** Skeleton on a plain white canvas (no video, no background). Canvas must be sized to the video. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, p: Pt[] | null, mirror = true) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  if (!p) return;
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  const k = Math.max(1, h / 480);                       // keep line weight proportional to the frame
  ctx.lineCap = "round"; ctx.lineWidth = 5 * k;
  const skip = new Set([17, 18, 19, 20, 21, 22, 29, 30]);
  for (const [a, b] of CONNECTIONS) {
    if (a <= 10 && b <= 10) continue; if (skip.has(a) || skip.has(b)) continue; if (p[a].v < 0.4 || p[b].v < 0.4) continue;
    ctx.strokeStyle = (a % 2 === 1 || b % 2 === 1) && a > 10 && b > 10 ? "#2F5D43" : "#4d8a69";
    ctx.beginPath(); ctx.moveTo(p[a].x, p[a].y); ctx.lineTo(p[b].x, p[b].y); ctx.stroke();
  }
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const M = p[11].v > 0.4 && p[12].v > 0.4 ? mid(p[11], p[12]) : null, H = p[23].v > 0.4 && p[24].v > 0.4 ? mid(p[23], p[24]) : null;
  ctx.strokeStyle = "#2F5D43";
  if (M && H) { ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(H.x, H.y); ctx.stroke(); }
  const earsOk = p[7].v > 0.4 && p[8].v > 0.4;
  if (M && (earsOk || p[0].v > 0.4)) {
    const C = earsOk ? mid(p[7], p[8]) : p[0];
    const r = Math.max(14 * k, Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) * 0.3), d = Math.hypot(C.x - M.x, C.y - M.y);
    ctx.lineWidth = 4 * k; ctx.beginPath(); ctx.arc(C.x, C.y, r, 0, 7); ctx.stroke();
    if (d > r) { const f = (d - r) / d; ctx.lineWidth = 5 * k; ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(M.x + (C.x - M.x) * f, M.y + (C.y - M.y) * f); ctx.stroke(); }
  }
  ctx.fillStyle = "#c0572a";
  p.forEach((q, i) => { if (i > 10 && !skip.has(i) && q.v >= 0.4) { ctx.beginPath(); ctx.arc(q.x, q.y, 5 * k, 0, 7); ctx.fill(); } });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
