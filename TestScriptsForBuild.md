# TestScriptsForBuild.md — QA Test Scripts for the Build Session

> **Owner requirement:** quality validation is executed by a **QA subagent**, not self-certified by the builder.
> **Inputs to the QA subagent:** this file, the running app URL (given by the builder), and nothing else. The QA subagent must not read builder notes/diffs before testing — verdicts come from behaviour.
> **Authorities:** `scope.MD` (contract), `design.html` (approved design), `uidesign.MD`/`prototype/` (UI), `HandOffToBuild.md` (locked decisions).

## How to run these scripts (QA protocol)

1. Execute sections in order **S0 → S11**. After each build step (see `HandOffToBuild.md §4`), run at least the mapped sections before the builder proceeds.
2. For every case record: **Result** Pass/Fail, **Evidence** (exact observed text/timing/state; screenshot or log line where stated), **Defect** (minimal reproduction if Fail). “Looks fine” is not evidence.
3. Tags: `AUTO` = automatable (unit/API/browser), `BROWSER` = real browser interaction, `HUMAN` = needs owner devices/body (sync, voice-at-5ft, framing). Anything not executed is **UNVERIFIED**, never Pass.
4. On Fail: builder fixes → QA re-runs the failed case **plus every other case in that section** (regression). A section is green only on a full pass.
5. Test data: create disposable accounts (`qa1@…`, `qa2@…` via Google SMTP OTP; read codes from the real test inbox). Never use the owner’s Gmail password or the Meta key; never print either.
6. Time figures below are **acceptance bars from POC evidence**, not hopes: steps ~6 s · image 11–35 s each · validation ~10 s/step · sync spread ≤~150 ms · voice one-shot ~1.5 s tail.

---

## S0 — Setup & startup smoke *(build step 1)*

| ID | Script | Pass condition |
|---|---|---|
| S0.1 `AUTO` | Fresh checkout → follow app README exactly (env from `.env.example`, one dev command) | App, API, WS, DB, Redis all report healthy on the health page; no undocumented manual step needed |
| S0.2 `AUTO` | Start while `open-webui` (port 3000) is running | App does not bind/conflict with port 3000 and never stops/alters that container |
| S0.3 `AUTO` | Open the app on `https://localhost` (Primary PC) and on a LAN phone via the mkcert HTTPS address | Both load with trusted cert (no warning click-through); camera/mic permission prompts appear |
| S0.4 `AUTO` | `git status` / file scan (workspace is pre-Git by design) | No file contains the Meta key or an SMTP password except local `.env`; `.env.example` contains placeholders only |

## S1 — Registration, login, OTP rules *(scope §5; design §2.2/§5)*

| ID | Script | Pass condition |
|---|---|---|
| S1.1 `BROWSER` | Register `qa1` (name/email/age/ZIP) → read OTP from Gmail inbox → verify | Account created; lands in Public Library; lifetime counter shows 1 of 3 used |
| S1.2 `BROWSER` | Request registration codes until the lifetime cap is hit on a fresh email (complete none) | 4th request refused; that email can never register afterwards; message states permanent block with no recovery |
| S1.3 `BROWSER` | Login with a wrong code 3× | After 3rd failure: 6-hour lock message with expiry; correct code during lock still refused |
| S1.4 `AUTO` | Repeat S1.3 after lock expiry (test settings may shorten lock for QA, then restore defaults) | Second lock event → permanent-block message; no login path succeeds |
| S1.5 `BROWSER` | Log the same account in on 3 devices, attempt a 4th | 4th refused with “already signed in on 3 devices — sign out on one first”; nobody is silently kicked off |
| S1.6 `BROWSER` | Visit every route (`/public /personal /create /history /admin`) logged out | Always redirected to Login; nothing browsable |
| S1.7 `AUTO` | Request OTP twice quickly; wait past 10-min expiry; try old + used codes | Resend counts toward limits; expired and replayed codes rejected; responses do not reveal whether an email exists vs is blocked |

## S2 — Libraries, detail, favourites *(scope §§6, 11.1–11.2, 12)*

