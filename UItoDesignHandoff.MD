# UI → Design Handoff (`UItoDesignHandoff.MD`)

> **Purpose:** Hand the completed UI design phase to a **new Muse session** that will run the **Design Phase**.
> **Status:** UI wireframes approved in principle; high-fidelity clickable prototype built and owner-reviewed (see §3). Design Phase has **not** started.
> **This file does not replace the scope.** It sits on top of it. Where this file and [`scope.MD`](scope.MD) disagree, **§2 of this file is the record of what changed and why** — the Design session must reconcile each item explicitly (adopt into a scope revision or revert the UI), never silently pick one.

---

## 1. Read these first (in this order)

| # | File | What it is | Trust level |
|---|---|---|---|
| 1 | [`scope.MD`](scope.MD) | **Frozen product scope** — the contract. Every feature, limit, and flow originates here unless §2 below says otherwise. | Authoritative, except §2 deltas |
| 2 | [`HandOffForUI.md`](HandOffForUI.md) | POC handoff: what was **actually proven** on real hardware/APIs, what failed, and the mandatory traceability check (§5 of that file). | Authoritative for PROVEN/ASSUMED labels |
| 3 | [`uidesign.MD`](uidesign.MD) | UI wireframes for **every screen** (coaching designed first, §3 of that file), design principles P1–P9, assumption register A1–A9 (§10), owner decision list Q1–Q12 (§11). | Approved UI structure |
| 4 | **This file** | UI-phase deltas vs scope (§2), approved prototype & design language (§3), and the exact questions the Design Phase must answer (§5). | Handoff record |
| 5 | [`prototype/index.html`](prototype/index.html) | Runnable, clickable, end-to-end **high-fidelity prototype** (all screens, simulated backends). The visual/UX reference the owner approved. | Look-and-feel authority; **not** production code |
| 6 | [`prototype/coaching-primary.html`](prototype/coaching-primary.html), [`prototype/coaching-variant-b.html`](prototype/coaching-variant-b.html) | Standalone coaching-screen design explorations. `coaching-primary` (equal-split) is the approved direction; variant B ("Ghost Mirror") was explored and **not** chosen. | Reference only |
| 7 | POC code & outputs under [`POC/`](POC/) | Proven implementations and gated sample assets (see `HandOffForUI.md` §6 for the index). The 4-step Chakrasana boy set in `POC/outputs/b/final/` is the approved sample content used throughout the prototype. | Evidence, not architecture |

**Working rules carried over from the POC/UI phases (binding on Design):**

- Every scope requirement is tagged **PROVEN / ASSUMED / TO-PROVE** (`HandOffForUI.md` §5). The Design Phase ends with a **traceability check**: for every row of `uidesign.MD` §10 (A1–A9) and every PROVEN claim it relies on, name the concrete mechanism in `design.MD` — or flag it back. Unproven items must not be designed as if proven.
- **Stored step images are never regenerated during practice** (scope §9). User camera photos are **never stored** (scope §§14–15, 17) — this is a privacy promise shown in the UI, so the design must make it structurally true (in-memory only), not just a policy note.
- English only (scope §3). No passwords (OTP only, scope §5). Admins exist only via a config-file email list; there is **no user management** (scope §5.3).

---

## 2. ⚠ Scope changes & additions made during UI design (NOT in `scope.MD`)

These were added by owner instruction or by UI/UX necessity after `scope.MD` was frozen. **Each row needs a Design-Phase disposition:** (a) accept and write into a scope revision, or (b) revert the UI to scope before designing. None of them may be dropped silently.

### 2.1 Product-behaviour changes

