import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = join(HERE, "../../..");
export const DATA_DIR = process.env.MUSE_DATA_DIR || join(APP_ROOT, "data");   // override lets tests run against a throw-away folder
export const OBJECTS_DIR = join(DATA_DIR, "objects");
export const MAIL_DIR = join(DATA_DIR, "mail");
const DB_FILE = join(DATA_DIR, "db.json");

export type Row = Record<string, any>;
export interface DB {
  users: Row[]; otpChallenges: Row[]; loginSessions: Row[];
  asanas: Row[]; characters: Row[]; referenceBooks: Row[]; referenceAsanas: Row[];
  favourites: Row[]; favouriteItems: Row[]; practiceSessions: Row[];
  settings: Record<string, any>; jobs: Row[]; audit: Row[]; aiCalls: Row[];
  regOtp: Row[]; // {email, count, blocked}
}

export const id = () => randomUUID().slice(0, 12);
export const now = () => new Date().toISOString();
export const hashCode = (code: string, salt: string) => createHash("sha256").update(salt + ":" + code).digest("hex");
export const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");

let db: DB;

function emptyDb(): DB {
  return { users: [], otpChallenges: [], loginSessions: [], asanas: [], characters: [], referenceBooks: [], referenceAsanas: [], favourites: [], favouriteItems: [], practiceSessions: [], settings: {}, jobs: [], audit: [], aiCalls: [], regOtp: [] };
}

export function save() {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(db, null, 1));
  renameSync(tmp, DB_FILE);
}

const REF_NAMES = ["Tadasana", "Tāḍāsana", "Vrikshasana", "Vṛkṣāsana", "Pada-Hastasana", "Ardha Chakrasana", "Trikonasana", "Trikoṇāsana", "Bhujangasana", "Bhujaṅgāsana", "Halasana", "Vakrasana", "Anuloma Viloma", "Bhramari", "Shavasana", "Sarvangasana", "Dhanurasana", "Matsyasana", "Ushtrasana", "Shashankasana", "Kapalbhati", "Surya Namaskar"];

function seed() {
  const limitsPath = join(APP_ROOT, "config/limits.default.json");
  const limits = existsSync(limitsPath) ? JSON.parse(readFileSync(limitsPath, "utf8")) : {};
  for (const [k, v] of Object.entries(limits)) if (db.settings[k] === undefined) db.settings[k] = v;
  if (!db.characters.length) {
    db.characters.push(
      { id: "char-boy", folder: "default", name: "Boy", imageKey: "characters/default/char-boy.png", isDefaultFolder: true },
      { id: "char-girl", folder: "default", name: "Girl", imageKey: "characters/default/char-girl.png", isDefaultFolder: true },
    );
    for (const [seedFile, key] of [["boy.png", "characters/default/char-boy.png"], ["girl.png", "characters/default/char-girl.png"]] as const) {
      const src = join(APP_ROOT, "seed/characters/default", seedFile);
      const dst = join(OBJECTS_DIR, key);
      mkdirSync(dirname(dst), { recursive: true });
      if (existsSync(src)) copyFileSync(src, dst);
    }
  }
  if (!db.referenceBooks.length) {
    db.referenceBooks.push({ id: "ref-govt-2018", title: "Common Yoga Protocol (Government of India, 2018) — bring-your-own example", pdfKey: null, status: "ready", failReason: null, uploadedBy: "seed" });
    for (const name of REF_NAMES) db.referenceAsanas.push({ id: id(), bookId: "ref-govt-2018", name, text: `Reference instructions for ${name} from Common Yoga Protocol. Practise gently, breathe steadily, stop if there is pain.`, pageRefs: [] });
  }
  if (!db.asanas.length) {
    const seedJson = JSON.parse(readFileSync(join(APP_ROOT, "seed/asanas/chakrasana/asana.json"), "utf8"));
    const chId = "asana-chakrasana";
    db.asanas.push({
      id: chId, name: "Chakrasana", characterId: "char-boy", creatorId: null, library: "public", state: "public",
      difficulty: seedJson.difficulty, bodyPart: seedJson.body_part, category: seedJson.category,
      benefits: seedJson.benefits, contraindications: seedJson.contraindications,
      feedbackUsed: 0, rejectionReason: null, submittedByName: null, createdAt: now(),
      steps: seedJson.steps.map((s: any) => ({ n: s.step, instruction: s.instruction, durationS: s.duration_seconds, imageKey: `asanas/${chId}/step-${s.step}.png` })),
    });
    mkdirSync(join(OBJECTS_DIR, `asanas/${chId}`), { recursive: true });
    for (let n = 1; n <= 4; n++) {
      const src = join(APP_ROOT, `seed/asanas/chakrasana/step${n}.png`);
      if (existsSync(src)) copyFileSync(src, join(OBJECTS_DIR, `asanas/${chId}/step-${n}.png`));
    }
    const mk = (aid: string, name: string, difficulty: string, bodyPart: string, category: string, steps: string[], charId: string) => ({
      id: aid, name, characterId: charId, creatorId: null, library: "public", state: "public",
      difficulty, bodyPart, category, benefits: ["Improves balance and steadiness", "Builds focus"], contraindications: ["Vertigo", "Knee injury", "Pregnancy"],
      feedbackUsed: 0, rejectionReason: null, submittedByName: null, createdAt: now(),
      steps: steps.map((instruction, i) => ({ n: i + 1, instruction, durationS: 20, imageKey: `asanas/${aid}/step-${i + 1}.png` })),
    });
    const tadasana = mk("asana-tadasana", "Tadasana", "Beginner", "Full Body", "Standing", ["Stand tall with feet together, arms beside your body. Breathe deeply and lengthen your spine.", "Raise your arms overhead, interlace fingers, stretch upward while keeping feet grounded. Hold and breathe."], "char-girl");
    const vrik = mk("asana-vrikshasana", "Vṛkṣāsana", "Beginner", "Legs", "Balance", ["Stand in Tadasana. Shift weight to your left leg and place right foot against left inner thigh.", "Bring palms together at your chest, then raise arms overhead like branches. Hold, breathe, repeat other side."], "char-boy");
    db.asanas.push(tadasana, vrik);
    for (const a of [tadasana, vrik]) {
      mkdirSync(join(OBJECTS_DIR, `asanas/${a.id}`), { recursive: true });
      a.steps.forEach((s: any, i: number) => {
        const charFile = join(OBJECTS_DIR, a.characterId === "char-boy" ? "characters/default/char-boy.png" : "characters/default/char-girl.png");
        if (existsSync(charFile)) copyFileSync(charFile, join(OBJECTS_DIR, s.imageKey));
      });
    }
  }
}

export function loadStore(): DB {
  mkdirSync(OBJECTS_DIR, { recursive: true });
  mkdirSync(MAIL_DIR, { recursive: true });
  if (existsSync(DB_FILE)) {
    try { db = { ...emptyDb(), ...JSON.parse(readFileSync(DB_FILE, "utf8")) }; }
    catch { db = emptyDb(); }
  } else db = emptyDb();
  seed();
  save();
  return db;
}
export function getDb(): DB { return db; }
export function audit(actor: string, action: string, subject: string, detail: Row = {}) {
  db.audit.push({ id: id(), actor, action, subject, detail, at: now() });
  save();
}
export function logAiCall(model: string, purpose: string, ms: number, estUsd: number, extra: Row = {}) {
  db.aiCalls.push({ id: id(), model, purpose, ms, estUsd, at: now(), ...extra });
  save();
}
