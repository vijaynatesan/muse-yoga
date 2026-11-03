# HandOffForUI.md — Handoff from POC Session to UI Design Session

**Read this together with `scope.MD` (the governing scope). This file records what the POC proved, so the UI session does not re-litigate it.**
Workspace: the repository root · All POC code is inside `POC/` only. Full POC report: `POC/POC_REPORT.md`.

---

## 1. Where we are (process state)

- POC phase is **complete and owner-approved** (2026-10-30). Total API spend: **$0.62 / $15 budget**.
- Owner decision (deviation from scope §1 order, explicitly approved): **UI design BEFORE `design.MD`**, so the technical design must then prove it supports the approved UI.
- UI workflow the owner wants, in strict order:
  1. **Wireframes first** (`uidesign.MD`) → owner reviews/iterates → **owner approval gate**.
  2. Only after wireframe approval: **high-fidelity prototype** — professional-looking, **linked/clickable, a runnable mock the owner can open and navigate** (not static pictures alone).
  3. Do NOT jump to high-fidelity, `design.MD`, or production app code before the wireframe gate.
- After UI approval, `design.MD` must include a UI-support traceability check: every UI element mapped to the technical mechanism supporting it; unsupported items come back as a small UI revision, never silently dropped.
- In every phase: **stop and wait for the owner's explicit approval before moving to the next phase.**

## 2. POC verdicts (proven facts — design UI around these)

| # | Item | Verdict | Key fact for UI |
|---|---|---|---|
| a | `muse-wonder-1.0` step/metadata generation | PASS | Returns valid JSON: steps, difficulty, body part, category, benefits, contraindications, duration/step. ~6 s per asana. |
| b | `muse-image-1.0` character step images | PASS only with gating (see §3) | One image takes **11–35 s** → asana creation is a 1–2 min flow. UI needs an honest waiting/progress state, not a spinner that looks hung. |
| c | Reference PDF extraction | PASS with caveats | This 54-page Govt of India book extracts in <1 s locally, but server-side/batch for larger books. Each PDF needs a `Processing / Ready / Failed` status in Admin UI. |
| d | Feedback chain (intent → reference → alignment) | PASS with caveats | Rejected feedback shows a model-given reason. UI must display rejection reasons clearly. Rejected feedback still counts toward the 3-feedback limit — show remaining count. |
| e | Multi-device sync capture | PASS, 3 devices tested on real hardware | See §4. |
| f | Pose validation + annotated image | PASS for judgement; annotation method changed | Vision verdict ~10 s/step, $0.057/step. Annotation is a **programmatic red-circle overlay on the stored character image**, never an AI-regenerated image (see §3). Results are spoken on Primary + displayed. |
| g | TTS | Browser `speechSynthesis` is the candidate | No TTS model exists in the Meta catalog (only transcription). Primary speaks; Secondaries are muted. Final TTS choice is a `design.MD` decision — UI must not hard-assume a voice provider. |

### API facts (for realistic UI states; not a design decision)
- Base: `https://api.meta.ai/v1`; models `muse-wonder-1.0` (chat via Responses/chat-completions) and `muse-image-1.0` (`/images/generations`, `/images/edits`). Key is in workspace `.api.txt` — **never copy it into any UI/prototype file**.
- Costs at POC volume are trivial (wonder ~$0.005–0.02/call, image $0.01/image, vision check ~$0.035–0.06/call).
- Image API can randomly hit `content_policy_violation` (400) or 500 on legitimate yoga prompts → UI needs a retry/failure state for generation, and the production flow retries automatically.

## 3. Hard-won image lessons (these MUST shape the UI and generation flow)

1. Generated step images frequently had the **wrong character** or **extra limbs (3 legs)** in round 1. Full audit: `POC/outputs/image_audit.json`; bad images archived in `POC/outputs/b/archive_round1/` and `POC/outputs/f/archive_round1/` — the only approved finals are `POC/outputs/b/final/step1–4.png`.
2. What fixed it (production flow must include this; UI must surface its states):
   - Generate **only** via `images/edits` with the selected character image as reference. **Never** fall back to text-only generation — it loses the character entirely.
   - Character-lock prompt (exact skin/hair/outfit/style named) + anatomy prompt (`exactly 1 head, 2 arms, 2 legs`).
   - **Automated vision gate after every image**: same character? head/arm/leg counts? pose matches step? Fail → regenerate (max 3 attempts tried in POC; step with palms-beside-ears needed an explicit "must NOT stand, remain lying on back" negative prompt).
   - Human accept via the scope's feedback loop remains load-bearing.
