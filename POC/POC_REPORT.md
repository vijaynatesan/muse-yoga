# POC Report — Yoga Asana Learning Application (Primary Device)

**Status: COMPLETE for primary device. STOPPED per scope §18/§1 — no `design.MD` until owner approves this report.**
Date: 2026-10-30 · All code in `POC/` only · API: Meta Model API `https://api.meta.ai/v1`, key from `.api.txt`

## Cost (budget $15 — not exceeded)

| Item | Cost |
|---|---|
| Ledger total (`outputs/cost_ledger.json`, 32 calls incl. v2 reruns) | **$0.6151** |
| Unledgered PONG/model probes (3 tiny calls, est.) | ~$0.003 |
| **Total** | **~$0.62 / $15.00** |

## Image audit & rerun (2026-10-30, owner-reported defects)

Owner found non-boy characters and extra limbs in round-1 images. Audit of every generated image is in `outputs/image_audit.json`; round-1 files are archived under `outputs/b/archive_round1/` and `outputs/f/archive_round1/` and are **not** finals.

Confirmed round-1 failures: `b/step1` wrong character; `b/step3` wrong character + **3 legs**; `f/step1_correct_annotated` wrong real woman + confusing extra leg; `b/step2`/`retry_step1` correct character but wrong pose.

**Rerun done — yes, POC-b and POC-f annotation were rerun:**
- New generator `b_image/run_b_v2.py`: every image via `images/edits` from `character_for_yoga_pose_boy.png` ONLY, with character-lock + `exactly 1 head / 2 arms / 2 legs` prompt, then a muse-wonder vision gate (same_character, head/arm/leg counts, pose_correct; side-view hidden limb = not a failure, extra limb = failure) plus human viewing of finals.
- Final boy set: `outputs/b/final/step1.png` (lying, knees bent), `step2.png` (lying, palms beside head — needed explicit "must NOT stand" prompt), `step3.png` (bridge), `step4.png` (full wheel). All human-verified: boy character, 1 head, no extra limbs.
- POC-f annotation redone without image-edit regeneration: `outputs/f/final_annotated_boy_step1.png` is a deterministic red-circle overlay on `b/final/step1.png` (`e_primary_session/annotate_local.py`), so character/anatomy cannot drift.
- Lessons for design: (1) never use `images/generations` fallback for character steps — it loses the character; (2) add the vision anatomy gate in production generation, retries cost ~$0.045/image checked; (3) step-2-type poses need explicit negative prompts ("do not stand").

Pricing used: wonder $4/1M in, $20/1M out; image $0.01/image. Image calls dominate per-asana cost at scale: ~$0.03–0.05/asana (steps+regen), vision validation ~$0.06/step (large image tokens).

## Results per POC item

| # | Verdict | Evidence |
|---|---|---|
| a Wonder steps+metadata | **PASS** | 4 Chakrasana steps, difficulty/body-part/category/benefits/contraindications/duration, valid JSON, 6.4s, $0.019 — [outputs/a/chakrasana.json](outputs/a/chakrasana.json) |
| b Consistent character images | **PARTIAL → v2 PASS (gated)** | Round-1 failed (see audit); v2 boy-only gated set passes — [outputs/b/final/](outputs/b/final/) |
| c PDF extraction | **PASS with caveat** | 54 pages, 67k chars, 1,141 images, 0.12s text extraction (PyMuPDF). Diacritics/transliteration break exact asana search — see below — [outputs/c/](outputs/c/) |
| d Feedback chain | **PASS with caveat** | Intent per-line works; alignment works when reference context given — [outputs/d/report.json](outputs/d/report.json) |
| e Multi-device sync capture | **PASS (3 devices)** | 2-laptop + iPhone owner-tested; spread 12–148 ms; disconnect logged. Live remote video (WebRTC) deferred to design |
| f Pose validation + annotation | **PARTIAL / RISK** | Vision verdict works; annotation now deterministic overlay on boy image — [outputs/f/final_annotated_boy_step1.png](outputs/f/final_annotated_boy_step1.png) |
| g TTS on Primary | **PASS (candidate)** | Browser `speechSynthesis` in web app announces full script. No TTS model exists in Meta catalog (only transcribe/ASR), so browser TTS is the leading candidate; final choice = design phase |

### b — detail (highest risk)
- Round 1: step1 edit changed the character completely; step2 kept character but wrong pose (standing); step3 edit hit `content_policy_violation`, generate fallback changed character again.
- Round 2 (explicit character-lock prompt naming skin/hair/outfit): character preserved 2/2, final Wheel pose good, but step1 orientation/pose was wrong.
- **Conclusion:** character consistency is achievable with locked prompts, pose accuracy is inconsistent. The scope's human review + feedback loop (accept/reject) is therefore load-bearing, not optional. Budget for re-generations per asana.

### c — detail
- This 54-page/5.4MB PDF extracts in <1s locally, so a batch job is not needed for *this* file; scope's background-job hint remains right for larger books / image-heavy extraction on a server.
- Reference asana lookup must normalise diacritics (Tāḍāsana→tadasana) *and* transliteration variants (Vṛkṣāsana→vrksasana ≠ vrikshasana). Naive search found only 1/17 asanas; normalised found more but still missed variants.
- **Important:** full Chakrasana (Wheel) is *not* in this book — only Ardha Cakrāsana. Under scope §9, a normal user could not create Chakrasana; only admins could.

