// On-device privacy filter for the photo shown on the Results page.
// Background is blurred (person mask) and the face is pixelated (head landmarks). If anything is uncertain
// (no person found, no mask, face not located) the WHOLE image is blurred — an unblurred photo is never produced.
// Runs entirely in the browser; the result lives only in memory and is never uploaded or stored.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export interface PrivacyEngine { blur(src: CanvasImageSource & { width?: number; height?: number }, w?: number, h?: number): string; close(): void }

const HEAD = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export async function createPrivacyEngine(): Promise<PrivacyEngine> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const make = (d: "GPU" | "CPU") => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: d },
    runningMode: "IMAGE", numPoses: 1, outputSegmentationMasks: true, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4,
  });
  let lm: PoseLandmarker; try { lm = await make("GPU"); } catch { lm = await make("CPU"); }
  const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  return {
    blur(src, w = 640, h = 480) {
      const A = mk(w, h), actx = A.getContext("2d")!; actx.drawImage(src as CanvasImageSource, 0, 0, w, h);
      const out = mk(w, h), o = out.getContext("2d")!;
      const wholeBlur = () => { o.filter = "blur(24px)"; o.drawImage(A, 0, 0); o.filter = "none"; };
      let res: any = null;
      try {
        res = lm.detect(A);
        const pts = res.landmarks?.[0], mask = res.segmentationMasks?.[0];
        if (!pts || !mask) { wholeBlur(); }
        else {
          const face = HEAD.map((i) => pts[i]).filter((p: any) => (p.visibility ?? 0) > 0.3);
          if (face.length < 3) { wholeBlur(); }                                  // face not located -> cannot guarantee it is hidden
          else {
            // 1) blurred background everywhere
            o.filter = "blur(18px)"; o.drawImage(A, 0, 0); o.filter = "none";
            // 2) sharp person on top, using the segmentation mask as soft alpha
            const m: Float32Array = mask.getAsFloat32Array(), mw: number = mask.width, mh: number = mask.height;
            const img = actx.getImageData(0, 0, w, h), d = img.data;
            for (let y = 0; y < h; y++) { const my = Math.min(mh - 1, Math.floor((y * mh) / h)) * mw; for (let x = 0; x < w; x++) { const v = m[my + Math.min(mw - 1, Math.floor((x * mw) / w))]; d[(y * w + x) * 4 + 3] = Math.max(0, Math.min(1, (v - 0.25) / 0.5)) * 255; } }
            const P = mk(w, h); P.getContext("2d")!.putImageData(img, 0, 0); o.drawImage(P, 0, 0);
            // 3) face: pixelate a generous circle around the head
            const cx = (face.reduce((s: number, p: any) => s + p.x, 0) / face.length) * w, cy = (face.reduce((s: number, p: any) => s + p.y, 0) / face.length) * h;
            let r = 0; for (const p of face) r = Math.max(r, Math.hypot(p.x * w - cx, p.y * h - cy));
            const sh = Math.hypot((pts[11].x - pts[12].x) * w, (pts[11].y - pts[12].y) * h);
            r = Math.max(r * 1.9, sh * 0.42, 34);
            const bx = Math.max(0, Math.floor(cx - r)), by = Math.max(0, Math.floor(cy - r)), bw = Math.min(w - bx, Math.ceil(r * 2)), bh = Math.min(h - by, Math.ceil(r * 2));
            const cells = 7, tiny = mk(cells, cells); const t = tiny.getContext("2d")!; t.imageSmoothingEnabled = true; t.drawImage(A, bx, by, bw, bh, 0, 0, cells, cells);
            o.save(); o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.clip(); o.imageSmoothingEnabled = false; o.drawImage(tiny, 0, 0, cells, cells, bx, by, bw, bh); o.restore();
          }
        }
      } catch { o.clearRect(0, 0, w, h); wholeBlur(); }
      finally { try { res?.close?.(); } catch {} }
      return out.toDataURL("image/jpeg", 0.82);
    },
    close() { try { lm.close(); } catch {} },
  };
}