3. **Annotation**: AI image-edit annotation regenerated a totally different person/pose once. Use wonder to identify error locations + draw red circles/arrows **programmatically** on the stored image (proven: `POC/e_primary_session/annotate_local.py` → `POC/outputs/f/final_annotated_boy_step1.png`). History stores this annotated character image, never the user's photo.
4. Approved sample assets to reuse as realistic mock content in prototypes:
   - Characters: `characters/default/character_for_yoga_pose_boy.png`, `character_for_yoga_pose_girl.png` (default folder always shown first in character selection).
   - Existing asana example: `asanas/public/chakrasana/` (3 step PNGs + `step1.txt`…`step3.txt`).
   - POC-generated gated set: `POC/outputs/b/final/` (boy character, Chakrasana steps 1–4) and `POC/outputs/a/chakrasana.json` (steps + metadata: Advanced, Back and Spine, Backbend…).

## 4. Multi-device POC (scope 13) — real hardware results

- Implementation (POC only, not production stack): `POC/multi_device/server_multi.py` (aiohttp HTTPS :8443, WebSocket sync) + `index_multi.html`. Start: `POC/.venv/bin/python POC/multi_device/server_multi.py 8443`. Run sheet: `POC/multi_device/RUN_WIFI_TEST.md`.
- **Tested and working by the owner on 2 laptops, then 2 laptops + iPhone (scope max 3 devices).**
- Measured synchronised-capture spread (server log `POC/outputs/e/sync_log.jsonl`): 2 devices **9–68 ms**, 3 devices **12–148 ms**. Capture is scheduled at a server timestamp (+1200 ms lead) with per-device clock-offset correction.
- Proven behaviours UI can rely on: devices list with roles; explicit **"Make this device Primary"** (no auto-primary — first-joiner auto-primary caused confusion and was removed); Secondary is camera-only/muted; Primary-only controls; disconnect is broadcast and **spoken on Primary** ("a device has gone offline"); capture thumbnails from other devices appear on each device.
- **Not yet built (design-phase, UI must mark as assumed/to-prove)**: live *streaming* video of other devices' cameras (needs WebRTC). POC exchanged captured still thumbnails, not live feeds. The coaching wireframe must show other-device live feeds per scope 13.2, flagged as WebRTC-dependent.
- LAN/camera gotchas that affected real testing: camera needs HTTPS (self-signed cert in POC) or localhost; WSL is NAT'd so Windows needs an admin `netsh portproxy` + firewall rule for `<PC-LAN-IP>:8443` (WSL IP changes on reboot); browsers sometimes silently block camera — POC added an explicit **Enable Camera** button with a plain-language status line. Keep that pattern in the real UI.
- POC also has a single-device coaching page: `POC/e_primary_session/index.html` (+ `server.py`). It implements the exact scope 13.3 script (speak "Step N" + instruction → "Get ready 1,2,3" → capture on 3, 3× per step 3 s apart → "Move to the next step" → "Analyzing, please wait"), health-disclaimer gate, stored reference image, current-step highlight, photos held in memory only.

## 5. Scope rules the UI must not violate (from `scope.MD`)

- Login mandatory for everything; email + OTP only. Registration OTP: 3 requests/email lifetime → permanent block. Login: 3 failed OTP → 6 h lock; second time → permanent block. Max 3 simultaneous devices; 4th login refused with a specific message. Admin = email in config file (no admin user-management screens).
- No manual editing of asana steps/metadata anywhere. Editing happens only through the AI feedback loop (max 3 feedbacks/asana incl. rejected, no conversation memory between submissions, regenerate = all steps/images replaced).
- Normal users cannot create an asana absent from reference books (admins exempt). Duplicate of a Public asana name cannot be created in Personal.
  - Reference lookup caveat: names use diacritics/transliteration variants (Tāḍāsana; Vṛkṣāsana ≠ "Vrikshasana") — exact search fails. **Full Chakrasana is not in the Govt book (only Ardha Cakrāsana)**, so the Chakrasana example is effectively admin-created content. UI needs graceful "not found in reference books" states.
