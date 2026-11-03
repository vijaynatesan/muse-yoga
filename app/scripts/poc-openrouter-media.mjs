// POC 2: OpenRouter meta/muse-image (edit) and meta/muse-voice-transcribe-1.0. Key from app/.env, never printed.
import { readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const KEY = env.OPENROUTER_API_KEY, H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const OUT = process.argv[2] || ".";
// --- transcription
for (const f of process.argv.slice(3)) {
  const t0 = Date.now();
  const r = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", { method: "POST", headers: H, body: JSON.stringify({ model: "meta/muse-voice-transcribe-1.0", input_audio: { data: readFileSync(f).toString("base64"), format: "wav" } }) });
  const j = await r.json().catch(() => ({}));
  console.log(`${r.status === 200 ? "PASS" : "FAIL"} transcribe ${f.split("/").pop()} [${r.status}, ${Date.now() - t0} ms] ${JSON.stringify(j).slice(0, 250)}`);
}
// --- image edit: character + pose instruction
const img = readFileSync(new URL("../seed/characters/default/boy.png", import.meta.url)).toString("base64");
const t0 = Date.now();
const r = await fetch("https://openrouter.ai/api/v1/images", { method: "POST", headers: H, body: JSON.stringify({ model: "meta/muse-image", prompt: "Same character as reference image, exactly 1 head, 2 arms, 2 legs. Yoga pose: stand tall with both arms raised overhead, palms together. Full body visible, clean background.", input_references: [{ type: "image_url", image_url: { url: `data:image/png;base64,${img}` } }] }) });
const j = await r.json().catch(() => ({}));
const b64 = j.data?.[0]?.b64_json; let ok = false;
if (b64) { const b = Buffer.from(b64, "base64"); writeFileSync(`${OUT}/or_image_edit.png`, b); ok = true; console.log(`      saved ${b.length} bytes, magic ${b.slice(0, 4).toString("hex")}, ${j.data[0].media_type}`); }
console.log(`${ok ? "PASS" : "FAIL"} image edit meta/muse-image [${r.status}, ${Date.now() - t0} ms, usage ${JSON.stringify(j.usage || {})}] ${ok ? "" : JSON.stringify(j).slice(0, 300)}`);
