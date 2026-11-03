// Source-agnostic pose module. Feed it any HTMLVideoElement/canvas/image and a
// timestamp; it returns smoothed landmarks (pixel space) + derived metrics.
// Nothing here knows about the camera, the display, or the network.
import { FilesetResolver, PoseLandmarker } from "./vendor/vision_bundle.mjs";

export const CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]);

// MediaPipe BlazePose indices
export const L = {
  nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
};
const FRAME_JOINTS = [L.lSh, L.rSh, L.lHip, L.rHip, L.lKn, L.rKn, L.lAn, L.rAn];

export async function createPose({ delegate = "GPU", model = "./models/pose_landmarker_lite.task" } = {}) {
  const fileset = await FilesetResolver.forVisionTasks("./vendor/wasm");
  const make = (d) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate: d },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let usedDelegate = delegate;
  let lm;
  try {
    lm = await make(delegate);
  } catch (e) {
    console.warn("GPU delegate failed, using CPU:", e?.message || e);
    usedDelegate = "CPU";
    lm = await make("CPU");
  }

  let prev = null; // smoothed landmarks
  return {
    delegate: usedDelegate,
    reset() { prev = null; },
    /** @returns {{pts:Array<{x,y,v}>, angles:Object, inFrame:boolean, missing:string[]}|null} */
    detect(source, tsMs, w, h, smooth = 0.5) {
      const res = lm.detectForVideo(source, tsMs);
      const raw = res.landmarks?.[0];
      if (!raw) { prev = null; return null; }
      const pts = raw.map((p, i) => {
        const x = p.x * w, y = p.y * h, v = p.visibility ?? 0;
        const q = prev?.[i];
        // EMA smoothing (smooth=0 → raw, →1 heavy smoothing)
        return q ? { x: q.x + (x - q.x) * (1 - smooth), y: q.y + (y - q.y) * (1 - smooth), v, nx: p.x, ny: p.y }
                 : { x, y, v, nx: p.x, ny: p.y };
      });
      prev = pts;
      return { pts, angles: angles(pts), ...framing(pts) };
    },
    close() { lm.close(); },
  };
}

function ang(a, b, c) {
  // interior angle at b, in degrees, from 2D pixel points
  const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
  const n = Math.hypot(...v1) * Math.hypot(...v2);
  if (!n) return null;
  const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

export function analyze(p) { return { angles: angles(p), ...framing(p) }; }

function angles(p) {
  const ok = (...ids) => ids.every((i) => p[i].v > 0.5);
  const a = (n, x, y, z) => (ok(x, y, z) ? ang(p[x], p[y], p[z]) : null);
  return {
    "L elbow": a("", L.lSh, L.lEl, L.lWr), "R elbow": a("", L.rSh, L.rEl, L.rWr),
    "L shoulder": a("", L.lEl, L.lSh, L.lHip), "R shoulder": a("", L.rEl, L.rSh, L.rHip),
    "L hip": a("", L.lSh, L.lHip, L.lKn), "R hip": a("", L.rSh, L.rHip, L.rKn),
    "L knee": a("", L.lHip, L.lKn, L.lAn), "R knee": a("", L.rHip, L.rKn, L.rAn),
  };
}

const NAMES = { 11: "L shoulder", 12: "R shoulder", 23: "L hip", 24: "R hip", 25: "L knee", 26: "R knee", 27: "L ankle", 28: "R ankle" };

function framing(p) {
  const missing = [];
  for (const i of FRAME_JOINTS) {
    const q = p[i];
    const inside = q.nx > 0.02 && q.nx < 0.98 && q.ny > 0.02 && q.ny < 0.98;
    if (q.v < 0.5 || !inside) missing.push(NAMES[i]);
  }
  return { inFrame: missing.length === 0, missing };
}

// ---- Wire format: what a camera sends instead of video (landmarks only) ----
export const WIRE_VERSION = 1;
/** res = result of detect() or null. Normalised 0..1 coords, 3 decimals. */
export function toWire(res, { cam, role, ts, w, h }) {
  return { t: "frame", v: WIRE_VERSION, cam, role, ts, w, h,
    p: res ? res.pts.map((q) => [+q.nx.toFixed(3), +q.ny.toFixed(3), +q.v.toFixed(2)]) : null };
}
/** → same shape detect() returns (pixel pts + angles + framing), or null. */
export function fromWire(m) {
  if (!m.p) return null;
  const pts = m.p.map(([nx, ny, v]) => ({ x: nx * m.w, y: ny * m.h, nx, ny, v }));
  return { pts, ...analyze(pts) };
}