| ID | Script | Pass condition |
|---|---|---|
| S2.1 `BROWSER` | Public Library: search `Vrikshasana`, `Tadasana`; filter difficulty/body part/category; paginate | `Vṛkṣāsana`/`Tāḍāsana` found without typing diacritics; filters combine; no scrollbar appears (pagination instead) |
| S2.2 `BROWSER` | Open a user-contributed public asana | “Submitted by {first name}” shown; stored step images/text identical to coaching images; contraindications visible; **no edit affordance anywhere** |
| S2.3 `BROWSER` | Personal Library: exercise Active → Disable → Re-enable; check Favourites + practice lists while disabled | Disabled asana vanishes from Favourites/practice selection, returns on re-enable; nothing is ever deleted |
| S2.4 `BROWSER` | Favourites: create 2 lists, add same asana twice to one list, rename, delete a list | Duplicate add blocked with message; list delete deletes no asana; mixed Public+Personal items coexist; practice starts one asana at a time (no auto-play) |
| S2.5 `AUTO` | As `qa2`, request `qa1`’s personal asana/detail/history IDs directly (API) | 404 for all foreign objects (no data leak in body) |

## S3 — Creation & gated image generation *(scope §9; design §A7)*

| ID | Script | Pass condition |
|---|---|---|
| S3.1 `BROWSER` | As normal user, create an asana **not** in any reference book | Blocked with the reference-book message; nothing saved |
| S3.2 `BROWSER` | Same as admin (`<admin-email>`) | Non-blocking admin note; creation may continue to Public Library |
| S3.3 `BROWSER` | Create a personal asana whose name exists in Public | Blocked with the duplicate message |
| S3.4 `BROWSER` | Happy path with default character (shown first): observe waiting UI | Steps arrive in ~seconds with metadata read-only; images generate per-step with stage+elapsed (no bare spinner); total ~1–2 min; every final image shows the **same character, 1 head/2 arms/2 legs** (human-verify thumbs) |
| S3.5 `AUTO` | Inspect AI-call log + saved files | Every image call is `images/edits` with character reference (no text-only generation); gate verdict logged per step; failed gate → regeneration (≤3) visible in log; accepted images then never change across a practice session |
| S3.6 `BROWSER` | Try to choose a step count, or edit any instruction/metadata text | No such control exists anywhere in the flow |
| S3.7 `BROWSER` | Force a generation failure (invalid character image / API offline via config) | Per-step failure state with Retry; “nothing saved yet” is true (no partial asana in any library) |

## S4 — Feedback loop *(scope §10)*

| ID | Script | Pass condition |
|---|---|---|
| S4.1 `BROWSER` | Submit feedback with one non-correction line (e.g. “what is the price?”) | Rejected with the model’s reason shown; **remaining count decreases by 1** |
| S4.2 `BROWSER` | Feedback asking for a change contradicting the reference book | Rejected at alignment with reason; count decreases |
| S4.3 `BROWSER` | Valid aligned correction | Accepted: **all** steps+images regenerated (old version gone), count decreases; new version reviewable before accept |
| S4.4 `AUTO` | Submit a 4th feedback (limit 3) — also inspect the outbound model payload | 4th refused (limit message); payload of any submission contains **no** previous feedback text (standalone proven from logs) |
| S4.5 `BROWSER` | Admin feedback on an admin-created non-reference asana: valid correction + junk line | Valid: passes (reference checks exempt); junk line: still rejected at intent (exemption does not cover check 1) |

## S5 — Publishing & admin *(scope §§11.3, 16)*

