// Review harness: run the REAL validation + image-model annotation over a folder of
// saved debug photos (step<N>-set<S>-*.jpg) and write results to app/review/<name>/.
// usage: node --env-file=.env --import tsx scripts/review-photos.mts <photosDir> [asanaName=Chakrasana]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { loadStore, getDb, OBJECTS_DIR } from "../apps/server/src/store.ts";
import { validatePose, annotatePhoto } from "../apps/server/src/ai.ts";

const dir = resolve(process.argv[2] || "");
const name = process.argv[3] || "Chakrasana";
loadStore();
const asana = [...getDb().asanas].reverse().find((a: any) => a.name === name);
if (!asana) throw new Error("asana not found: " + name);
const out = join(process.cwd(), "review", basename(dir));
mkdirSync(out, { recursive: true });
let report = `# Review — ${name} — photos from ${dir}\n\n`;
for (let n = 1; n <= asana.steps.length; n++) {
  const files = readdirSync(dir).filter((f) => f.startsWith(`step${n}-`) && /\.jpe?g$/i.test(f)).sort();
  const step = asana.steps[n - 1];
  report += `## Step ${n}\n**Instruction:** ${step.instruction}\n\n`;
  if (!files.length) { report += "_no photos_\n\n"; continue; }
  const photos = files.map((f) => readFileSync(join(dir, f))).filter((b) => b.length > 1000);
  const refPath = join(OBJECTS_DIR, step.imageKey);
  const ref = existsSync(refPath) ? readFileSync(refPath) : null;
  const v = await validatePose(step.instruction, photos, ref);
  report += `**Verdict:** ${v.verdict.toUpperCase()}  (photos sent: ${v.sent.photoCount}, reference included: ${v.sent.referenceIncluded}, model's pick: photo ${v.bestPhoto})\n\n**Correction:** ${v.correctionText}\n\n**Checklist:**\n`;
  for (const c of v.checks || []) report += `- ${c.status === "met" ? "✅" : c.status === "not_met" ? "❌" : "❔"} ${c.requirement} — ${c.note}\n`;
  report += `\n**Issues:**\n`;
  for (const i of v.issues || []) report += `- ${i.part}: ${i.problem}\n`;
  const best = photos[Math.min(photos.length, v.bestPhoto || 1) - 1];
  writeFileSync(join(out, `step${n}-1-photo-used.jpg`), best);
  if (v.verdict === "incorrect" && v.issues?.length) {
    const ab = await annotatePhoto(best, v.issues);
    if (ab) { writeFileSync(join(out, `step${n}-2-annotated.png`), ab); report += `\nAnnotated image: step${n}-2-annotated.png\n`; }
    else report += `\n(annotation by image model failed)\n`;
  }
  report += "\n";
  console.log(`step ${n}: ${v.verdict} — ${v.correctionText}`);
}
writeFileSync(join(out, "report.md"), report);
console.log("written to", out);