| # | Change | What scope says | What UI/prototype does now | Why / status |
|---|---|---|---|---|
| C1 | **First device to join is AUTO-Primary** | §13.1: user taps "Make this device Primary" on the device they choose; others become Secondary | First joiner becomes Primary automatically (badge "PRIMARY ★ auto"); no tap needed to start | Owner-directed **PROVISIONAL — revert after actual user testing**. POC had shown auto-primary causes confusion (HandOff §4). Highest-risk delta; design must keep the revert path cheap (role assignment must be a server-side decision that can switch between "auto-first" and "first-claim" without protocol change) |
| C2 | **[Make This Device Primary] switch on every Secondary, with mid-capture queuing** | §13.1: tap makes that device Primary, others Secondary (no timing rule) | Switch exists on every Secondary at all times; before capture it swaps immediately, **during a step's capture it queues to the next step boundary** (button reads "Primary after this step") | Owner-directed. The queuing rule is new UX invented in UI design to avoid splitting a capture set across two Primaries — Design must implement role handover at step boundaries only |
| C3 | **Auto-promotion if the Primary leaves pre-session** | Not specified (scope only requires the Primary to *announce* a device going offline, §13.1) | Earliest-joined remaining device is promoted to Primary, announced on all screens | Invented fallback for C1. Owner to confirm at user testing |
| C4 | **Demo Offer → Demo Playback → Ready Gate before any capture** | §13.3 script starts the moment a session begins: "Step N", counts, captures. No demo exists in scope | After selecting an asana, user is asked "Would you like to see a demo first?" Demo plays stored step images one-by-one with spoken explanations (Pause / Hear Again / End Demo, auto-advance after narration). Counting starts **only** when the user taps **[I'm Ready — Start Step 1]** on the Ready Gate | Owner-directed. Solves "user has never seen this pose and is already being counted". Design implications: demo is a distinct synchronised multi-device playback state (TTS + images, **no capture**); Ready Gate is the sole entry to the capture script |
| C5 | **Out-of-frame detection & Framing Warning (pause/resume)** | Not in scope at all. Scope assumes photos can be validated after all steps (§14) | Every camera tile carries "IN VIEW ✓ / NOT FULLY IN VIEW ⚠" (whole body: head, hands, feet + small margin). At any point during capture, if **any one** camera loses full framing: capture **pauses**, Primary speaks *"I cannot measure your pose. Please come fully within the [device] camera."* (repeated after 10 s), offending camera enlarges, valid sets already captured are kept, out-of-frame sets don't count and are discarded, resume is **automatic** after ~1 s fully-in-view in all cameras (re-counts; no tap, no "Continue anyway") | Owner-directed. **ASSUMED / TO-PROVE (A9)** — POC never tested body-framing detection. Design must propose a real detection mechanism (e.g. on-device pose landmarks) that works **without storing photos**, with latency/accuracy evidence, or flag it back |
| C6 | **Explicit "Select Asana" step, with two entry orders** | §13 assumes practice starts from a chosen asana; no selection screen exists | Mandatory selection with Public / Personal / Favourites tabs (search wired). Two orders, fixed after 3 UX-review iterations: **specific asana** (card Practise / detail Start) → Devices → Disclaimer → Demo (never re-asks); **generic Start Practice** → Select → Devices → Disclaimer → Demo. "Pick Another / Choose Different" enters a **reselect mode**: Select → fresh Disclaimer for the new asana → Demo, devices remembered | UX-review-driven. Generic order avoids forcing camera setup + medical disclaimer before the user can browse. Reselect requires a fresh disclaimer because cautions are asana-specific |
| C7 | **Per-asana contraindications shown in the Disclaimer itself** | §13.4 requires displaying a health disclaimer & cautions before a session | Generic disclaimer + a highlighted box with the **selected asana's** contraindications inside the disclaimer screen (and again on Select). Checkbox resets unticked on **every** entry | Safety fix from UX review (iteration 2): previously cautions were only on earlier/later screens, so the acknowledgement could be given without seeing them |
| C8 | **Clickable Results steps → large annotated feedback view** | §14.2: results displayed per step with correction text + annotated character image | Each result step opens a large modal: big feedback image, verdict, correction text, prev/next step navigation. Step 2 uses the real POC annotated asset; Step 4 annotations (red circles/arrows/labels) are **programmatic overlays on the stored character image** — the proven POC-f method, never AI image-editing (which regenerated a different person, HandOff §3) | Owner-directed in prototype review. Design must implement overlay annotation located by the vision model on stored images (scope §14.2) |
| C9 | **Global header on every screen except coaching** | Not specified | Full Muse Yoga header/nav on all screens; branding-only header (app name, no nav) on Login/Register; coaching keeps only its own slim strip ("Muse Yoga" text left, asana name centred, no logo mark) | Owner-directed in prototype review. Validated by screenshot audit of all 17 screens |

### 2.2 Presentation / UX rules that constrain the design

| # | Rule | Consequence for Design |
|---|---|---|
| C10 | **No scroll — anywhere (hard rule, owner-decided)** | Every screen fits one viewport. Libraries/history must **paginate or fit**, never scroll (current prototype: 6 asanas/page, calendar month fits). Front-end layout contracts must be viewport-budgeted per screen; long content (step lists, admin tables) needs a pagination/fit strategy in `design.MD`, not "scroll" |
| C11 | **Coaching layout = equal split, minimal at all times** | Own camera and stored reference at **equal size** side-by-side; secondary feeds are a small strip; count lives in its own full-width band **below** the stage (an overlay count plate was tried and rejected — it covered the reference caption). Layout stays equally minimal between steps. Text-on-video must sit on solid/backed surfaces (pale text over bright reference images was a real readability failure, fixed in v5–v6) |
| C12 | **Three libraries share one card grammar** | Public / Personal / Favourites render asanas with identical card layout (image, title, meta, source/status, View–Practise row). Personal-only actions (Submit/Withdraw/Disable/Re-enable) are additions, not a different layout. Favours a shared front-end card component with state-driven actions |
| C13 | **Origin-aware back navigation everywhere** | Detail remembers which library opened it; practice Back/End return to the detail page if you came from there. Front-end needs an explicit navigation/return stack — not bare links |
| C14 | **Disclaimer/selection state is never silently reused** | Changing asana resets the selection highlight, caution box, Continue gating, and the disclaimer checkbox. Session state machine must model this (see §4.3) |

### 2.3 Explicitly NOT changed (so Design doesn't re-litigate them)

Retry = redo **all** steps (scope §14.3) · no score/grade anywhere (§14.2; the History "steps correct" count with its no-grade disclaimer is wireframe Q9, owner to confirm) · disable-only deletion (§§11–12, 16) · feedback loop is the **only** edit path, max 3, rejected attempts count, whole-asana regeneration on accept (§10) · rejected publication = cannot edit/resubmit (§11.3) · approved personal asana leaves Personal for Public (§11.3) · one asana at a time from Favourites, no auto-play (§12) · device/session limits and OTP lockout numbers (scope §§5, 16, all admin-configurable).

---

## 3. Approved prototype & design language (what "good" looks like)

**Run it:** `python3 -m http.server 5173 --directory .` → `http://localhost:5173/prototype/index.html` (starts at Login; any OTP works; `blocked@example.com` shows the permanent-block state). All 17 screens are clickable end-to-end. Cameras, AI, TTS, and validation are **simulated**; step/reference/character/annotated images are the real POC assets.

**Design tokens the owner approved through iteration (v1→v6 + 3 UX subagent rounds) — carry these into the design system, don't restart visual design:**

- Calm yoga register: pale sage background, white cards, deep sage (`#2F5D43`) as the single action colour, warm clay reserved for "stored/reference" semantics, amber only for warnings/cautions, red only for errors/rejection. No purple/blue gradients, no glow effects.
- Type: `Fraunces` (serif display) for asana names/headings/count numerals, `Outfit` for UI text. Countdown numerals must stay large and distance-legible; body text was darkened after a real contrast failure — keep text on solid or backed surfaces over imagery, never pale text on photos.
- Breathing room over density, but **hard no-scroll budget** (C10): spacing comes from viewport-budgeted flex layouts (tiles shrink, counts scale with `vh`), not from shrinking fonts below legibility or hiding essential text (both were tried and rejected).
- Coaching screen specifics are settled (C11): equal split camera|reference, small secondary strip *inside* the camera half, framing badge per tile, count band below the stage, "Muse Yoga" text top-left, asana name centred in the strip, **no logo mark**.
- The prototype passed: script syntax check, headless-Chrome screenshot audit of every screen (header presence, results large-view annotations, login render), and three independent UX subagent review rounds whose findings were fixed and re-reviewed. Remaining known mock limits are disclosed in-product (non-Chakrasana asanas reuse the Chakrasana sample steps in practice screens).

**Prototype files are throwaway.** The Design Phase should treat `prototype/` as a visual/functional specification to re-implement in the chosen stack — not as code to productionise (it is a single 85 KB HTML file with inline everything, no state persistence, and simulated services).

---

## 4. What the product actually is (one-page mental model for the Design session)

### 4.1 Actors & surfaces

Single web app, mandatory login. Three roles from one login: **regular user**, **admin** (config-file emails, scope §5.3 — same login screen, extra Admin Panel + creation privileges), and within a practice session, **Primary** (speaks, controls) vs **Secondary** (camera-only, muted) devices — up to 3 devices **of the same user** per session (scope §§5.4, 13.1 + C1/C2).

### 4.2 Core flows (screen inventory is `uidesign.MD` §§5–9; states matter more than screens)

1. **Auth:** Register (first/last/email/age/ZIP + email OTP, lifetime-3-code rule) → Login (email OTP; 3 fails = 6 h lock, repeat = permanent block; max 3 logged-in devices). All counters/limits are admin-configurable data, not constants (scope §16).
2. **Libraries:** Public (search with diacritics-tolerant matching, e.g. `Vrikshasana` → `Vṛkṣāsana` — a real POC failure mode, A4), Personal (states: **Active / Disabled / Pending / Rejected / Approved-gone**), Favourites (named lists, mixed sources, no duplicates). Asana detail is read-only; publishing is submit → admin approve/reject-with-reason.
3. **Creation (identical pipeline, role-gated):** name + character → reference-book & duplicate checks (admins exempt from reference check) → AI step generation (~6 s, PROVEN) → per-step image generation with character-reference `images/edits` + automated vision gate + regeneration, 11–35 s/image, 1–2 min/asana (PROVEN timings; gate criteria in `HandOffForUI.md` §3) → review → optional feedback loop (3 checks: intent → reference-exists → alignment; max 3 attempts; whole-asana regeneration on accept; PROVEN chain) → save (admin→Public, user→Personal). **Never** text-only image prompts or text-overlay step titles on images (POC failures, HandOff §3).
4. **Practice:** entry orders in C6 → device setup (auto-Primary C1, switch C2, Enable Camera explicit) → disclaimer with per-asana cautions (C7) → [select if generic] → demo offer/playback (C4) → ready gate → coaching capture loop (3 synchronised capture sets/step, 3 s apart, fires on "3", POC-PROVEN sync at 9–148 ms via server timestamps + per-device clock offset) with framing pause/resume (C5) → analysing → per-step results with overlay annotations (C8) → history (text + annotated character images only). Primary-only TTS throughout (provider undecided, A2).
5. **Admin:** publication approvals, public enable/disable, character folder/image uploads, reference PDF uploads with Processing/Ready/Failed (large-book parsing is a background/batch job, scope §8, A6), limits & settings.

### 4.3 Session state machine the design must model (from the wireframes, incl. C-deltas)

`SETUP (roles auto-assigned, switchable) → DISCLAIMER (per-asana cautions, fresh checkbox) → [SELECT — generic/reselect only] → DEMO_OFFER → DEMO_PLAYING (pausable, no capture) → READY → CAPTURING (per step: INTRO → FRAMING_CHECK → COUNT×3 sets, FW pause/resume can interrupt any capture state, role switch queues to step boundary) → ANALYZING → RESULTS`, with explicit transitions for: device disconnect (announced, excluded from next set), camera blocked, Primary loss (promotion C3), End session (photos discarded), Practice Again (→ READY, same asana), Pick Another (→ SELECT in reselect mode → DISCLAIMER). Design must state where this machine lives (server vs Primary-device authority) — POC used a stateless WebSocket relay + server timestamps; whether that survives is a Design decision (§5).

### 4.4 Data the scope already implies (starting point, not the design)

Users & login-attempt/device counters · OTP requests per email (lifetime) · asanas (metadata, benefits, contraindications, per-step text+duration, stored step images, character ref, origin: public/admin/user, publication state + rejection reason, disabled flag, feedback count) · characters & folders · reference books (parsed asanas per book, parse status) · favourites lists (ordered membership) · practice history (per-session: asana, timestamps, per-step verdict + correction text + annotated character image — **never user photos**) · admin limits/settings · admin email list (config file, not DB-managed). File storage must cover: character images, generated step images (original + annotated variants), uploaded PDFs. Generated step images are write-once/read-forever.

---
## 5. What the Design Phase must decide (output: `design.MD`)

Answer each as a decision with rationale and a PROVEN/ASSUMED/TO-PROVE status — not as options left open. Owner's stated focus areas are §5.1–§5.7.

### 5.1 Technology choices
Frontend framework & language · backend language/framework · sync transport (WebSocket/WebRTC/signalling) · TTS provider (browser vs cloud — A2) · AI providers (text generation, image `images/edits`, vision validation/gate/feedback — POC used `muse-image-1.0` + `muse-wonder-1.0`; confirm production equivalents, auth, rate limits, cost per asana at 11–35 s/image) · pose/framing detection library for C5 (on-device vs server) · PDF parsing pipeline (large books are a batch job — POC-c) · email/OTP delivery service. Every choice must name how its POC-proven behaviour (§4.2 timings, sync spread) is preserved.

### 5.2 Security
OTP generation/storage/expiry & resend (A5 — scope fixes attempt/lock rules, not code expiry), brute-force & enumeration resistance, session tokens & the 3-device login limit enforcement, permanent-block storage, admin identity via config file (format, hot-reload, audit), authorisation on **every** API (owner-only personal asanas, admin-only approvals/uploads/limits), same-user enforcement for multi-device practice sessions (join code A3 + account binding), upload security (PDF/image type & size validation, malware scanning, path traversal), camera/microphone permission model (HTTPS requirement — POC needed LAN IP + `chrome://flags` insecure-origin workaround; design the real deployment answer), **structural guarantee that user photos are never persisted** (in-memory capture → validation → discard; prove no disk/log/analytics leakage), secrets management, HTTPS everywhere, dependency & audit logging (esp. admin approve/reject and limit changes). State the threat model briefly.

### 5.3 Project folder structure
Propose the monorepo/repo layout: front-end app, business-logic layer, backend services, shared types/contracts, POC-asset migration, prototype archival, test layout, config (incl. admin-email file), and local-dev topology that reproduces the POC's proven LAN multi-device test (phone + 2 laptops) without the `portproxy`/flags hacks.

### 5.4 Front end
Routing + **origin-aware navigation stack** (C13) · shared asana-card component (C12) · viewport-budgeted no-scroll layout system (C10) with pagination components for libraries/history/admin · coaching screen implementation (equal split C11, per-tile framing badge, count band, demo playback synchronisation A8, framing pause/resume UI) · camera capture (`getUserMedia`, explicit Enable Camera, blocked states) · **other-device live video: WebRTC (A1) or last-capture thumbnail fallback** — decide and, if fallback, hand the wireframe change back · TTS playback + Primary-only routing incl. mid-session role handover · state management for the session machine (§4.3) and for creation-wizard long waits (1–2 min generation with per-step progress, failure/retry, background continuation) · diacritics-tolerant search UX (A4) · accessibility & distance-readability (count size, contrast on backed surfaces) · error/empty/limit states exactly as wireframed in `uidesign.MD` §§4–5.

### 5.5 Business-logic layer
Where each scope rule lives as testable logic, independent of transport: OTP/lockout/device counters · publication state machine (Active/Disabled/Pending/Rejected/Approved with the scope §11.3 transition guards) · creation pipeline orchestration (checks → steps → gated image generation with max attempts & negative prompts → feedback loop intent/reference/alignment checks, whole-asana regeneration, feedback counting) · practice session orchestration (role assignment **auto-first vs claim** switchable per C1, step-boundary handover C2, capture scheduling — server timestamp + clock-offset sync as proven, best-set selection, out-of-frame discard/retake C5) · validation orchestration (per-step vision calls, overlay annotation coordinate contract) · history recording (text + annotated images only) · limits/settings application. Define the layer's API surface toward front end and backend services.

### 5.6 Backend services
Service boundaries (auth/OTP, users & devices, asana CRUD & publishing, creation/AI orchestration, reference-book ingestion, practice-session relay/signalling, validation, history, admin, file storage) — monolith vs services with rationale at this scale · API contracts (incl. real-time message protocol for session sync, demo sync, framing events, role switch/promotion) · background jobs (PDF parsing, image generation/gating, validation) with status polling/streaming to the waiting UIs · rate limiting & cost controls on AI calls · observability.

### 5.7 Database & file storage structure
Schema for §4.4 entities with the state machines encoded (constraints, not just app checks) · counters that must be atomic (OTP attempts, feedback count, login devices) · image storage layout (characters / step originals / annotated variants / uploads: naming, immutability of stored step images, serving + cache headers — coaching re-reads them every session) · PDF storage & parsed-output storage · migrations · backup · what is deliberately **not** stored (user photos) and how schema proves it.

### 5.8 Traceability & proof obligations (exit criteria for Design)
`design.MD` is done only when it contains: (1) a disposition for every C1–C14 row (accept → scope revision text, or revert → wireframe change); (2) a mechanism for every A1–A9 assumption in `uidesign.MD` §10 (A1 WebRTC, A2 TTS, A3 join/roles, A4 search, A5 OTP expiry, A6 PDF batch, A7 production vision gate, A8 demo sync, A9 framing detection) or an explicit flag-back; (3) confirmation that every PROVEN POC behaviour relied on (sync capture, gated generation, feedback chain, ~timings) has a production mechanism; (4) answers to still-open owner questions in `uidesign.MD` §11 (Q1–Q12 — several were defaulted in the prototype, incl. Q9 history wording, Q10 always-show-select as modified by C6, Q11 auto-Primary provisional, Q12 framing wording/intervals) — confirm or record the prototype default as decided.

---

## 6. Session starter (for the new Muse session)

Read §1's files in order. Then, before writing `design.MD`: (1) restate the C1–C14 dispositions you intend, (2) list any scope/UI contradictions you find beyond §2, (3) propose the §5.1 stack in one paragraph with the POC-preservation argument. Do not start implementation. Do not redesign the UI — visual questions go back to `uidesign.MD`/prototype, product questions go back to scope/owner. The prototype at `prototype/index.html` is your click-through reference; run it before designing the front end.

*— End of UI → Design handoff. UI Phase closed pending Design-Phase dispositions in §2/§5.8. —*