| ID | Script | Pass condition |
|---|---|---|
| S5.1 `BROWSER` | User submits personal asana → while Pending: practise it, then Withdraw | Pending still practisable; Withdraw returns it to Active with no penalty |
| S5.2 `BROWSER` | Admin rejects with empty reason, then with a reason | Empty rejected by UI+API; with reason: asana stays Personal, reason visible to owner, Practise disabled for resubmission path — **Edit and Resubmit do not exist** |
| S5.3 `BROWSER` | Admin approves another submission | Asana moves to Public (“Submitted by …”), disappears from owner’s Personal; owner can no longer send feedback on it |
| S5.4 `BROWSER` | Admin disables a public asana, re-enables it | Disabled: hidden from Public + Favourites, cannot be practised; re-enable fully restores; no Delete button exists anywhere |
| S5.5 `BROWSER` | Admin uploads character folder/image and a reference PDF; watch status | Character appears in creation (default folder still first); PDF shows Processing → Ready; a corrupt PDF shows Failed with reason; parsing does not block the UI |
| S5.6 `BROWSER` | Change Max feedbacks → 1 in Admin Limits; try 2 feedbacks on a new asana | Behaviour changes without code change/restart; restore 3 afterwards. Audit log shows the change |
| S5.7 `AUTO` | As normal user, call every admin API route directly | 403 on all; approval/limit/upload effects absent; attempts audited |

## S6 — Practice core: setup → disclaimer → select → demo → Start *(scope §§13–13.4; C4/C6/C7)*

| ID | Script | Pass condition |
|---|---|---|
| S6.1 `BROWSER` | Enter practice from Asana Detail, Personal Practise, Favourites Practise, and generic Start Practice | Pre-selected arrivals confirm/switch in Select; generic arrival selects first; per the approved two entry orders (gate C6) — selection **never** starts counting |
| S6.2 `BROWSER` | Disclaimer: proceed without ticking; change asana and return | Continue stays disabled until ticked; checkbox is unticked on every entry; the **selected asana’s contraindications are on this screen** |
| S6.3 `BROWSER` | Demo: play, Pause, Hear Again, End Demo; skip demo on a second run | Stored images in order, narration on Primary only, auto-advance after narration + ~2 s; “no photos taken” true (no capture events in session log); Start screen reached both ways |
| S6.4 `BROWSER` | On the Start screen, press Start, walk away: do nothing else | **Step counting does not begin until voice (S8)**; before that, framing/voice states only. (Guards the “click = last click” rule.) |
| S6.5 `BROWSER` | Practice Again from Results; Pick Another Asana from Results | Again → Start screen, same asana, no re-selection; Pick Another → new Disclaimer (new cautions) → Select → Start; devices/Primary retained |

## S7 — Coaching capture, sync, roles, disconnect *(scope §13; C1–C3) — partially `HUMAN`*

| ID | Script | Pass condition |
|---|---|---|
| S7.1 `HUMAN` | 1-device session: run a full asana (voice may be simulated by QA shortcut only if a test hook exists; otherwise S8 path) | Per step: “Step N”+instruction → counts 1-2-3 (1 s gaps) → capture on “3”, exactly 3 sets, 3 s apart, announcement before every capture → “Move to the next step” → final “Analyzing, please wait” |
| S7.2 `HUMAN` | 3 devices (2 laptops + phone), same account, session-code join as a different-account device too | Same-account devices join (≤3); wrong-account with code joins nothing; all screens show same step/count within a glance |
| S7.3 `HUMAN` | Measure capture spread from per-device fire-time logs over ≥6 sets | Every set’s spread ≤~150 ms (POC order 9–148 ms); server timestamp + offset method evident in logs |
| S7.4 `BROWSER` | Secondary taps Make This Device Primary (a) before capture (b) mid-step | (a) Immediate: TTS moves, announcement on new Primary (b) Button shows “Primary after this step”; swap lands at the step boundary; a capture set is never split across Primaries |
| S7.5 `HUMAN` | Kill a Secondary mid-step (close tab / Wi-Fi off) | Primary **speaks** the offline announcement; tile shows offline; next set excludes it; session continues |
| S7.6 `HUMAN` | Primary leaves during Setup; and mid-session | Setup: earliest remaining device is promoted + announced (C3). Mid-session: promoted Primary continues the script from the step boundary |
| S7.7 `BROWSER` | Camera blocked on one device (deny permission); Primary camera denied | Plain-language blocked state + Enable Camera; Primary-camera-missing blocks Continue with inline reason (no camera-less Primary, §2 ruling); mid-session camera loss treated as offline |
| S7.8 `AUTO` | Try to fabricate WS messages (fake captureAt/verdict/role) from a client | Server ignores/rejects; session state unchanged; only server-originated events move the machine |

