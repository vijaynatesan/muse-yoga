# QA Report — Muse Yoga (summary of three independent QA subagent passes)

Full per-ID evidence was returned by the QA subagents in-session (2026-10-31). This file is the handoff summary.

## Pass 1 (S0–S12, executable cases)
Overall: FAIL (3 failed, 53 unverified of 76). Executed Passes included S0.1, S0.2, S0.4, S1.1–S1.3, S1.7, S2.1, S2.5, S3.1, S3.3, S3.4 (mock AI), S3.5 (mock), S4.1, S4.3, S4.4, S5.1, S5.7, S7.8, S8.1, S11.3, S11.4 (HTTP part), S12.5 (`npm test` 13/13).
Defects: D1 HTTPS served plain HTTP (S0.3); D2 Favourites DELETE empty-body 400 (S2.4); D3 suspected OTP throttle (S11.7).

## Fixes
- D1: HTTPS now created via Fastify `https` option from `certs/`; verified TLS 1.3 `200` and plain HTTP refused.
- D2: server strips Content-Type on bodyless requests + web client omits it; regression test added (`app/tests/api.test.ts`).
- D3: not a defect — observed threshold 10/hour per IP+email, 429 on request 11 (QA regression pass).
- S11.1: `/health` now returns booleans only; regression test added.
- S11.4: WebSocket `verifyClient` rejects foreign-origin upgrades with 403 before the 101 handshake; regression test added.

## Pass 2 (regression: S0, S2, S11)
D1 Pass, D2 Pass, D3 Pass (threshold observed). Found S11.1 (health non-booleans) and S11.4 (WS foreign-origin 101) — both fixed above.

## Pass 3 (focused: S11)
PASS 3/3: S11.1, S11.4a (HTTP CSRF 403), S11.4b (WS foreign origin rejected), same-origin WS regression OK.

## Automated suites (builder)
`npm test` — 15/15 pass (domain unit + behavioural API + WS-origin + D2 regression). Typecheck: 0 errors, all workspaces. End-to-end smoke (creation → feedback → favourites → 2-device session → results → history): all PASS.

## Continuation (2026-11-01) — real Meta AI wiring
- Creation images: real `images/edits` bytes are now written to disk (b64 or URL), with an automated gate (image magic + size) and regeneration ≤3 attempts/step, each attempt logged (S3.5). Previously the character image was copied as a placeholder.
- Pose validation: photos now travel browser → WS → server RAM (JPEG data URL, capped, never disk/DB/log), best set is sent to the vision model; any failure → `could_not_check`, never a fabricated `correct`. Annotation = programmatic overlay of marks over the stored character image (C8).
- Voice one-shot fallback: client uploads the recorded clip (multipart) → server transcribes → phrase matcher. Previously the client sent empty JSON and could never match.
- New automated tests: creation image files on disk, multipart transcribe, full WS practice flow (photo capture → results → history free of photo/audio/transcript bytes). `npm test` — **18/18 pass**. Typecheck 0 errors. Production build OK.
- Still UNVERIFIED: real-Meta anatomy/timings (needs `AI_PROVIDER=meta` in `app/.env`, spends budget) and all `BROWSER`/`HUMAN` device cases below.

## Full real-AI test (2026-11-01, builder-run, `AI_PROVIDER=meta`)
35 cases: **32 PASS, 1 FAIL→fixed→PASS on retry, 2 UNVERIFIED**. App-logged real-AI spend for the whole day: 33 calls, **≈$0.55 estimated** (owner cap was $5).
- Real creation: Dhanurasana steps in 8.1 s; 6/6 `images/edits` images with real bytes (hash ≠ character image), all gates pass, 121 s. Feedback: junk rejected at intent with model reason (count 3→2); valid correction accepted by real intent+alignment judges, whole-asana regen (7 steps + images). Accept → Personal; submit → admin reject-with-reason flow PASS.
- Auth: register, 3-wrong-code 6 h lock, correct code refused during lock, 4th login device refused, unauthenticated 401 — all PASS.
- Real one-shot transcribe (silence, 16 kHz WAV): 200, no match — PASS. Spoken-"ready" positive: UNVERIFIED (no TTS/mic in sandbox).
- Real vision validation: initial failure diagnosed — default reasoning effort consumed the 600-token budget, leaving no verdict text. Fixed (`reasoning: low`, 1600 tokens). Retry: both steps judged `incorrect` with sensible corrections ("Bring your feet together…", "Raise both arms overhead…") and 2 overlay marks per step — PASS. History contains zero photo/audio/transcript bytes.
- Defects found & fixed during this test: (1) `app/.env` held a stale Meta key (401 `invalid_api_key` on every wonder call) — re-synced from workspace `.api.txt` by file copy, never printed; (2) transcribe request used unproven field names — corrected to the POC-proven shape (`request` JSON part + `audio` part, `POC/g_voice/server.py`); (3) vision token budget above.
- UNVERIFIED (unchanged): all `BROWSER`/`HUMAN` cases — multi-device sync spread, voice at ≤5 ft, framing with a body, no-scroll/readability in a real browser (no Chromium in this sandbox).

