# HandOffToBuild.md — Handoff to the Build Session

> **Purpose:** Start a fresh Muse session that builds the app. This file + the test scripts are the entry point.
> **Status:** Design Phase complete and owner-approved (`design.html`). POC phases a–g + voice POC g complete and owner-tested. No app code exists yet. Nothing has been committed to Git (no repo yet, by owner decision).

---

## 1. Read these first (in this order)

| # | File | Role |
|---|---|---|
| 1 | `scope.MD` | Frozen product contract. Wins unless a C-revision in `design.html §0/§8` says otherwise. |
| 2 | `design.html` | **Approved design (authority for how to build).** §0 decisions table, §1 stack + architecture, §1.5 Google SMTP, §2 Security (esp. §2.5 “backend cannot be reached directly”), §3 folders + deferred Git, §4 front end, §5 domain rules, §6 backend + WS protocol, §7 DB/files, §8 traceability A1–A10 + acceptance tests. Open it via `python3 -m http.server 5173` → `http://localhost:5173/design.html`. |
| 3 | `design-gate-review.html` | C1–C15 dispositions and why (§1), the four §2 contradictions and their owner-accepted defaults (§2). Background only; `design.html` is the build authority. |
| 4 | `uidesign.MD` + `prototype/index.html` | Approved UI structure + approved look-and-feel (sage `#2F5D43`, Fraunces headings, Outfit body). Prototype code is **throwaway** — a visual/functional spec to re-implement, never to copy. `prototype/coaching-primary.html` is the approved coaching direction; variant B was not chosen. |
| 5 | `HandOffForUI.md` + `POC/POC_REPORT.md` | POC evidence/proven facts (§2 table), image lessons (edits-only, gate), multi-device results (9–148 ms). |
| 6 | `POC/g_voice/README.md` + `POC/outputs/g/report.json` | Voice POC: phrases, matcher, one-shot API (~1.5 s), what is/is-not proven. |
| 7 | `TestScriptsForBuild.md` | **Mandatory QA.** The build session must delegate validation to a subagent using it (§6 below). |
| 8 | `UItoDesignHandoff.MD` | Historical handoff (read only if `design.html` seems to contradict the UI phase; design wins, flag it). |

## 2. Locked decisions (do not re-open; implement them)

- **Stack:** TypeScript monorepo — React+Vite front end, Node.js/Fastify modular-monolith server, WebSocket session authority, PostgreSQL, local-disk file storage, Redis jobs, Python/PyMuPDF parse worker. All on **this local machine / LAN only** — no cloud hosting, no cloud storage.
- **Admin:** `<admin-email>` in `app/config/admins.json` (hot-reloaded). Same login for everyone; no user management exists.
- **Mail:** Google SMTP by config (`MAILER=gmail`, `smtp.gmail.com:587`, Gmail app password in local `.env` only). Mailpit remains the offline alternative profile. See design §1.5.
- **Git/GitHub:** **Do not initialise Git, do not create `.gitignore` commits, do not push.** Build → test → fix → refine → owner confirms → only then publication phase (repo init, ignore rules in design §3, no Government PDFs — README names them as bring-your-own examples, code+seed only). Folder/secret hygiene is kept publication-ready meanwhile.
- **Security (design §2.5):** Only web+API+WS on one origin is reachable. Domain modules/workers/DB/Redis/Meta/SMTP have no browser-reachable address. Login = identity only; every operation re-checks user/object/state/quota. Keys never leave the server.
- **Privacy, structural:** User photos and voice audio are never stored (no DB column, no file, no log bytes). History = text + annotated character images only.
- **Voice (C15):** Production = streaming (`wss://api.meta.ai/v1/asr/realtime`) via server proxy; POC one-shot is fallback. Phrases: `ready` · `I’m ready` · `let us start` (+ let’s start / I am ready), whole-word match, negation veto. Only the Start screen has a click; after Start, **every step is voice-only; there is no per-step click anywhere.** Listening opens only after the TTS prompt finishes, max 10 s, Primary mic only. Timeout/error → spoken apology → back to the existing Start screen (progress kept; Start re-enters the same pending step and asks by voice again).
- **Practice rules:** AUTO-Primary first joiner (C1, provisional, behind a strategy switch), switch queued to step boundary (C2), promotion on Primary loss (C3), Demo → Start (C4), framing pause/resume (C5, MediaPipe on-device), Select flows (C6), per-asana contraindications in Disclaimer (C7), clickable results → large annotated view (C8, programmatic overlay only), no-scroll with pagination (C10), equal-split coaching (C11), shared card (C12), origin-aware back (C13), no silent state reuse (C14).
- **Admin step editing (C16):** admin-only, creation draft only — edit text/duration, add, delete (that step alone), reorder (2–12 steps, settings `minSteps`/`maxSteps`), regenerate one step's image with optional adjustment (`images/edits`, gated, ≤3 attempts). Intent check on text; stale/missing/failed images block Accept; users get 403.
- **Scope invariants:** OTP limits/locks, max 3 login devices + max 3 session devices, feedback = only edit path (max 3 incl. rejected, whole-asana regen), disable-only deletion, rejected = cannot edit/resubmit, approved leaves Personal, favourites one-at-a-time, redo = all steps, no score/grade, step images stored once never regenerated in practice.
- **Ports:** Port **3000 is occupied by the owner’s `open-webui` container — never touch it.** App uses other ports (suggest web/API 5173→app proxy or 8080-free choice at scaffold; document the final ones in the app README).