- Libraries: Public (search/filter by difficulty, body part, category; "Submitted by [first name]" credit; admin enable/disable only, no delete) and Personal (owner-only, disable is reversible, no delete, no copy from Public).
- Publishing: submit → pending (can still practise/disable/**withdraw**) → admin approve/reject with mandatory rejection reason. Approved moves Personal → Public and the creator loses edit rights. Rejected stays in Personal with reason visible, **cannot be edited or resubmitted** (disable + create new instead). UI must make these states unmistakable.
- Favourites: multiple named lists, mix of Public+Personal, no duplicates in a list, disabled asanas hidden, rename/delete list (never deletes asanas), practise one asana at a time (no auto-play sequence).
- Practice: mandatory health disclaimer before session; contraindications shown with each asana. Max 3 devices; Primary = TTS + camera, Secondary = camera only. Capture 3 synchronised sets/step, 3 s apart. Validation only after all steps, reported per step, correct/incorrect + correction text + annotated character image, **no score/grade**. Retry = redo all steps. **User photos are never stored** — UI must communicate this privacy promise and never render a stored user photo in History.
- Practice History: calendar month view (current month default, practise days marked, change month, day → sessions that day → session detail with annotated images).
- Admin Panel: approve/reject submissions, enable/disable public asanas, upload character folders/images, upload reference PDFs with processing status, configurable limits (feedback limit 3, OTP limits, lockout 6 h, max devices 3 — defaults until changed). Admin emails are config-file only, not a panel feature.
- English only; browser on laptop + mobile; no native apps. Asana file pattern: one folder per asana, one PNG + one `.txt` per step.
- In `uidesign.MD`, label each element: **proven in POC / assumed / to be proven in design**.

## 6. Screens the UI phase must cover (suggested IA — confirm in wireframes)

Login/OTP (incl. blocked/locked/device-limit states) · Registration · Public Library (search/filter) · Personal Library (incl. disabled, pending, rejected states) · Asana detail (metadata, contraindications, steps, character) · Asana creation (name + character select, default characters first, reference-not-found state, generation waiting state, step review, feedback loop with remaining count + rejection reasons, accept) · Submit for publication / withdraw · Favourites (lists, rename/delete) · Health disclaimer · **Coaching screen — design this first and in most detail** (own camera full, other-device live feeds, stored reference image, step list with current highlighted, capture countdown, Primary vs Secondary variants, disconnect announcement) · Results per step (correct/incorrect, correction, annotated image, spoken) · Practice History (calendar → day → session detail) · Admin Panel (submissions, public enable/disable, characters, reference PDFs + status, limits settings).

Coaching-screen design questions to settle in wireframes: readability at a distance while holding a pose; one-handed/no-touch operation (it runs by voice); what a Secondary user sees/taps (almost nothing); layout switch between 1/2/3 devices; mobile portrait vs laptop landscape.

## 7. Standing instructions for the next session

1. Read `scope.MD` + this file first. Start with **wireframes only** in `uidesign.MD`, coaching screen first. Stop for owner approval.
2. After wireframe approval, build the **high-fidelity, linked, runnable mock prototype** (professional look; realistic content from §3 assets; owner opens and clicks through it). State the exact run/open instructions when handing it over.
3. Do not write `design.MD` or production code in the UI phase unless the owner explicitly changes the order. Respect the budget discipline: POC spent $0.62 of $15; any new API spend needs the same ledger/guard approach (`POC/common/meta_api.py` is the pattern) and owner awareness.
4. Never expose the API key from `.api.txt` in any file, prototype, or commit. Do not modify anything outside `POC/` from the POC phase without approval; UI-phase files live where the owner agrees (`uidesign.MD` + prototype folder).
5. Existing process on :8443 may not be running in the new session — check before claiming any URL is live, and give the exact start command from §4 if it is not.