### d — detail
- Intent: valid correction PASS, `poem about cats` line REJECTED with reason — as scoped.
- Chakrasana cases correctly stopped at reference-existence (not in book).
- Extra Bhujangasana alignment tests: aligned correction PASS, `lift legs/balance on hands` REJECTED with reference reason.
- Caveat: one dangerous suggestion (`stand on one leg, eyes closed, 10 min`) was rejected at *intent* stage rather than alignment — chain ordering/blurring to tighten in design.

### f — detail
- Vision (muse-wonder-1.0 via `/v1/responses` with images): correct proxy → `correct:true`; standing proxy → `correct:false` with accurate correction; best-set field returned. ~10s/step, $0.057/step. Note scope §14 says send to muse-image-1.0, but image-1.0 is generate/edit only — pose *judgement* actually works via wonder vision. Design must resolve this wording.
- Annotation via muse-image-1.0 edit: wrong-case produced good red circles/arrows on a faithful image; correct-case regenerated a completely different person/pose. **Unreliable.**
- Mitigation proved locally at zero cost: deterministic PIL red-circle overlay on the stored image (`outputs/f/step1_local_overlay.png`) — stored image untouched except marks. Recommend design considers wonder→locations + programmatic overlay instead of image-edit annotation.

## Primary-device web app (e/g/f slice)
- [e_primary_session/index.html](e_primary_session/index.html) + [server.py](e_primary_session/server.py): health disclaimer gate, stored step image, own camera, step list with current highlighted, full TTS script (`Step N` → instruction → `Get ready 1,2,3` 1s gaps → capture on 3, 3× per step 3s apart → `Move to the next step` → `Analyzing, please wait`), captures held in memory only (never stored/uploaded), download button to feed `run_f.py`.
- Camera/TTS in a real browser on this device still needs your hands-on test — I verified server 200 + code paths, not your camera/mic hardware.

## Limitations & scope/design risks
1. Character/pose consistency (b) and annotation (f) are the two risks that could change design — both mitigations exist (locked prompts + human accept loop; programmatic overlay).
2. Reference lookup needs a variant-aware index, not exact string match; some popular asanas absent from this book.
3. Image content-policy can reject legitimate pose prompts (b step3) — needs retry/rephrase handling.
4. Latency: image edit 11–35s/image → asana creation is a ~1–2 min flow; validation ~10s/step + annotation. UX must be async.
5. Multi-device (18e) is unproven: needs HTTPS-reachable app, realtime sync, capture-time alignment, disconnect detection — next phase as owner directed.

## Multi-device POC (18e) — in progress, owner testing

- Built `POC/multi_device/`: aiohttp HTTPS server (self-signed for LAN, port 8443) + WebSocket sync. Roles (Primary/Secondary via Make Primary), step state broadcast, capture scheduled at a server timestamp (+1200 ms lead, per-device clock-offset correction), capture thumbnails exchanged, disconnect broadcast + Primary TTS announcement, all events logged to `outputs/e/sync_log.jsonl` with measured `capture_spread`.
- Automated test with 3 simulated devices **PASS**: join ×3, primary switch, capture_at delivered to all, disconnect of 3rd device broadcast to the rest. Spread was 0 ms on one machine (same clock) — real spread must be measured on Wi-Fi.
- Real-device test is handed to the owner: second laptop on same Wi-Fi first, then mobile. Windows needs a one-time admin port-forward (WSL is NAT'd) — exact commands in `multi_device/RUN_WIFI_TEST.md`. Known limit: no live remote video yet (WebRTC is a design-phase item); captures are exchanged as thumbnails.
- **Two-laptop Wi-Fi test: PASS (owner-tested 2026-10-30).** Server log (`outputs/e/sync_log.jsonl`) shows the real session Primary `Win32-261` + Secondary `Linux x86_64-141`: both joined, Primary claimed, 3 synchronised captures on step 1 with measured cross-device spread **37 ms, 9 ms, 68 ms** (all <100 ms). Earlier real sessions also show disconnect (`offline`) events.
- Verdict: **PASS for 2 laptops. Mobile (3rd device) test still pending** — owner to extend next as planned.
- **Three-device Wi-Fi test (2 laptops + iPhone): PASS (owner-tested 2026-10-30).** Session Primary `Win32-408` + laptop `Linux x86_64-141` + `iPhone-607` (3 devices joined): synchronised captures with 3-device spread **148 ms and 12 ms**, and the iPhone disconnect was logged (`offline iPhone-607`). POC-e therefore **PASS up to the scope maximum of 3 devices**; remaining gap is live remote video (WebRTC), deferred to design. Real-device spreads overall: 2-device 9–68 ms, 3-device 12–148 ms — acceptable for multi-angle still capture ("same moment" within ~0.15 s).

## Recommendation
Approve primary-device POC findings, then (1) run the multi-device POC with this app served remotely, and only then (2) start `design.MD`. Do not start design before multi-device, since sync tech is a design input.

**STOP — awaiting explicit owner approval of this report.**