## S8 — Voice “Ready” gate (C15/A10) — `HUMAN` at ≤5 ft + `AUTO` matcher

| ID | Script | Pass condition |
|---|---|---|
| S8.1 `AUTO` | Matcher unit/API cases: `ready` · `I’m ready` · `I am ready` · `let us start` · `let’s start` vs `already` · `not ready` · `let us stop` · unrelated speech · silence | All accepted start; all others do not (mirror `POC/g_voice/matcher.py` behaviour) |
| S8.2 `HUMAN` | From Start, say each accepted phrase once per step (≤5 ft, quiet room, 10 trials/phrase across the session) | Counting begins after the phrase on ≥9/10 per phrase (log misses); streaming decision latency (word-end → count start) recorded per trial in the report |
| S8.3 `HUMAN` | Stay silent for a full window; cough/talk unrelated words in another window | At 10 s: recognition demonstrably off (mic indicator/track gone), Primary says “Sorry, I didn’t hear you say Ready. Click Start when you want to start.”, app is on the **Start screen**; no counting occurred |
| S8.4 `BROWSER` | After S8.3, click Start again | Returns to the **same pending step** (completed steps/sets intact), speaks the voice prompt again; the click itself starts no counting |
| S8.5 `HUMAN` | Listen for the prompt timing | Listening window opens only **after** “Say ‘Ready’…” finishes; the app never transcribes/triggers on its own voice (no self-start in 10 quiet sessions) |
| S8.6 `BROWSER` | Deny microphone; force a transcription error (server offline toggle/config) | Same apology → Start-screen path with the mic/API reason shown there; no crash, no stuck Listening state, no per-step tap invented |
| S8.7 `AUTO` | Force streaming failure mid-window | Falls back to the one-shot path (POC behaviour, ~1.5 s tail) with identical phrase decisions; fallback event logged |

## S9 — Framing warning (C5/A9) — `HUMAN`*

| ID | Script | Pass condition |
|---|---|---|
| S9.1 `HUMAN` | Before a step’s counting, stand so a foot/hand is out of one camera | Counting never starts; Framing Warning names that device; Primary speaks “I cannot measure your pose. Please come fully within the {device} camera.” |
| S9.2 `HUMAN` | Step out mid-hold, wait; step back fully in | Capture pauses (held valid dots stay), out-of-frame set is not counted; on ~1 s all-in-view the interrupted capture is re-counted automatically — **no tap, and no “Continue anyway” exists** |
| S9.3 `HUMAN` | Repeat S9.1 ignoring the warning | Warning repeats once after 10 s; still no capture; End session (Primary) is the only exit besides reframing |
| S9.4 `AUTO` | False-pause audit over a normal full session | Zero pauses while fully in frame at normal distance (report any false pause as a defect with device/pose) |

## S10 — Validation, results, history *(scope §§14–15)*

| ID | Script | Pass condition |
|---|---|---|
| S10.1 `HUMAN` | Practise with a deliberately wrong step (e.g. palms by shoulders in Chakrasana Step 2) and a correct step | Results per step: verdict + correction text; wrong step’s annotated image is the **stored character image with red circles/arrows**, readable in the large view (click step → modal, prev/next) |
| S10.2 `AUTO` | Inspect what validation consumed/saved; open annotated file vs stored image | Best-of-3-sets selection logged; user photos existed only in memory (absent from disk/DB/network capture after session); annotation never regenerated the person (same character/pose as stored) |
| S10.3 `BROWSER` | Results spoken + displayed; “no score” audit of Results and History screens | Primary speaks results; no numeric score/grade/percentage appears anywhere (“N of M steps correct” with its no-grade line is the only count allowed) |
| S10.4 `BROWSER` | Practice Again vs picking another asana | Again redoes **all** steps (no single-step redo exists); History calendar marks today, lists both sessions, detail equals Results content |
| S10.5 `AUTO` | Timings from app logs (4-step asana) | Validation ~10 s/step order; Analysing UI progressed per step; total wait matches the spoken progress (no frozen spinner >5 s without stage text) |

