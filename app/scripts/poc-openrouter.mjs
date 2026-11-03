// POC: can we reach Meta models through OpenRouter? Reads OPENROUTER_API_KEY from app/.env; never prints it.
import { readFileSync } from "node:fs"; import { execSync } from "node:child_process";
const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const KEY = env.OPENROUTER_API_KEY; if (!KEY) { console.error("OPENROUTER_API_KEY missing in .env"); process.exit(1); }
const chat = async (model, content, extra = {}) => {
  const t0 = Date.now();
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens: 400, ...extra }) });
  const j = await r.json().catch(() => ({})); const ms = Date.now() - t0;
  return { status: r.status, ms, text: j.choices?.[0]?.message?.content, usage: j.usage, err: j.error?.message, provider: j.provider };
};
const show = (name, r) => console.log(`${r.status === 200 && r.text ? "PASS" : "FAIL"}  ${name}  [${r.status}, ${r.ms} ms${r.usage ? `, tokens ${r.usage.prompt_tokens}/${r.usage.completion_tokens}, $${r.usage.cost ?? "?"}` : ""}${r.provider ? `, via ${r.provider}` : ""}]\n      ${(r.text || r.err || "").replace(/\s+/g, " ").slice(0, 220)}`);

const stepsPrompt = 'Generate yoga asana "Tadasana" as JSON only: {"steps":[{"instruction":"...","duration_seconds":20}],"difficulty":"...","body_part":"...","category":"...","benefits":["..."],"contraindications":["..."]}. No other text.';
for (const m of ["meta/muse-wonder", "meta/muse-spark-1.3", "meta/muse-glimmer-30b", "meta-llama/llama-4-maverick"]) {
  const r = await chat(m, stepsPrompt, m === "meta/muse-wonder" ? { reasoning: { effort: "low" }, max_tokens: 1600 } : {});
  const ok = r.text && /\{[\s\S]*"steps"/.test(r.text); show(`text→JSON steps  ${m}${ok ? "" : " (no JSON)"}`, r);
}
// vision: a default character image from the seed folder
const img = execSync("ls ../app/seed/characters/default/*.png | head -1", { cwd: new URL("..", import.meta.url).pathname }).toString().trim();
const b64 = readFileSync(new URL("../" + img.replace(/^\.\.\/app\//, ""), import.meta.url)).toString("base64");
for (const m of ["meta/muse-wonder", "meta/muse-spark-1.3"]) {
  show(`vision (image input)  ${m}`, await chat(m, [{ type: "text", text: "In one sentence: what colour is the clothing and is the figure's arms down or raised?" }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }], m === "meta/muse-wonder" ? { reasoning: { effort: "low" }, max_tokens: 1600 } : {}));
}
// audio input: 1 s silent 16 kHz WAV (checks the route accepts audio; no TTS in sandbox, so no transcript check)
execSync("ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=16000:cl=mono -t 1 /tmp/poc_silence.wav");
const wav = readFileSync("/tmp/poc_silence.wav").toString("base64");
show("audio input  meta/muse-wonder", await chat("meta/muse-wonder", [{ type: "text", text: "Transcribe this audio. If silent, say SILENT." }, { type: "input_audio", input_audio: { data: wav, format: "wav" } }], { reasoning: { effort: "low" }, max_tokens: 1600 }));
