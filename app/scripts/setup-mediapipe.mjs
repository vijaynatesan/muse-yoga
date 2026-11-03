#!/usr/bin/env node
// Puts the on-device pose model + runtime where the web app serves them from (apps/web/public/mediapipe/).
// Idempotent: does nothing when the files already exist. The ~47 MB of files are git-ignored, so every fresh clone runs this
// (automatically via `npm install` / `node scripts/dev.mjs`). The skeleton view needs them; without them practice falls back to
// a plain camera view, so a failure here is reported loudly but never aborts the install.
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.MEDIAPIPE_OUT || join(root, "apps/web/public/mediapipe");
const MODEL_URL = process.env.POSE_MODEL_URL || "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const model = join(out, "pose_landmarker_lite.task"), wasmOut = join(out, "wasm");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");

try {
  // 1) WASM runtime: copied from the npm package (same version as the JS bundle the app imports)
  if (!existsSync(join(wasmOut, "vision_wasm_internal.wasm"))) {
    if (!existsSync(wasmSrc)) throw new Error("node_modules/@mediapipe/tasks-vision is missing — run `npm install` first");
    mkdirSync(wasmOut, { recursive: true });
    for (const f of readdirSync(wasmSrc)) copyFileSync(join(wasmSrc, f), join(wasmOut, f));
    console.log("[mediapipe] copied WASM runtime");
  }
  // 2) Pose model: downloaded once (not part of the npm package)
  if (!existsSync(model) || statSync(model).size < 1_000_000) {
    console.log("[mediapipe] downloading pose model (~6 MB)…");
    const r = await fetch(MODEL_URL); if (!r.ok) throw new Error(`model download failed: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 1_000_000) throw new Error("model download looks truncated");
    mkdirSync(out, { recursive: true }); writeFileSync(model, buf);
    console.log(`[mediapipe] saved ${(buf.length / 1e6).toFixed(1)} MB`);
  }
} catch (e) {
  console.warn(`\n[mediapipe] WARNING: ${e.message}\n  Practice will fall back to the plain camera view until this succeeds.\n  Retry with:  node scripts/setup-mediapipe.mjs\n`);
}