## Owner manual-test defects fixed (2026-11-01)
1. **Demo image did not follow narration.** Server demo now carries a per-room `demoIdx`: every tick broadcasts `demoStep {n,total}` with the narration, state snapshots include `demoIdx`, and the client drives the reference image, caption, and step chips from it. Hear Again re-speaks the *current* demo step; Pause/Resume added; duplicate `startDemo` is now ignored server-side (a doubled start previously interleaved two tick chains and emitted a phantom step 3 — caught by the new regression test). New maintained test in `app/tests/api.test.ts`: demo steps broadcast `[1,2]` in order with matching narration. Suite: **20/20 pass**, typecheck 0, build OK.
2. **Saying "ready" was never recognised — endless "Sorry, I didn't hear you" loop.** Two compounding causes: (a) the 10 s listening window started when the prompt *began* speaking, so slow TTS ate most of it and the recogniser ran over the app's own voice; (b) the recogniser matched on every *interim* result, and duplicate window opens stacked two recognisers. Fix: `prompt`/`listen` voice-window phases in `app/apps/server/src/session.ts` — the server speaks first, the Primary reports `promptDone` when its TTS finishes, and only then does the 10 s window start (8 s fallback so a lost message can't wedge the session). The client (`app/apps/web/src/Practice.tsx`) speaks via a tracked utterance, matches on final results only, never double-starts recognition, and stops it when the window closes. Also fixed on the way: the one-shot fallback now re-encodes any recording to 16 kHz WAV in-browser (probed 2026-11-02: Meta ASR returns 400 for webm/mp4 regardless of the encoding label — WAV is the only accepted format). Verified in real headless Chromium driving the UI: stubbed "I am ready" → counting starts in <1 s; silence on the one-shot path → WAV conversion, transcribe, timeout apology, zero page errors. New maintained test (prompt → `promptDone` → single listen window → counting). Suite: **21/21 pass**.
3. **Practice camera never opened on the coaching screen.** The camera permission/stream was attached to the setup screen's `<video>` element; moving to disclaimer and coaching remounted new `<video>` elements with no stream, while `camOn` hid the Enable button — black camera, and captures silently drew blank canvases. Fix: a callback ref (`attachVideo` in `app/apps/web/src/Practice.tsx`) re-attaches the live stream to whichever video element is mounted, reuses the stream instead of re-requesting it, and surfaces a stopped-camera state. Verified in real headless Chromium with a fake camera device driving the actual UI (register → Practise → Enable Camera → session → disclaimer → coaching): coaching video has a live 640×480 stream (`readyState` 4, playing, no "Camera is off" overlay), confirmed on a captured screenshot. Suite: **20/20 pass**.
4. **Pages aligned to `prototype/index.html`.** Shell (rounded top-nav card, 1480px centred app, gradient background, pill nav), Auth (Welcome back / code step), Libraries (pagehead + pill search/filter bar, prototype cards, pager), Detail (benefits/cautions left, step rows right), Favourites (list tabs), Create (6-step wizard rail + character picker), History (Monday-first calendar with dot/count markers + day-detail panel, results as verdict rows with large view), Admin (tabbed panels with prototype tables), Results (verdict rows + flow footer), Disclaimer (centred prototype card). No behaviour or API changed.

## Admin step editing (C16, 2026-11-03)
Built: admin-only edit text/duration, add, delete, reorder, and single-step image regenerate (+ optional adjustment) on the creation draft; stale images block Accept; step limits 2–12 from settings (`minSteps`/`maxSteps`); intent check on edited/added text; audit entries `creation.step.*`.
Tests: `npm test` — **40/40 pass** (6 new domain tests + 12 new behavioural API tests in `tests/admin-steps.test.ts`, which run on a throw-away data folder via `MUSE_DATA_DIR` and an `ADMIN_EMAILS` env override — never the real data). Typecheck 0 errors, build OK. Real headless-Chromium UI run (register as admin → create → edit/delete+confirm/insert/intent-reject → generate → stale blocks Accept → regenerate unblocks) — no page errors.
Mock AI only; real-Meta single-step regeneration NOT yet run (spends budget). Admin step UI scrolls inside the card for long asanas (deviates from C10 no-scroll, needed for 12 steps).
Note: an early test run wrote a stray public "Bhujangasana" into the real `app/data`; it was removed (backup kept) and the tests now use a temp data dir.

## UNVERIFIED (need owner devices/body/browser — never marked Pass)
All `BROWSER`/`HUMAN` cases: S0.3 LAN phone/camera prompts, S1.4 (second lock after 6 h), S1.5 (3 real logins + 4th), S1.6, S2.2–S2.4 UI parts, S3.2/S3.4–S3.7 with real Meta AI (anatomy, timings, failure retry), S4.2/S4.5 with real AI, S5.2–S5.6 admin-positive flows, S6.1–S6.5, S7.1–S7.7 (sync spread, roles, disconnect on hardware), S8.2–S8.7 (voice at ≤5 ft, streaming latency, fallback), S9.1–S9.4 (framing), S10.1/S10.2/S10.5 with real poses/AI, S11.1 LAN scan, S11.5 full forensics, S11.6 admin upload attacks, S12.1–S12.4 (no-scroll/readability in a browser).

Notes: no Chromium is available in the build sandbox, so no browser automation was run. Real-AI timings/anatomy require `AI_PROVIDER=meta` in `app/.env` (spends the Meta budget) and the owner's devices.