## S11 — Security, privacy & direct-access *(design §2, esp. §2.5)*

| ID | Script | Pass condition |
|---|---|---|
| S11.1 `AUTO` | Port-scan the app host from another LAN device; probe DB/Redis/Meta/SMTP ports | Only the single app origin responds; 5432/6379 and worker surfaces are unreachable; `/health` returns booleans only |
| S11.2 `AUTO` | Logged in as normal user: replay requests for admin actions, other users’ objects, job creation with forged type/payload, WS-forged session events | All fail (403/404/rejected) with no effect; server state provably unchanged; key operations audited |
| S11.3 `AUTO` | Inspect browser storage, page source, network payloads, error responses | No Meta key, no SMTP password, no session-token leakage beyond the HttpOnly cookie; errors sanitised |
| S11.4 `AUTO` | CSRF: submit a state-changing request from a different origin with the victim’s cookie | Rejected (SameSite/CSRF token); WS upgrade from a foreign origin rejected |
| S11.5 `AUTO` | Post-session forensic sweep: DB dump, app `data/` tree, server logs | Zero user-photo/audio/transcript bytes anywhere; history = text + annotated images only; AI-call log shows cost/durations only |
| S11.6 `BROWSER` | Upload attacks: oversized PDF, `.exe` renamed `.pdf`, path-traversal filename, huge image | All rejected safely; no file lands outside `data/objects`; parser failure → Failed status, server healthy |
| S11.7 `AUTO` | Rate abuse: scripted OTP requests, creation starts, feedback, voice windows | Throttles engage at configured limits; AI-call cost log caps runaway spend; legitimate user unaffected after window |

## S12 — Layout, readability & regression shell *(design §4; C9–C14)*

| ID | Script | Pass condition |
|---|---|---|
| S12.1 `BROWSER` | Every route at laptop (landscape) + phone (portrait) viewports | **No vertical scroll anywhere** (check `scrollHeight ≤ clientHeight` per route); pagination/fit instead; coaching layout identical between steps |
| S12.2 `BROWSER` | Coaching readability: equal camera/reference halves, count band below stage, step chips, header rules | Matches prototype rules (C9/C11); count/verdict legible in screenshots at reduced size; text only on backed surfaces over imagery |
| S12.3 `BROWSER` | Origin-aware back (C13) from Detail via each library; End session from each entry | Always returns to the originating library/detail context, never a default page |
| S12.4 `BROWSER` | Global states audit: disabled/pending/rejected/blocked/locked screens side by side | Each state visually + verbally distinct (not colour-only); rejected shows admin reason; blocked/locked state recovery truthfully (“none” where scope says none) |
| S12.5 `AUTO` | Full automated suites: domain unit · API · matcher · session-simulator (3 fake devices) | All green in one command from the repo README; session-sim reproduces capture scheduling + role switch + disconnect without hardware |

## Report template (QA subagent returns this)

```markdown
## QA Report — <date> · app <version/commit-n/a> · tester: QA subagent
Overall: PASS / FAIL (n failed, m unverified of <total> cases)
Per section: S0 … S12 — Pass/Fail counts + IDs
Defects: [ID] minimal reproduction → observed vs expected → evidence (log/screenshot/timing)
Timings measured: sync spread …ms (n sets) · voice decision …s (n trials, streaming/one-shot) · validation …s/step
UNVERIFIED (not executed): [IDs + why — e.g. needs owner phone]
Regression note: sections re-run after fixes: …
```

**Done means:** every section Pass with evidence, HUMAN cases executed with the owner’s devices (or explicitly UNVERIFIED and accepted by the owner), and this report attached to the build handoff. Only then does the builder ask the owner to confirm — and only after that confirmation does any Git/GitHub publication step begin.