## 3. Environment state (owner machine, WSL2 Ubuntu 22.04)

- Done: Git 2.34 · Python 3.10 · Docker 29.3 + Compose (daemon verified via `docker ps`; `open-webui` on 3000 is protected) · ffmpeg · Node 22 via nvm + pnpm (corepack) · `build-essential` · `mkcert` + `libnss3-tools` (`mkcert -install` run for Linux; Windows/phone CA trust happens at the multi-device test).
- Deferred (owner does it, at first OTP test): Gmail 2-Step Verification → App Password → local `app/.env`. **Never ask the owner to paste it into chat; never commit `.env`.**
- API key: workspace `.api.txt` (Meta). Read server-side only; move its *value* into `app/.env` as `META_API_KEY` at scaffold time by file copy, never by printing it.
- Start reference servers if needed: `python3 -m http.server 5173` (design/prototype), `python3 POC/g_voice/server.py 5174` (voice POC). Check before claiming any URL is live.

## 4. What to build (order — do not skip ahead)

1. **Scaffold** per design §3 (`app/` monorepo, contracts, domain, compose for PG/Redis, one-command `scripts/dev.mjs`, LAN HTTPS via mkcert). Seed: default characters, Chakrasana sample asana (POC final images), reference-folder layout without PDFs.
2. **Auth + libraries read paths** (register/login OTP via Gmail SMTP, public/personal/detail, search A4, favourites).
3. **Creation + feedback + publishing + admin** (jobs, gated generation §A7, reference checks, limits from settings).
4. **Practice: session + coaching without voice/framing first** (sync capture, demo sequencing, results, history) — get the POC-proven core solid.
5. **Then framing (A9) and streaming voice (A10)** behind their fallbacks, then WebRTC live feeds (A1) with thumbnail fallback.
6. **Harden + validate:** run `TestScriptsForBuild.md` via QA subagent (§6). Fix, refine, re-test. **Stop for owner confirmation.** No Git/GitHub step until the owner says so after that confirmation.

At each numbered step, run the matching test-script sections before moving on (the test file maps sections to steps).

## 5. Hard rules for the build session

- No production behaviour may be invented beyond `design.html`; gaps go back to the owner as design revisions.
- Never expose `.api.txt` contents, `.env`, or any app password in files, logs, commits (there are none yet), or chat output.
- POC code/assets are evidence only (`POC/` stays frozen; reuse the *approved sample images*, do not import POC code).
- Stored step images are write-once; annotation is programmatic overlay; `images/edits` only (never text-only fallback) with the automated vision gate.
- All limits (feedback/OTP/lock/devices) come from settings/config, never literals.
- English only; no passwords; no native apps; no manual asana editing anywhere.

## 6. Mandatory QA subagent protocol (owner requirement)

Quality validation is **not** self-certification by the builder:

1. The build session spawns a **fresh subagent** (QA role) whose only inputs are `TestScriptsForBuild.md`, the running app URL, and test accounts it creates. It must not read the builder’s implementation notes or diffs first — verdicts come from behaviour.
2. The QA subagent executes the scripts, records **evidence per case** (exact steps, observed output, timings where the script demands them), and returns Pass/Fail per ID with defects reproduced minimally.
3. Builder fixes defects, then the QA subagent **re-runs failed cases plus their section’s regression cases**. A section is done only on a full QA pass, reported with evidence — “looks fine” is not a result.
4. Real-hardware scripts (multi-device sync, voice at 5 ft, framing) are run with the owner’s devices where the script says HUMAN; the subagent prepares the run sheet and judges the logged/timing evidence, and marks anything it could not execute as UNVERIFIED rather than passed.
5. Final handoff to the owner includes the QA report (per-ID results, defects found/fixed, unverified items). Only after owner confirmation does any Git/GitHub publication step begin.
