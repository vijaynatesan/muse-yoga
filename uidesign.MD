# Yoga Asana Learning App — UI Design (`uidesign.MD`)

> **Status: DRAFT — WIREFRAMES ONLY — awaiting owner approval**
> **Phase:** UI Design Phase, Step 1 of 2 (wireframes → approval gate → high-fidelity prototype)
> **Governing scope:** [`scope.MD`](scope.MD) · **POC handoff:** [`HandOffForUI.md`](HandOffForUI.md)
> **Rule for this document:** No colours, typography, branding, or pixel styling are decided here. Boxes = layout and content only. Do NOT build a high-fidelity prototype from this file until the owner approves it in §11.

---

## 0. How to read this document

### 0.1 Wireframe notation

```
┌──────────────────────────────┐
│ [Button label]   Plain text  │   ← box = region / panel
│ ┌──────────┐  ┌──────────┐   │
│ │  Image   │  │  Video   │   │   ← nested box = media / card
│ └──────────┘  └──────────┘   │
│ > = tap target   ● = live    │
└──────────────────────────────┘
```

- `[Label]` = button / link. `>` prefix = primary action on that screen.
- `▾` = dropdown / filter. `(•) / ( )` = selected / unselected option.
- `▒` = live camera video. `▨` = stored character reference image (never regenerated in practice).
- All wireframes show English only, per scope §3.

### 0.2 Evidence labels (required by `HandOffForUI.md` §5)

Every non-trivial element is tagged:

| Tag | Meaning |
|---|---|
| **PROVEN** | Demonstrated working in POC on real hardware / real API |
| **ASSUMED** | Not yet built; wireframe assumes it. `design.MD` must prove it |
| **TO-PROVE** | Explicitly deferred to `design.MD` traceability check |

Summary up front — the three assumptions that matter most:

1. **Other-device LIVE video** (WebRTC streaming) — **ASSUMED / TO-PROVE**. POC proved synchronised still capture + thumbnails (9–148 ms spread), not live streams. Scope §13.2 requires live feeds, so wireframes show them, flagged everywhere.
2. **TTS voice/provider** — **ASSUMED**. POC used browser `speechSynthesis`. Final choice is a `design.MD` decision (§19). No voice, speed, or provider is hard-coded in these wireframes.
3. **Asana generation waiting time (1–2 min)** — **PROVEN** that one `muse-image-1.0` image takes 11–35 s. The waiting UI in §6.5 is designed around that fact, not around an ideal.

### 0.3 What approval means

Approving this document approves: screen list, layout, content order, Primary/Secondary split, and state coverage. It does **not** approve visual style. After approval, the next step is a linked, runnable high-fidelity mock (HandOff §1 step 2) — not `design.MD` and not production code.

---

## 1. Design principles (apply to every screen)

These are derived from the scope + POC, not decoration choices.

| # | Principle | Why (scope / POC source) |
|---|---|---|
| P1 | **Voice-first, no-touch during practice.** Once a session starts, the user is on a mat, metres from the screen. Nothing essential may require a tap mid-step. | Scope §13.3 script is fully spoken; HandOff §6 |
| P2 | **Readable at 2–3 m.** Current step, countdown number, and correct/incorrect result must be legible at arm's-length-plus. Body text can be smaller. | HandOff §6 design questions |
| P3 | **Primary speaks, Secondary is silent and near-empty.** Secondary = camera only. Its screen shows almost nothing to tap (exceptions: [Enable Camera], [Make This Device Primary] switch, §3.9). | Scope §13.1; POC multi-device |
| P4 | **Honest waiting.** Any AI call >~5 s shows what is happening and roughly how long, with a failure/retry path. Never a bare spinner. | POC: 11–35 s/image, ~6 s text, ~10 s/step validation |
| P5 | **Privacy promise is visible, not buried.** "Your photos are never stored" appears at capture, results, and history — where the user would worry. | Scope §§2, 14, 17 |
| P6 | **States are unmistakable.** Disabled / pending / rejected / blocked / locked each look and read differently. No state is conveyed by colour alone. | Scope §§5, 11.3; HandOff §5 |
| P7 | **No manual editing affordance anywhere.** There is no edit pencil on steps or metadata. The only change path is the feedback loop (§6.6). | Scope §§9–10 |
| P8 | **Enable Camera is explicit.** Browsers silently block cameras; every camera screen has an [Enable Camera] button + plain-language status line. | POC LAN/camera gotchas, HandOff §4 |
| P9 | **No scroll — anywhere (hard rule).** Every screen fits one viewport; future list screens (libraries, history) must paginate or fit, never scroll. Coaching keeps the same minimal layout between steps as in pose. In pose, the glance budget is: own body + target shape (equal halves), giant count, in-frame status, current step, one short instruction line. Secondary cameras are validation angles (small strip), not user reading matter. Shrinking/hiding essentials to force a fit (prototype v2) is a design failure, not a solution. | Owner, prototype review (v3–v4) |

---

## 2. Information architecture & navigation

### 2.1 Site map

```
Logged out
├── Login (email + OTP) ............................. §5.1
└── Register (details + email OTP) ................ §5.2

Logged in (all users) — top nav always visible
├── Public Library ................................ §5.3
│   └── Asana Detail .............................. §5.5
├── Personal Library .............................. §5.4
│   └── Asana Detail (owner variant) .............. §5.5
├── Favourites (named lists) ...................... §5.7
├── Create Asana † ................................ §6 (full flow)
├── Practice History (calendar) ................... §8
└── Practice Session .............................. §3 (full chain)
        Device Setup (1st = AUTO-Primary) → Disclaimer →
        Select Asana → Demo Offer / Ready → Coaching
        (Select Asana §3.4: Public / Personal / Favourites tabs;
         asana may be pre-selected from Detail/Favourites, §5)
                └── Results (per step) ............ §7

Admin only (same login; email in config file, scope §5.3)
└── Admin Panel ................................... §9
    ├── Publication submissions (approve/reject)
    ├── Public asanas (enable/disable)
    ├── Characters (upload folder / images)
    ├── Reference PDFs (upload + Processing/Ready/Failed)
    └── Limits & settings
```

> **† Create Asana — shared entry, role-gated inside (callout here, detail in §6).** One nav item and one flow for everyone; do not split it into two menu items. The steps are the same, but the experience differs by role in three places, all specified in §6: (1) **reference check** — a regular user is blocked if the asana is not found in a reference book; an admin sees a non-blocking note and may continue (§6.2); (2) **destination on Accept** — admin creations go directly to Public Library, regular-user creations go to Personal Library (§6.7); (3) **feedback loop** — admins are exempt from the reference-existence and alignment checks for asanas they created outside the reference books, while the intent check applies to everyone (§6.6). Flagging it here so the site map does not imply an identical experience; the blocking messages and wireframes stay in §6 only, to avoid duplication.

### 2.2 Global chrome (logged-in shell)

```
┌────────────────────────────────────────────────────────────────┐
│ LOGO  Public | Personal | Favourites | History | Create      │
│                                      [user first name] [Logout]│
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                        PAGE CONTENT                            │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ Your camera photos are never stored.  ·  English only          │
└────────────────────────────────────────────────────────────────┘
       Admins additionally see:  | Admin Panel |
```

- Login is mandatory for everything (scope §5.2). There is no public browsing state. **PROVEN** as a rule; shell layout is new.
- Footer privacy line is persistent, not a one-time notice (P5).
- No "Admin: manage users" item exists — admins cannot create/promote/delete users (scope §5.3).

---

## 3. ★ COACHING SCREEN — designed first, in most detail

> Scope: §13 (devices, screen contents, per-step script, disclaimer). POC: `POC/e_primary_session/index.html` (single-device) + `POC/multi_device/` (3-device sync, owner's real hardware).
> **Read §3 fully before §5–§9.** All other screens exist to get the user *to* this screen and to show what came *after* it.

### 3.1 Session lifecycle (what the UI must walk through)

```
 ENTRY (any of):
  • Asana Detail [Start Practice] (§5.5) ─┐
  • Personal Library [Practise] (§5.4)    ├─ asana PRE-SELECTED (§3.4)
  • Favourites [Practise] (§5.7) ─────────┘
  • Generic [Start Practice] ─────────────── no asana yet
                        │
                        ▼
 Device Setup (§3.2) ─► Disclaimer (§3.3) ─► SELECT ASANA (§3.4) ─┐
   1st device =         [I understand]       Public | Personal |  │
   AUTO-Primary                              Favourites tabs      │
                                                                  ▼
 DEMO OFFER (§3.5) ── Yes ─► DEMO PLAYBACK (§3.5) ─► READY GATE (§3.5)
      │ Skip ───────────────────────────────────────►│ [I'm Ready]
      │         (no counting/capture in Demo/Ready)  │
      └──────────────────────────────────────────────┘
                                                                  ▼
 Results (§7) ◄── "Analyzing,   COACHING LOOP per step (§3.6–3.10)
      │            please wait"        │
      │                                │  for each step:
 [Practice Again] ─► Ready Gate ────────┘   speak "Step N" + instruction
   (§3.5, same asana)                       "Get ready — 1, 2, 3" → capture ×3
 [Pick Another Asana] ─► Disclaimer       "Move to the next step"
   (§3.3, new asana) ─► Select (§3.4) ─► Demo Offer (§3.5)
```

> **Selection is a mandatory step, not an assumption.** The old diagram jumped from an already-chosen asana straight into coaching, so a generic [Start Practice] had nowhere to pick one. §3.4 sits **after the Disclaimer and before the Demo Offer (§3.5)**, with Public / Personal / Favourites as its three sources. Arriving from Asana Detail, Personal Library, or Favourites pre-selects that asana in §3.4 (the user confirms or switches); arriving generically, nothing is pre-selected. See §11 Q10.
>
> **Counting never starts on selection.** After §3.4 the user is offered a Demo (§3.5): step images played one by one with spoken explanation, no capture. Skipping the Demo (or finishing it) lands on a Ready Gate; the capture script (§3.10) starts only when the user taps [I'm Ready] there. Owner-directed — see §3.5.

Rules baked into every coaching wireframe below:

- Stored step images are always shown; they are **never regenerated** during practice (scope §9, §13.2).
- Capture = **3 synchronised sets per step, 3 s apart**, announced before *every* capture, capture fires on "3" (scope §13.3). One set = one photo per connected device.
- Validation runs **only after all steps**, reported per step, **no score/grade** (scope §14).
- Retry = **redo all steps from the beginning**. There is no single-step redo (scope §14.3).
- User photos live in memory only and are **never stored** (scope §§14–15).

### 3.2 Pre-session A — Device setup (first device is AUTO-Primary) ⚠ PROVISIONAL

Shown on *each* device after any Practice entry (§3.1), **before** the Disclaimer and asana selection — so at this point the asana may not be chosen yet. The header therefore names the session, not an asana (the Chakrasana line below is the pre-selected example; the generic entry reads `Asana: to be selected after the disclaimer (§3.4)`).

**Owner decision (2026-10-30, provisional — revert after actual user testing): the first device to join is automatically the Primary; every later device is automatically a Secondary — but every Secondary carries a [Make This Device Primary] switch button, so the user can still move Primaryship to any device they prefer (see Switch Rule below).** This partly overrides the POC lesson (first-joiner auto-primary caused confusion and was removed in favour of an explicit tap, HandOff §4 / POC `multi_device`) — auto-assignment remains the flagged risk, while the switch button restores the scope §13.1 behaviour (user taps "Make this device Primary" on the device they choose; all others become Secondary). If user testing shows the POC confusion returning, revert the *auto* part only (explicit tap to claim Primary, as in the previous revision) and keep the switch button. [Continue →] goes to the Disclaimer (§3.3), not to coaching.

```
┌────────────────────────────────────────────────────────────────┐
│  Chakrasana  ·  4 steps  ·  Advanced  ·  Back and Spine        │
│  Session code:  4 8 2 1        (other devices join with this)  │
├────────────────────────────────────────────────────────────────┤
│  CONNECTED DEVICES  (max 3)                          ● LIVE    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. This device — Laptop-Chrome          [camera: off]    │  │
│  │    Role: PRIMARY ★ (auto — first device to join)         │  │
│  │    Sound/TTS will come from this device.                 │  │
│  │    [Enable Camera]  Camera: not started yet              │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ 2. iPhone-Safari                        [camera: on ●]   │  │
│  │    Role: Secondary (camera only, no sound)               │  │
│  │    [Make This Device Primary]  ← on EVERY Secondary;     │  │
│  │      tapping moves sound/TTS here, old Primary becomes   │  │
│  │      Secondary. View from that device shows this button; │  │
│  │      this list view shows it on each Secondary row.      │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ 3. — waiting for a device to join —                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ℹ You can practise with this device alone. Add up to 2 more  │
│    devices for other angles. Every device must be logged in   │
│    as you.                                                    │
│                                                                │
│  [Leave session]                    [Continue →]  (disabled    │
│                                       until Primary camera on) │
└────────────────────────────────────────────────────────────────┘
```

Element notes:

| Element | Behaviour | Evidence |
|---|---|---|
| Session code / join | Other devices of the *same user* join this session. Exact join mechanism (code vs. account push) is not decided here. | Sync itself **PROVEN** (POC WebSocket); join UX **ASSUMED** |
| Role assignment (AUTO + switch) | First device to join = Primary (badge `PRIMARY ★ auto — first device`); every later device = Secondary (`camera only, no sound`). **Every Secondary shows [Make This Device Primary]** (on its own screen, and on each Secondary row of this list). Tapping it makes that device Primary immediately (pre-capture), moves TTS/sound there, demotes the old Primary to Secondary, and every screen + the new Primary announces `“[Device] is now the Primary.”` If the Primary leaves before [Continue] with no switch, the earliest-joined remaining device is promoted and announced (invented fallback — **owner to confirm at testing**, §11). | Auto part owner-directed **PROVISIONAL**, contradicts POC; switch button scope §13.1, POC pattern **PROVEN** |
| Switch during capture | The button stays visible on every Secondary (§3.9), but mid-capture a tap does **not** swap instantly: it shows `Will become Primary after this step` and the swap (new Primary speaks the next step, §3.10 S4) takes effect at the next step boundary — never inside a countdown or capture set. Switch during Demo/Ready (§3.5) is immediate. | New UX (protects §3.10 script) |
| Device list + roles | Name, camera on/off, auto-assigned role. Updates in real time as devices join/leave. Join order is shown (`1st / 2nd / 3rd`) so "why is that one Primary?" is answerable at a glance. | List **PROVEN** (POC); join-order display new |
| [Enable Camera] + status line | Explicit button; status reads `not started / on / blocked — check browser permission`. Never auto-starts silently. | **PROVEN** pattern (POC gotcha, P8) |
| [Continue →] disabled state | Disabled until the (auto) Primary's camera is on. Reason shown inline (`Enable the camera on the Primary device to continue`), not only on tap. Secondary cameras may still be off — those devices are treated as offline for capture (§3.11b). | New UX |
| Primary-alone allowed | One device is a valid session (it is trivially the auto-Primary). Copy states this so users do not think 3 devices are required. | Scope §13.1 |

**Disconnect during setup:** a device that drops is struck through with `— offline` and the Primary speaks the offline announcement (see §3.11). **PROVEN** (announcement); auto-Primary promotion on Primary loss is the new rule in the table above.

### 3.3 Pre-session B — Health disclaimer gate (mandatory, scope §13.4)

Cannot be skipped, remembered-away, or pre-ticked. Shown after device setup (§3.2) and **before asana selection (§3.4)** and before the first camera frame of the session. Because selection has not happened yet, this screen carries the *generic* disclaimer only; the chosen asana's own contraindications are shown on the selection screen (§3.4) before the user proceeds to the Demo Offer (§3.5) — still before coaching begins, as scope §13.4 requires.

```
┌────────────────────────────────────────────────────────────────┐
│  ⚠  Before you begin — please read                             │
├────────────────────────────────────────────────────────────────┤
│  • Consult a doctor before practising if you have any        │
│    medical condition, injury, or are pregnant.                 │
│  • On the next screen, check the contraindications of the     │
│    asana you choose — do not practise it if any apply to you.  │
│    (Per-asana list is shown in §3.4, before you begin.)        │
│  • Stop immediately if you feel pain, dizziness, or strain.   │
│  • This app gives pose guidance only. It is not medical       │
│    advice.                                                    │
│                                                                │
│  Your camera photos are used only to check your pose and      │
│  are never stored.                                            │
│                                                                │
│  [ ]  I have read this and wish to continue   ← unticked       │
│                                                                │
│  [Go back]                  [Continue to Select Asana →]       │
│                               (disabled until box is ticked)   │
└────────────────────────────────────────────────────────────────┘
```

- This screen does not end in [Begin Step 1] — no asana has been chosen yet, and even after selection the Demo Offer (§3.5) intervenes before any counting. Per-asana contraindications live in §3.4, where the choice is made; they come from the asana's stored contraindications (AI-generated at creation, scope §6). **PROVEN** the data exists (`POC/outputs/a/chakrasana.json`).
- POC single-device page already implements this checkbox-gate pattern. **PROVEN**.

### 3.4 Pre-session C — Select Asana (Public / Personal / Favourites) ★ NEW

Mandatory step **after the Disclaimer (§3.3) and before the Demo Offer (§3.5)**. The user picks exactly one asana here; practice is one asana at a time, with no auto-play of a list (scope §12). Selecting an asana never starts counting or capture — §3.5 intervenes.

```
┌────────────────────────────────────────────────────────────────┐
│  SELECT AN ASANA TO PRACTISE                                   │
│  Devices ready: Primary (this) + 1 Secondary   [Change §3.2]   │
│  ┌──────────────┬────────────────┬───────────────────────────┐ │
│  │ PUBLIC       │ PERSONAL       │ FAVOURITES                │ │
│  │ LIBRARY (•)  │ LIBRARY ( )    │ List: [Morning ▾] ( )     │ │
│  └──────────────┴────────────────┴───────────────────────────┘ │
│  [Search name___]  Difficulty ▾ Body part ▾ Category ▾         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ▨ Chakrasana · Advanced · Backbend · 4 steps             │  │
│  │   Submitted by Priya                                     │  │
│  │ ▨ Tāḍāsana · Beginner · Standing · 3 steps               │  │
│  │ ▨ Vṛkṣāsana · Beginner · Balance · 2 steps               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ── on selecting a row, before Begin ──                        │
│  SELECTED: Chakrasana (from Public Library)                    │
│  ⚠ DO NOT PRACTISE IF YOU HAVE: Back or neck injury; wrist     │
│    injury; blood-pressure / heart conditions; pregnancy.       │
│    (per-asana contraindications, scope §§6, 13.4 — §3.3 defers  │
│     to here; [Continue] stays disabled until a selection)      │
│  [Back to Disclaimer]              > [Continue →]              │
└────────────────────────────────────────────────────────────────┘
```

Rules:

| Rule | Detail | Source |
|---|---|---|
| Three sources, one pick | Tabs reuse the §5.3/§5.4/§5.7 data (search + difficulty/body-part/category filters on Public & Personal; list picker first on Favourites). No fourth source exists. | Scope §§11–12 |
| Pre-selected arrival | From Asana Detail (§5.5), Personal [Practise] (§5.4), or Favourites [Practise] (§5.7): that tab opens with that asana selected and its contraindications shown. The user confirms with [Continue →] or switches — this screen is **always shown**, never auto-skipped (§11 Q10). | §3.1 |
| Generic arrival | Generic [Start Practice]: no tab or asana pre-chosen. [Continue] disabled until a pick. | §3.1 |
| Not selectable | Disabled asanas never appear (Personal disabled cannot be practised, scope §11.2; disabled hidden from Favourites, scope §12; disabled Public hidden, scope §11.1). Pending Personal asanas **are** selectable (scope §11.3). | Scope §§11–12 |
| Contraindications gate | The selected asana's full contraindication list appears on this screen before [Continue] — this is where scope §13.4's per-asana caution is discharged now that selection follows the generic disclaimer. | Scope §13.4 |
| After Continue | [Continue →] broadcasts the selection to all connected devices (Secondaries show the same asana) and opens the **Demo Offer (§3.5)**. It never starts the capture script. Sync **PROVEN** (POC); selection broadcast is part of A3 (§10). | POC / §10 |

### 3.5 Pre-session D — Demo Offer, Demo Playback & Ready Gate ★ NEW (owner-directed)

Selection (§3.4) must **not** drop the user straight into counting. The user may have never seen this asana performed. This section asks first, demonstrates if wanted, and only starts the timed capture when the user explicitly says they are ready to perform.

**(a) Demo Offer** — shown immediately after §3.4 [Continue →], on the Primary in full; Secondaries show `Demo choice on the Primary…` with the selected asana name.

```
┌────────────────────────────────────────────────────────────────┐
│  CHAKRASANA — 4 steps · Advanced                               │
│  Would you like to see a demo first?                           │
│                                                                │
│  The demo plays each step image one by one while the Primary   │
│  reads the explanation aloud. No photos are taken in demo.     │
│                                                                │
│  > [Yes — Show Demo]                                           │
│    [Skip Demo — I'm ready to practise]                         │
│                                                                │
│  [Back to Select Asana (§3.4)]                                 │
└────────────────────────────────────────────────────────────────┘
```

**(b) Demo Playback** — only if [Yes]. Stored step images, one by one, in order. The user is *watching/standing*, not holding a pose, so ordinary tap controls are allowed here (unlike the Coaching Loop, §3.6).

```
┌────────────────────────────────────────────────────────────────┐
│  DEMO — Chakrasana · STEP 2 OF 4          (no photos taken)    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │          ▨ STORED STEP IMAGE — Step 2 (large)            │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Step 2: "Bend your elbows and place your palms flat beside    │
│           your ears, fingers pointing toward your shoulders."  │
│           ▲ this text is READ ALOUD on the Primary (TTS)       │
│  Steps:  ✓1   ●2   3   4        Narration: playing…            │
│  [Pause]  [Hear This Step Again]  [End Demo → Ready]           │
└────────────────────────────────────────────────────────────────┘
```

- Auto-advance: when a step's narration finishes, hold the image briefly (~2 s), then play the next step. After the final step: `Demo complete.` → Ready Gate (c) automatically, with [Watch Demo Again] offered there.
- Images are the **stored** step images (never regenerated, scope §9); narration is the **stored step instruction text** (`stepN.txt` / POC-a JSON) read by the Primary only — Secondaries display the same image + text muted. TTS provider is **ASSUMED** (A2, §10); image sync is **PROVEN** (POC) as a sync mechanism, demo sequencing itself is new UX.
- No camera tiles during Demo: its purpose is to watch. Cameras stay enabled (set up in §3.2) but capture **nothing** until the Ready Gate is passed. The `no photos taken` label is persistent through (a)–(c) (P5).

**(c) Ready Gate** — reached by [Skip Demo], [End Demo → Ready], demo completion, or [Practice Again] from Results (§7). This is the only door into the capture script.

```
┌────────────────────────────────────────────────────────────────┐
│  READY TO PRACTISE — Chakrasana                                │
│  Devices: Primary ★ (auto) + 1 Secondary · cameras ready       │
│  ▨ Step 1 image (preview)                                      │
│  When you tap Start, the Primary will say "Step 1", read the   │
│  instruction, then count "Get ready — 1, 2, 3" and take photos.│
│  Get into the starting position shown above before you tap.    │
│                                                                │
│  > [I'm Ready — Start Step 1]                                  │
│    [Watch Demo] / [Watch Demo Again]  (if not just watched)    │
│    [Choose a Different Asana (§3.4)]                           │
│  Your camera photos will be checked and never stored.          │
└────────────────────────────────────────────────────────────────┘
```

- Counting, capture, and validation expectations start **only** on [I'm Ready — Start Step 1]. Nothing in §§3.4–3.5 counts, times out, or photographs the user.
- During actual performance the step instructions are spoken **again** step-by-step by the Coaching Loop (§3.10 S1) even if the Demo was watched — the Demo never replaces the per-step coaching.

### 3.6 Coaching canvas — Primary device, laptop landscape, 3 devices connected

This is the reference layout. Everything else (§§3.7–3.9) is a reduction of it.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Chakrasana · STEP 2 OF 4                    ● Primary · sound ON       │
│ ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │
│ │                             │  │  REFERENCE — Step 2 (stored) ▨   │  │
│ │      YOUR CAMERA (▒ live)   │  │ ┌──────────────────────────────┐ │  │
│ │      This device — Primary  │  │ │                              │ │  │
│ │                             │  │ │   character image, step 2    │ │  │
│ │                             │  │ │                              │ │  │
│ │                             │  │ └──────────────────────────────┘ │  │
│ └─────────────────────────────┘  └──────────────────────────────────┘  │
│ ┌──────────────┐ ┌──────────────┐  STEP 2 INSTRUCTION (also spoken):   │
│ │ ▒ iPhone     │ │ ▒ Laptop-2   │  "Bend your elbows and place your  │  │
│ │  Secondary   │ │  Secondary   │   palms flat beside your ears…"    │  │
│ │  ● live      │ │  ● live      │                                    │
│ └──────────────┘ └──────────────┘  Duration for this step: 15 s        │
├────────────────────────────────────────────────────────────────────────┤
│ STEPS:  ✓1   ●2 CURRENT   3   4        Capture: ● ○ ○  (set 1 of 3)  │
│ ┌──────────────────────────────────────────────────────────────────┐   │
│ │  GET READY …  2                                                  │   │
│ │  (counts 1 → 2 → 3 aloud, 1 s apart; photo fires on "3")         │   │
│ └──────────────────────────────────────────────────────────────────┘   │
│ [End session]   (the only button; nothing else needs a tap)            │
└────────────────────────────────────────────────────────────────────────┘
```

Layout rationale (P1, P2):

- **Own camera and reference image are the two largest tiles, side by side** — "am I shaped like the picture?" is the only question the user has mid-pose. Reference is labelled `stored` so it is never mistaken for a live or regenerated image.
- **Other-device live feeds are small thumbnails**, labelled by device + `● live`. In POC these were captured stills; live streaming is **ASSUMED (WebRTC) / TO-PROVE** in `design.MD`. If `design.MD` cannot support live feeds, this region falls back to "last captured thumbnail per device" — flagged here, not silently dropped (HandOff §1).
- **Step strip is a single row** (`✓ done · ● current · upcoming numbers`) — highlights current step per scope §13.2, readable at distance, and leaves vertical room for video. Full step *text* lives in the instruction panel, not the strip.
- **Countdown is the biggest type on screen** (see §3.10). During a hold, this number and the capture dots are what the user actually looks at.
- **Every camera tile carries a framing badge** — `IN VIEW ✓` when the user's whole body is inside that camera, `NOT FULLY IN VIEW ⚠` (plus device name) when any body part is cut off at a frame edge. The badge is checked continuously during capture; losing full framing in **any one** camera triggers the Framing Warning state (§3.10 FW / §3.11d), which pauses capture. Detection itself is **ASSUMED / TO-PROVE** (A9) — POC never tested body-framing detection.
- **[End session] is the only active control on the Primary.** No pause, no skip-step, no retake button — none exist in the scope. Adding one here would invent behaviour; if the owner wants pause, it must be added to the scope first. (Secondaries additionally carry [Make This Device Primary], §3.9.)

### 3.7 Coaching canvas — Primary, 2 devices and 1 device (layout switch)

Same screen, fewer tiles. No separate "mode" — the grid collapses.

**2 devices (Primary + 1 Secondary):**

```
┌────────────────────────────────────────────────────────────────┐
│ Chakrasana · STEP 2 OF 4               ● Primary · sound ON    │
│ ┌──────────────────────┐  ┌─────────────────────────────────┐  │
│ │  YOUR CAMERA ▒       │  │  REFERENCE — Step 2 (stored) ▨  │  │
│ │  (Primary)           │  │                                 │  │
│ └──────────────────────┘  └─────────────────────────────────┘  │
│ ┌──────────────────────┐   Step 2: "Bend your elbows…"  (spoken)│
│ │ ▒ iPhone · Secondary │   Capture: ● ○ ○                       │
│ └──────────────────────┘                                        │
│ STEPS: ✓1  ●2  3  4          GET READY … 2                     │
│ [End session]                                                  │
└────────────────────────────────────────────────────────────────┘
```

**1 device (Primary alone):**

```
┌────────────────────────────────────────────────────────────────┐
│ Chakrasana · STEP 2 OF 4               ● Primary · sound ON    │
│ ┌──────────────────────┐  ┌─────────────────────────────────┐  │
│ │                      │  │  REFERENCE — Step 2 (stored) ▨  │  │
│ │   YOUR CAMERA ▒      │  │                                 │  │
│ │   (only device)      │  │                                 │  │
│ │                      │  │                                 │  │
│ └──────────────────────┘  └─────────────────────────────────┘  │
│ Step 2: "Bend your elbows and place your palms flat beside    │
│          your ears, fingers pointing toward your shoulders."  │
│ STEPS: ✓1  ●2  3  4        Capture: ● ○ ○    GET READY … 2    │
│ [End session]                                                  │
└────────────────────────────────────────────────────────────────┘
```

- With 1 device the other-feeds region disappears entirely (no empty boxes, no "device 2 missing" warning — 1 device is complete, scope §13.1).
- Tile sizes stay large; freed space goes to camera + reference, not to extra text.

### 3.8 Coaching canvas — Primary, mobile portrait

The hard case: a phone propped at a distance, portrait, user on a mat. Stacked, countdown-first.

```
┌──────────────────────────────┐
│ Chakrasana · STEP 2 / 4      │
│ ● Primary · sound ON         │
├──────────────────────────────┤
│ REFERENCE — Step 2 (stored)▨ │
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │    character image       │ │
│ │                          │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ YOUR CAMERA ▒ (Primary)      │
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │         ▒ live           │ │
│ │                          │ │
│ └──────────────────────────┘ │
│ ┌──────────┐ ┌──────────┐    │
│ │▒ iPhone ●│ │▒ Lap-2 ● │    │  ← other feeds: small strip,
│ └──────────┘ └──────────┘    │    hidden entirely if 1 device
├──────────────────────────────┤
│  GET READY …                 │
│        ┌───┐                 │
│        │ 2 │   ← largest     │
│        └───┘     element     │
│  Capture:  ● ○ ○  (1 of 3)   │
│  Steps: ✓1 ●2 3 4            │
├──────────────────────────────┤
│ Step 2: "Bend your elbows…"  │
│ (truncated; full text is     │
│  spoken, scrollable if idle) │
│ [End session]                │
└──────────────────────────────┘
```

- Order top→bottom: reference → own camera → others → countdown. On a small screen the user glances for (a) target pose, (b) themselves, (c) the number. Instruction text is last because it is *heard*, not read (P1).
- Nothing on this screen requires scrolling during a step. Instruction text may overflow only in the idle/between-steps moment.

### 3.9 Coaching canvas — Secondary device (laptop & mobile)

Deliberately near-empty. Camera-only, no audio — except two controls: [Enable Camera] and [Make This Device Primary] (owner-directed switch, §3.2). No other control may disturb the session (scope §13.1; POC-proven).

```
        LAPTOP (landscape)                          MOBILE (portrait)
┌──────────────────────────────────┐      ┌────────────────────────┐
│ Chakrasana · STEP 2 OF 4         │      │ STEP 2 / 4             │
│ Secondary — camera only          │      │ Secondary · silent     │
│ (sound comes from Primary)       │      ├────────────────────────┤
├──────────────────────────────────┤      │ YOUR CAMERA ▒          │
│ ┌──────────────────────────────┐ │      │ ┌────────────────────┐ │
│ │                              │ │      │ │       ▒ live       │ │
│ │      YOUR CAMERA ▒ live      │ │      │ └────────────────────┘ │
│ │      (this device)           │ │      │ REFERENCE (stored) ▨   │
│ │                              │ │      │ ┌────────────────────┐ │
│ └──────────────────────────────┘ │      │ │  character image   │ │
│ REFERENCE Step 2 (stored) ▨      │      │ └────────────────────┘ │
│ ┌────────────┐ Steps: ✓1 ●2 3 4  │      │ Steps: ✓1 ●2 3 4       │
│ │ char. img  │ Capture: ● ○ ○    │      │ Capture: ● ○ ○         │
│ └────────────┘                   │      │ Counting on Primary…   │
│ Listening to Primary for counts… │      └────────────────────────┘
│ [Enable Camera] if not yet on    │      Mobile: same two buttons
│ [Make This Device Primary]       │      stacked under the camera
│  (mid-step tap = after this step)│
└──────────────────────────────────┘
```

Secondary rules:

- **Switch button (owner-directed).** Every Secondary shows **[Make This Device Primary]**. Before capture (setup §3.2, Demo/Ready §3.5) the swap is immediate: this device takes over TTS, the old Primary becomes Secondary, and the new Primary announces it. **During a step's capture, the tap is queued** — the button relabels `Will become Primary after this step ✓` and the swap happens at the step boundary (§3.10 S4), so a countdown/capture set is never split across two Primaries. The auto-Primary default itself remains provisional (§3.2).
- No countdown number of its own: the count is *heard* from the Primary. The screen shows `Capture: ● ○ ○` dots and a framing indicator (`IN VIEW ✓ / NOT FULLY IN VIEW ⚠`, §3.10 FW) so a user glancing at a Secondary still knows where they are. Capture flash (§3.10) fires on all devices simultaneously so the user knows the photo happened.
- What a Secondary user can tap: **[Enable Camera]**, **[Make This Device Primary]**, and [Leave session] (small, corner). Everything else is display.
- Other-device live feeds on Secondary: scope §13.2 says *every* device displays all feeds. On mobile Secondary they are omitted above for size — **owner decision needed** (§11, Q3): full parity (all feeds, smaller tiles) vs. camera + reference only. POC showed still thumbnails on each device; live parity is **ASSUMED / TO-PROVE**.

### 3.10 The per-step script as screen states (scope §13.3, POC-proven sequence)

Entered **only** from the Ready Gate [I'm Ready — Start Step 1] (§3.5c) — never directly from selection or demo. The coaching canvas (§§3.6–3.9) does not change layout between these states — only the status band / countdown region changes. This is deliberate: layout shift while holding a pose is disorienting.

| # | State (per step) | Primary speaks | Screen shows | Capture |
|---|---|---|---|---|
| S1 | Step intro | "Step N" + full instruction | Reference swaps to step N; step strip highlights N; instruction text updates | — |
| S1b | **Framing check** (before first countdown of the step, and continuously through S2–S3) | — unless FW fires | Every camera tile shows `IN VIEW ✓ / NOT FULLY IN VIEW ⚠` (§3.6). First countdown starts only when **all** cameras are in view. | No capture until all-in-view |
| S2 | Get ready | "Get ready — 1 … 2 … 3" (1 s gaps) | Giant `1` → `2` → `3`; dots show `○ ○ ○` | Photo fires **on "3"** — brief white flash frame + `●` fills on **all** devices |
| S3 | Hold (×2 gaps) | (silence) before next "Get ready" | "Hold… 3 s" + dots `● ○ ○` then `● ● ○` | 3 sets total, 3 s apart, announcement before **every** capture |
| **FW** | **FRAMING WARNING — can fire at any point in S1b–S3** (owner-directed) | **"I cannot measure your pose. Please come fully within the [iPhone / device-name] camera."** Repeated once after 10 s if still out of frame. | Capture **pauses**: countdown/counts stop, banner §3.11d on all screens, offending tile highlighted, its Secondary shows `Please move so your whole body is in this camera`. Already-captured **valid** sets for this step are kept (dots stay filled); a set taken while out of frame **does not count** and is discarded (photos are never stored anyway). | **None while active** |
| FW→resume | User is fully in frame again in **all** cameras (held ~1 s) | "You are in view now. Get ready — 1 … 2 … 3" (re-counts the interrupted capture) | Banner clears automatically — **no tap required** (user is on the mat, P1). Script resumes at the same step, next unfilled capture dot. No step is skipped, no set is short-counted. | Interrupted set retaken |
| S4 | Step transition | "Move to the next step" (spoken by the **new** Primary if a switch was queued, §3.9) | Strip advances; brief (1 s) "Next: Step N+1" band | — |
| S5 | After final step | "Analyzing, please wait." | Full-screen analysing overlay (§3.11c); no controls | Validation running (~10 s/step, POC) |
| S6 | Done | Results spoken (see §7) | Navigates to Results | — |

Timing source: POC `e_primary_session/index.html` implements exactly this sequence. **PROVEN** (single device) and synchronised across 3 devices (POC `multi_device`, 12–148 ms spread). **PROVEN**. The FW/S1b rows are **new and ASSUMED**: POC captured photos without checking whether the body was fully framed, so body-framing detection (A9) must be proven in `design.MD`. "Fully within camera" is defined for the wireframe as: head, both hands, and both feet inside the frame with a small margin — the pose the reference image shows must not be cropped at any edge. There is deliberately **no [Continue Anyway]**: a pose that cannot be measured cannot be validated (scope §14), so the only exits from FW are re-framing (auto-resume) or [End session] on the Primary.

### 3.11 Coaching overlays & failure states

**(a) Device disconnected mid-session** (scope §13.1 — Primary must announce it):

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠  A device has gone offline: iPhone-Safari                    │
│    Continuing with 2 devices. The session is not interrupted. │
│    (Primary also speaks this aloud)              [Dismiss]     │
└────────────────────────────────────────────────────────────────┘
      … banner over the coaching canvas; canvas keeps running …
```
The disconnected device's tile is replaced by `— offline —` and excluded from the next capture set. **PROVEN** (POC broadcast + spoken announcement).

**(b) Camera blocked / not enabled** (any device):

```
┌────────────────────────────────────────────────────────────────┐
│  Camera is off for this device.                                │
│  Status: blocked — check the browser's camera permission,      │
│          then tap Enable Camera.                               │
│  [Enable Camera]     [Continue without this camera]*           │
│  *Only the Primary may choose this, and only before Step 1.    │
│   Mid-session, a camera-less device cannot capture and is      │
│   treated as offline (§3.11a).                                  │
└────────────────────────────────────────────────────────────────┘
```
**PROVEN** pattern (POC). The `*` rule is new UX — **owner to confirm** (§11, Q4).

**(c) Analysing overlay** (after final step, scope §13.3 step 7):

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│              Analyzing, please wait…                           │
│                                                                │
│   Checking Step 1 … Step 2 … Step 3 … Step 4                   │
│   (progress per step; ~10 seconds per step)                    │
│                                                                │
│   Your photos are being checked now and will not be stored.    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```
No cancel button: cancelling would discard un-stored photos and force a full redo — the wireframe makes that a deliberate owner decision, not an accident (§11, Q5). Progress is per-step because POC validation is ~10 s/step. **PROVEN** timing; overlay is new UX.

**(d) Framing Warning** (any point during capture, §3.10 FW — owner-directed):

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠  I CANNOT MEASURE YOUR POSE                                  │
│    You are not fully in the iPhone camera.                     │
│    Please move so your whole body is within that camera,       │
│    then hold the pose — counting will restart by itself.       │
│    (Primary speaks this aloud; capture is PAUSED ●○○ held)     │
│                                   [End session] (Primary only) │
└────────────────────────────────────────────────────────────────┘
      … banner over the coaching canvas; offending camera tile
        highlighted on every screen; offending Secondary shows:
        "Please move so your whole body is in THIS camera." …
```

No [Dismiss] and no [Continue Anyway] — the warning clears itself only when all cameras report `IN VIEW ✓` for ~1 s (§3.10 FW→resume). New UX; detection **ASSUMED** (A9).

### 3.12 Coaching screen — element inventory (for `design.MD` traceability)

| Element | Scope | Evidence | `design.MD` must prove |
|---|---|---|---|
| Own live camera tile | §13.2 | **PROVEN** (POC) | Camera capture via HTTPS/localhost |
| Other-device **live** feeds | §13.2 | **ASSUMED** | WebRTC streaming, 3-device bandwidth |
| Other-device last-capture thumbnails (fallback) | §13.2 | **PROVEN** (POC) | — (fallback only) |
| Stored reference image per step | §13.2 | **PROVEN** | Stored-image serving, never regenerated |
| Step strip + current highlight | §13.2 | **PROVEN** (POC) | Real-time state sync to all devices |
| Instruction text + duration/step | §§6, 13.3 | **PROVEN** (data from POC-a) | TTS text source |
| Countdown 1-2-3 + capture flash + dots | §13.3 | **PROVEN** | Synchronised capture scheduling (POC: server timestamp + clock-offset) |
| TTS: "Step N", instruction, counts, transitions, results | §§13–14 | **ASSUMED** (browser TTS in POC) | Final TTS choice, Primary-only routing |
| Disconnect banner + spoken alert | §13.1 | **PROVEN** | Presence/heartbeat mechanism |
| [End session] (only mid-session control) | — (UX) | New | Session teardown; un-stored photos discarded |
| AUTO-Primary assignment (1st joiner) + promotion | §13.1 deviation | Owner-directed **PROVISIONAL**, contradicts POC | Join-order authority; promotion if Primary leaves; revert path to explicit tap (§3.2) |
| [Make This Device Primary] switch (every Secondary; queued mid-capture) | Scope §13.1 | Switch pattern **PROVEN** (POC); queuing new | Role-swap protocol; TTS handover at step boundary only (§3.9–3.10) |
| Demo Offer / Playback / Ready Gate; no capture before [I'm Ready] | — (owner-directed) | New UX; images/TTS data **PROVEN** | Demo sequencing sync (A8); guarantee no capture/count state before Ready (§3.5) |
| Framing badge + Framing Warning pause/resume (FW) | — (owner-directed) | **ASSUMED** — not in POC | Real-time fully-in-frame detection per camera (A9); discard-and-retake of out-of-frame sets |

---

## 4. Cross-cutting patterns (used by §§5–9)

### 4.1 Waiting / progress (P4) — three tiers

| Tier | When | Pattern |
|---|---|---|
| Inline | <5 s (search, filters, OTP send) | Button shows `Working…`, disabled; page does not navigate |
| Panel | 5–60 s (one image, one validation step) | Named stage + elapsed time: `Generating Step 2 image… (18 s)` |
| Full screen | >60 s (full asana generation, multi-step validation) | Stage checklist + honest estimate + [Run in background / stay here] where scope allows |

Generation can hit `content_policy_violation` (400) or 500 on legitimate prompts (HandOff §2). Every waiting panel therefore has a failure twin: `This step failed to generate. [Retry] — no images have been saved yet.` **PROVEN** failure mode; retry UX is new.

### 4.2 Empty states (never a blank page)

Each list screen names *why* it is empty and the one action that fixes it, e.g. Personal Library empty → `You have not created any asanas yet. [Create Asana]`. Disabled-asana-hidden cases (§5.4) state that items are hidden, not deleted.

### 4.3 Errors & limits

Limit-related blocks (OTP exhausted, device limit, feedback limit) are **full messages with the exact consequence and whether recovery exists** — never a terse `Error`. Copy drafts are in §§5–6; owner to approve tone in §11.

---

---

## 5. Account, libraries & asana detail

### 5.1 Login (email + OTP only, scope §5.2)

```
┌────────────────────────────────────────────┐
│  Yoga Asana Learning                       │
│  Sign in with your email. No password.     │
├────────────────────────────────────────────┤
│  Email  [________________________]         │
│  > [Send OTP]                              │
│                                            │
│  ── after send ──                          │
│  Enter the 6-digit code sent to you:       │
│  [ _ _ _ _ _ _ ]   [Verify & Sign In]      │
│  Attempts left: 3   [Resend OTP]           │
│                                            │
│  New here? [Create an account]             │
└────────────────────────────────────────────┘
```

Mandatory variant states (each replaces the form area; P6):

| State | Message (draft copy) | Recovery |
|---|---|---|
| Wrong OTP, attempts remain | `That code is incorrect. You have N attempts left before a 6-hour lock.` | Retry |
| Locked (3 fails, 1st time) | `Too many incorrect codes. Your account is locked for 6 hours.` + lock expiry time | Wait; no bypass |
| Permanently blocked (3 fails, 2nd time) | `This account has been permanently blocked after repeated incorrect codes. There is no recovery process.` | None — stated plainly |
| 4th device login refused | `You are already signed in on 3 devices. Sign out on one device, then try again.` (scope §5.4) | Logout elsewhere |
| OTP expired / resend | Expiry & resend behaviour is a `design.MD` decision (§19) — wireframe shows `[Resend OTP]` without promising a timer | **TO-PROVE** |

Admins use this identical screen; admin rights come from the config-file email list (scope §5.3). There is no separate admin login. **PROVEN** as rule.

### 5.2 Registration (scope §5.1)

```
┌────────────────────────────────────────────┐
│  Create your account                       │
│  First name [__________] Last [__________] │
│  Email      [________________________]     │
│  Age        [____]   ZIP code [________]   │
│  > [Send OTP to verify email]              │
│  ┌──────────────────────────────────────┐  │
│  │ ⚠ You can request at most 3 OTPs for │  │
│  │ this email, ever. If all 3 are used  │  │
│  │ without completing registration, the │  │
│  │ email is permanently blocked.        │  │
│  └──────────────────────────────────────┘  │
│  ── after send: OTP entry as in §5.1 ──    │
│  OTP requests used for this email: 1 of 3  │
└────────────────────────────────────────────┘
```

- The lifetime-3 warning sits **next to the button it constrains**, before the first request — not in terms text afterwards. Exhausted-email state: full-page block message mirroring §5.1 permanent-block copy. **PROVEN** rule (scope §5.1).

### 5.3 Public Library (scope §11.1)

```
┌────────────────────────────────────────────────────────────────┐
│ PUBLIC LIBRARY                       [Search asana name___]    │
│ Filters: Difficulty ▾  Body part ▾  Category ▾   [Clear]       │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│ │  ▨ step img  │ │  ▨ step img  │ │  ▨ step img  │             │
│ │ Chakrasana   │ │ Tāḍāsana     │ │ Vṛkṣāsana    │             │
│ │ Advanced ·   │ │ Beginner ·   │ │ Beginner ·   │             │
│ │ Backbend     │ │ Standing     │ │ Balance      │             │
│ │ [View] [♥]   │ │ [View] [♥]   │ │ [View] [♥]   │             │
│ └──────────────┘ └──────────────┘ └──────────────┘             │
│  "Submitted by Priya" shown under user-contributed asanas.     │
│  Disabled asanas do not appear here at all (admin view: §9).   │
└────────────────────────────────────────────────────────────────┘
```

- Search + filter by difficulty / body part / category (AI-generated metadata, scope §6). Card image = step-1 stored image. `[♥]` opens the favourites-list picker (§5.7).
- Diacritics note: reference names carry diacritics (Tāḍāsana) and transliteration variants break exact search (HandOff §5) — search must be forgiving. Matching algorithm is **TO-PROVE** in `design.MD`; wireframe only requires that `Vrikshasana` finds `Vṛkṣāsana`. **Owner to confirm expectation** (§11, Q6).

### 5.4 Personal Library (scope §11.2) — owner-only, five unmistakable states

```
┌────────────────────────────────────────────────────────────────┐
│ MY ASANAS (Personal Library)                [Create Asana →]   │
├────────────────────────────────────────────────────────────────┤
│ ● ACTIVE — Chakrasana (4 steps)                                │
│   [View] [Practise] [Submit for Publication] [Disable]         │
│ ○ DISABLED (hidden from Favourites & practice) — Bhujangasana  │
│   [View] [Re-enable]        ← reversible; nothing is deleted   │
│ ◐ PENDING APPROVAL — Tāḍāsana                                  │
│   [View] [Practise] [Disable] [Withdraw Submission]            │
│ ✕ REJECTED — Vṛkṣāsana                                         │
│   Reason from admin: "…" (always visible, §6.7)                │
│   This asana cannot be edited or resubmitted.                  │
│   [View] [Disable]  → to retry: disable it, create anew        │
└────────────────────────────────────────────────────────────────┘
```

- `[Practise]` does not jump straight to coaching: it enters the §3 chain with this asana **pre-selected in §3.4** (Device Setup §3.2 → Disclaimer §3.3 → confirm in §3.4 → Demo/Ready §3.5 → Coaching §3.6). Disabled rows have no `[Practise]` (cannot be practised, scope §11.2) and never appear in §3.4.
- No delete button exists anywhere; disable is reversible (scope §11.2). No "copy from Public" action (scope §11.2). Pending asanas can still be practised/disabled/withdrawn (scope §11.3). Approved asanas **leave this list** (they move to Public, §5.3) — the empty slot is explained, not silent.
- **PROVEN** rules; list layout is new.

### 5.5 Asana Detail (shared; owner/admin extras noted)

```
┌────────────────────────────────────────────────────────────────┐
│ Chakrasana  ·  Advanced  ·  Back and Spine  ·  Backbend        │
│ Character: Boy (default)        [♥ Add to Favourites]          │
│ Submitted by Priya · Public Library                            │
├────────────────────────────────────────────────────────────────┤
│ BENEFITS: Strengthens arms, wrists, legs and spine…            │
│ ⚠ CAUTIONS / CONTRAINDICATIONS: Back or neck injury; wrist     │
│   injury; blood-pressure / heart conditions; pregnancy.        │
│ STEPS (stored images — same images shown in coaching):         │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                        │
│ │ ▨ 1   │ │ ▨ 2   │ │ ▨ 3   │ │ ▨ 4   │                        │
│ └───────┘ └───────┘ └───────┘ └───────┘                        │
│ Step 1 (20 s): Lie on your back with knees bent…               │
│ Step 2 (15 s): Bend your elbows and place palms beside ears…   │
│ … (read-only — no edit control exists, P7)                     │
│                                                                │
│ [Give Feedback / Request Correction →] (§6.6, if eligible)     │
│ > [Start Practice →]  (§3 chain: §3.2 → §3.3 → §3.4 pre-      │
│    selected → §3.5 Demo/Ready → §3.6 coaching)                 │
└────────────────────────────────────────────────────────────────┘
```

- Metadata, benefits, contraindications, duration/step are AI-generated and read-only (scope §6). Sample content above is the POC Chakrasana set (`POC/outputs/a/chakrasana.json`, boy final images `POC/outputs/b/final/`). **PROVEN** data shape.
- Feedback eligibility: hidden/disabled with explanation when the 3-feedback limit is spent, when rejected (no edit/resubmit, scope §11.3), or after approval (creator loses edit rights). The button explains *why* it is unavailable instead of vanishing — **owner to confirm** (§11, Q7).

### 5.6 Publishing actions (scope §11.3)

- From Personal Library: `[Submit for Publication]` → confirm panel (`Once approved, this asana moves to the Public Library, leaves your Personal Library, and you can no longer change it.`) → state becomes PENDING.
- `[Withdraw Submission]` returns it to ACTIVE with no penalty. Admin approve/reject is §9. Rejection reason is mandatory and surfaces in §§5.4–5.5.

### 5.7 Favourites (scope §12)

```
┌────────────────────────────────────────────────────────────────┐
│ FAVOURITES                                  [+ New List]       │
│ Lists: [Morning ▾]  (3 lists)    [Rename] [Delete List]        │
├────────────────────────────────────────────────────────────────┤
│ ☑ Chakrasana (Public)      [Practise →] [Remove]               │
│ ☑ Tāḍāsana (Personal)      [Practise →] [Remove]               │
│ (disabled asanas are hidden here automatically)                │
│ Add: pick asana ▾ [Add]   — same asana twice in a list: blocked │
│ Practising = one asana at a time. No auto-play of the list.    │
└────────────────────────────────────────────────────────────────┘
```

**PROVEN** rules (scope §12): multiple named lists, mixed Public+Personal, no duplicates, rename/delete list (never deletes asanas), one-at-a-time practice. `[Practise →]` enters the §3 chain with that asana **pre-selected in §3.4** (via its list); it never auto-plays the rest of the list.

---

## 6. Asana creation flow (scope §§9–10) — same steps, gated differently by role (see §2.1 †)

```
[Enter name + pick character] → [Reference & duplicate checks]
   → [Generating steps…] → [Review steps] → [Generating images…]
   → [Review asana] ⇄ [Feedback loop §6.6, max 3] → [Accept]
   → Admin → Public Library · User → Personal Library
```

### 6.1 Name + character

```
┌────────────────────────────────────────────────────────────────┐
│ CREATE ASANA                                                   │
│ Asana name [________________________]                          │
│ Choose your character (default characters shown first):        │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                    │
│ │ ▨ Boy  │ │ ▨ Girl │ │ ▨ …  │ │ ▨ …  │  (•) selected       │
│ │default │ │default │ │      │ │      │                        │
│ └────────┘ └────────┘ └────────┘ └────────┘                    │
│ The same character appears in every step image.                │
│ > [Check & Generate Steps]                                     │
└────────────────────────────────────────────────────────────────┘
```

Assets: `characters/default/character_for_yoga_pose_boy.png`, `…_girl.png` shown first (scope §7). Users cannot pick step count, edit text, or regenerate outside the feedback loop (scope §9). **PROVEN** rule + assets.

### 6.2 Pre-generation checks — blocking states (scope §9 steps 2–3)

| Check | Who | Blocking message (draft) |
|---|---|---|
| Not in any reference book | Normal user | `“X” was not found in the reference books, so it cannot be created. Only asanas from reference books can be created.` — creation stops |
| Not in any reference book | Admin | Non-blocking note: `Not found in reference books. As an admin you may continue.` (admins exempt) |
| Name already in Public Library | Everyone (for Personal creation) | `An asana named “X” already exists in the Public Library. A personal copy cannot be created.` |

Reference-matching caveat (HandOff §5): full Chakrasana is **not** in the Govt book (only Ardha Cakrāsana), so name lookup needs the forgiving search of §5.3. Lookup quality is **TO-PROVE**.

### 6.3 Generating steps (~6 s, POC-a)

Panel-tier waiting (§4.1): `Generating step-by-step instructions…` then the review below. Returned metadata (difficulty, body part, category, benefits, contraindications, duration/step) is displayed read-only. **PROVEN** (~6 s, valid JSON).

### 6.4 Review steps (before any image is generated)

```
┌────────────────────────────────────────────────────────────────┐
│ CHAKRASANA — REVIEW STEPS (read-only)                          │
│ Difficulty: Advanced · Body part: Back and Spine · Backbend    │
│ Step 1 (20 s): Lie on your back with knees bent…               │
│ Step 2 (15 s): Bend your elbows, palms flat beside ears…      │
│ Step 3 (15 s): Press into feet, lift hips into Bridge…         │
│ Step 4 (30 s): Straighten arms and legs into Wheel Pose…      │
│ Benefits: …   ⚠ Contraindications: …                           │
│ Nothing here can be typed over. To change it, use Feedback     │
│ after images are generated (§6.6).                             │
│ [Back]                        > [Generate Images →]            │
└────────────────────────────────────────────────────────────────┘
```
**Owner decision** (§11, Q8): does step review happen before image generation (as drawn), or only after? Scope §9 order (steps shown → images generated) supports as-drawn.

### 6.5 Generating images — the honest 1–2 minute wait (POC-b)

```
┌────────────────────────────────────────────────────────────────┐
│ GENERATING IMAGES — Chakrasana (character: Boy)                │
│ One image per step, checked automatically after generation.    │
│ This usually takes 1–2 minutes. Please keep this tab open.     │
│  ✓ Step 1 image — generated & passed character/anatomy check  │
│  ● Step 2 image — generating… (22 s)                           │
│  ○ Step 3 image — waiting                                      │
│  ○ Step 4 image — waiting                                      │
│  If a check fails, that step regenerates automatically         │
│  (max 3 attempts). You will review everything before saving.   │
│                                            [Cancel creation]   │
└────────────────────────────────────────────────────────────────┘
```

Why this shape (HandOff §3 — must shape the UI): generation is `images/edits` with the character image as reference only (never text-only fallback), with a character-lock + anatomy prompt, then an **automated vision gate** (same character? 1 head / 2 arms / 2 legs? pose matches?) with regeneration on failure. Round-1 POC images had wrong characters and 3 legs — the checklist above surfaces that gate instead of pretending generation is one step. Per-image 11–35 s is **PROVEN**; gate/regeneration flow is **PROVEN** in POC (`POC/outputs/b/final/` is the gated, approved set). Failure twin per §4.1.

### 6.6 Feedback / correction loop (scope §10) — the only edit path

```
┌────────────────────────────────────────────────────────────────┐
│ REQUEST A CORRECTION — Chakrasana                              │
│ Feedbacks used: 1 of 3  ·  Remaining: 2 (rejected ones count)  │
│ Describe only corrections to the pose/instructions, one per    │
│ line:                                                          │
│ [____________________________________________________________] │
│ [____________________________________________________________] │
│ Every line is checked: (1) it must be a pose correction,       │
│ (2) the asana must be in a reference book*, (3) the change     │
│ must match the reference book. *Admins exempt from (2)–(3)     │
│ for asanas they created outside the books; (1) applies to all. │
│ Each submission is standalone — previous feedback is not sent. │
│ If accepted, ALL steps and images are regenerated and the old  │
│ version is replaced (no old version is kept).                  │
│ > [Submit Feedback]                                            │
│ ── result appears here ──                                      │
│ ✕ Rejected: "Line 2 asks about pricing, not a pose correction."│
│   (reason is given by the model; this used 1 of your 3)        │
│ ✓ Accepted: steps & images regenerated — review below.        │
└────────────────────────────────────────────────────────────────┘
```

**PROVEN** chain (POC-d: intent → reference → alignment via `muse-wonder-1.0`), including model-given rejection reasons. Remaining-count display is required by HandOff §2. Limit default 3, admin-configurable (scope §15/§16).

### 6.7 Accept & outcome

`[Accept & Save]` → admin: Public Library; user: Personal Library (ACTIVE). From then on, stored step images are **never regenerated** in practice (scope §9). Rejected-publication asanas (§5.4) show their admin rejection reason here too, with the cannot-edit/cannot-resubmit notice.

---

## 7. Results screen (scope §14) — spoken on Primary + displayed

```
┌────────────────────────────────────────────────────────────────┐
│ CHAKRASANA — YOUR RESULTS        (also read aloud on Primary)  │
│ No score is given. Each step is correct or needs correction.   │
├────────────────────────────────────────────────────────────────┤
│ ✓ STEP 1 — Correct.                                            │
│ ┌──────────┐  (stored character image, no markings needed)     │
│ │  ▨       │                                                   │
│ └──────────┘                                                   │
│ ✕ STEP 2 — Needs correction.                                   │
│ ┌──────────┐  Correction: "Your palms were beside your         │
│ │  ▨ + ◯→  │  shoulders instead of beside your ears, and       │
│ │ red marks│  elbows pointed outward."                        │
│ └──────────┘  (red circles/arrows drawn ON the character       │
│                image — never on your photo)                    │
│ … Steps 3–4 in the same pattern …                              │
│ Your camera photos were not stored. Only the text above and    │
│ the marked character images are saved to your Practice History.│
│ > [Practice Again — redo all steps]  [Pick Another Asana]      │
│ [View in Practice History]                                     │
└────────────────────────────────────────────────────────────────┘
```

- Per step: correct/incorrect + correction text + annotated character image. Annotation = programmatic red-circle overlay located by the vision model on the **stored character image** (POC-f: AI image-edit annotation regenerated a different person once and was abandoned; local overlay proven, `POC/outputs/f/final_annotated_boy_step1.png`). **PROVEN** judgement (~10 s/step); annotation method **PROVEN** as overlay.
- Validation used the single best of the 3 synchronised sets per step (all angles in that set); other sets discarded; user photos never stored (scope §14.1). "Practice Again" redoes **all** steps (scope §14.3) — the button label says so.
- Exit paths (see §3.1): `[Practice Again]` returns to the **Ready Gate (§3.5c)** with the same asana and devices — no re-selection, no new disclaimer, no forced Demo (but [Watch Demo Again] is available there) — and counting restarts only on [I'm Ready]. `[Pick Another Asana]` starts a **new session**: Disclaimer (§3.3) → Select Asana (§3.4, including the new asana's contraindications) → Demo Offer (§3.5) → Coaching (§3.6); connected devices and the auto-Primary role are retained and shown in §3.4, with [Change §3.2] if the user wants to alter them. Retention is an **ASSUMED** convenience — flagged as Q10's companion in §11.

---

## 8. Practice History (scope §15) — calendar first

```
┌────────────────────────────────────────────────────────────────┐
│ PRACTICE HISTORY            ◀  October 2026  ▶   [This month] │
│  Mo  Tu  We  Th  Fr  Sa  Su                                    │
│        1   2   3   4   5   6   ←  • under a date = practised   │
│   7   8  •9  10  11  12  13                                    │
│  14  15  16 •17  18  19  20     (current month shown first)    │
├────────────────────────────────────────────────────────────────┤
│ 17 OCTOBER — 2 sessions                                        │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ 07:30  Chakrasana — 3 of 4 steps correct*  [View Detail]   │ │
│ │ 18:05  Tāḍāsana — 2 of 2 steps correct*   [View Detail]    │ │
│ └────────────────────────────────────────────────────────────┘ │
│  *Summary counts steps only. No score/grade is ever shown.     │
└────────────────────────────────────────────────────────────────┘
```

Session detail (on select): asana, date/time, per-step correct/incorrect, correction text, annotated character image per step — i.e. the §7 content, re-read from storage. Only text + annotated character images are stored; **no user photo ever appears here** (scope §15.1, P5). **PROVEN** storage rule; calendar UX is new.

*Wording check (§11, Q9): is "3 of 4 steps correct" acceptable as a factual summary, or does it read as a forbidden score/grade (scope §4)? Alternative: list step verdicts without a count. Owner to decide; wireframe defaults to the count with the disclaimer line.*

---

## 9. Admin Panel (scope §16) — admins only (config-file emails)

```
┌────────────────────────────────────────────────────────────────┐
│ ADMIN PANEL                                                    │
│ [Submissions] [Public Asanas] [Characters] [Reference PDFs]    │
│ [Limits & Settings]                                            │
├────────────────────────────────────────────────────────────────┤
│ SUBMISSIONS (pending publication)                              │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Tāḍāsana — submitted by Priya  [Review]                    │ │
│ │ > [Approve → moves to Public]                              │ │
│ │   [Reject] Reason (required): [______________________]     │ │
│ └────────────────────────────────────────────────────────────┘ │
│ PUBLIC ASANAS: [name] Enabled ● [Disable]  (no delete exists)  │
│ CHARACTERS: folders ▾  [Upload Folder] [Add Images to Folder]  │
│ REFERENCE PDFS:                                                │
│   Common Yoga Protocol 2018 ………… Ready ●                     │
│   New upload …………………………… Processing ◌                    │
│   Broken file …………………………… Failed ✕ [View reason]           │
│   [Upload PDF] (parsing runs in background; check back here)   │
│ LIMITS: Feedbacks/asana [3] · Reg OTP/email [3] · Login fails  │
│   [3] → lock [6 h] · Max devices [3]      [Save Limits]        │
│   Changing a limit changes app behaviour; defaults apply       │
│   until changed. Admin emails live in the config file —        │
│   they are NOT managed here. No user management exists.        │
└────────────────────────────────────────────────────────────────┘
```

**PROVEN** inputs: PDF `Processing/Ready/Failed` status (POC-c; large books parse as a background/batch job, scope §8); limits with scope defaults (feedback 3, OTP 3 lifetime, lock 6 h, devices 3 — scope §16). Approve/reject with mandatory reason, enable/disable only (never hard delete) — scope §§11, 16.

---

## 10. Consolidated assumption register (for the `design.MD` traceability check)

| # | Assumption in these wireframes | Where | `design.MD` must |
|---|---|---|---|
| A1 | Live streaming of other devices' cameras | §§3.6–3.9 | Prove WebRTC (or revise wireframes to thumbnail fallback) |
| A2 | TTS provider/voice (browser TTS is placeholder) — coaching **and** Demo narration | §§3.5, 3.10, 7 | Choose TTS; prove Primary-only routing for both demo and coaching |
| A3 | Session join via code; auto-Primary assignment/promotion; selection + demo-state broadcast to all devices; device/Primary retention on [Pick Another Asana] | §§3.2, 3.4, 3.5, 7 | Define join + same-user enforcement (max 3 devices); prove auto-role sync, selection/demo sync, and session-to-session retention |
| A8 | Demo playback sequencing (narration-end → ~2 s hold → next step) across 3 devices | §3.5 | Prove synchronised demo advance on Primary + Secondaries |
| A9 | Real-time body-framing detection: whole body (head/hands/feet, small margin) inside **each** camera, continuously during capture; out-of-frame set discard + retake | §§3.6, 3.10 FW, 3.11d | Prove detection latency/accuracy on laptop + mobile cameras without storing photos; prove pause/resume sync across devices |
| A4 | Forgiving name search (diacritics/variants) | §§5.3, 6.2 | Define normalisation/matching |
| A5 | OTP expiry & resend behaviour | §5.1 | Decide within scope §5 limits |
| A6 | Background PDF parsing at scale | §9 | Batch-job pipeline + status updates |
| A7 | Vision gate + regeneration loop in production | §6.5 | Automate POC-b gating (max attempts, negative prompts) |

Nothing else in §§5–9 depends on an unproven mechanism: libraries, favourites, history, publishing, and admin limits are CRUD + state display over scope-defined data.

---

## 11. Decisions needed from the owner (approval gate)

Please approve the wireframes overall, and answer these — defaults are pre-selected so a short reply suffices:

| # | Question | Default in this draft |
|---|---|---|
| Q1 | Coaching layout: own camera + reference largest, others as thumbnails (§3.6)? | Yes |
| Q2 | Step strip as one-row numbers (§3.6) vs. full step-text list on the coaching screen? Scope §13.2 requires "the list of all steps" — one-row strip + instruction panel is this draft's reading. | Strip + panel |
| Q3 | Secondary mobile: all-feeds parity vs. camera + reference only (§3.9)? | Camera + reference (needs your OK as a scope-§13.2 reading) |
| Q4 | [Continue without this camera] only for Primary, only before Step 1 (§3.11b)? | Yes |
| Q5 | No cancel button on the Analysing overlay (§3.11c)? | No cancel |
| Q10 | Select Asana (§3.4) is always shown after the Disclaimer — even when an asana was pre-selected from Detail/Personal/Favourites (confirm-or-switch, never auto-skipped)? Includes: per-asana contraindications live in §3.4 (not the generic §3.3 disclaimer), and [Pick Another Asana] re-runs §3.3 → §3.4 → §3.5 while retaining devices/Primary. | Always shown; retain devices |
| Q11 | **Owner-directed, provisional (confirm/revert after user testing):** (a) first device to join is AUTO-Primary (§3.2 — overrides POC finding); **every Secondary has [Make This Device Primary]** — immediate before capture, queued to the next step boundary mid-capture (§§3.2, 3.9); if the auto-Primary leaves pre-session, earliest remaining device is promoted. (b) After selection, Demo Offer → optional Demo Playback → Ready Gate (§3.5); counting starts only on [I'm Ready]. Demo controls [Pause]/[Hear Again]/[End Demo] and ~2 s auto-advance hold are this draft's defaults. | As drafted; revisit (a) after testing |
| Q12 | **Owner-directed:** Framing Warning (§3.10 FW, §3.11d) — any camera losing full-body framing pauses capture, Primary speaks "I cannot measure your pose. Please come fully within the [device] camera", out-of-frame sets don't count, resume is automatic (~1 s all-in-view, re-count, no tap, no [Continue Anyway]). "Fully within" = head/hands/feet + small margin. Detection is A9/TO-PROVE. Confirm wording, 10 s repeat interval, and kept-valid-sets rule. | As drafted |
| Q6 | Search must find `Vrikshasana` → `Vṛkṣāsana` (§5.3)? | Yes |
| Q7 | Unavailable Feedback button explains why instead of disappearing (§5.5)? | Explains |
| Q8 | Steps reviewed before images are generated (§6.4)? | Yes |
| Q9 | "3 of 4 steps correct" summary in History — factual count or forbidden grade (§8)? | Count + disclaimer |

**Next step after your approval:** high-fidelity, linked, runnable mock prototype (HandOff §1 step 2) using the POC-approved boy/girl characters and gated Chakrasana images. No `design.MD` or production code will start before that prototype is also approved.

*— End of wireframe draft. Awaiting owner approval. —*
