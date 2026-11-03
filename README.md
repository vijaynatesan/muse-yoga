# Muse Yoga

A browser-based yoga asana coach. An AI creates each asana as a short sequence of steps with a drawn character for every step; you then practise in front of your camera, hands-free, and get a spoken, step-by-step check of your pose. Your camera feed is never shown back to you: during practice you see **a skeleton on a white background**, and the photo kept for your history is **blurred (background and face) on your own device first**.

> **Health notice.** This is a learning aid, not medical advice. Each asana lists the conditions it is not suitable for, and every practice session starts with a health disclaimer. Stop if you feel pain.

---

## Features

**Practise**
- Hands-free sessions: tap **Start** once, then every step is spoken aloud and you say **"Ready"** (browser speech recognition, with a server-side transcription fallback). There is no per-step click.
- **Skeleton view** of you (MediaPipe pose, runs in the browser) instead of a camera picture. The same detection pauses the session if you step out of frame.
- One photo per step, taken on a spoken 1-2-3 with a **shutter animation and sound**.
- **Multi-device sessions** (up to 3 devices, e.g. laptop + phone): one *Primary* device speaks and listens; others act as extra cameras, all captured at the same instant.
- A narrated **demo** whose images stay in step with the voice.
- Results with a verdict and a spoken correction per step, plus **blurred photo thumbnails** that enlarge on click. **Practice history** is a calendar.

**Create and curate**
- Create an asana by name: AI writes the steps, then generates one image per step using your chosen character, keeping each pose consistent with the previous steps.
- Ask for corrections (limited feedback attempts), submit for publication, admin approve/reject with a reason.
- Public Library and personal library, search and filters, favourites lists.
- **Admins** can edit the steps, durations, order and images of new asanas and of published Public Library asanas, and manage characters, reference books and limits. They can also view the audit log and the AI call/cost log.

**Accounts**
- Email one-time-code sign-in (no passwords), OTP and lockout limits, max 3 login devices per user. Limits are configurable (`app/config/limits.default.json`, live-editable by admins).

## Tech stack

| Part | Technology |
|---|---|
| Web app | React 19, Vite, TypeScript |
| Server | Node.js ≥ 22, Fastify, WebSocket session authority |
| Shared code | `packages/domain` (rules), `packages/contracts` (message validation) |
| Data | JSON file store under `app/data/` (single process, local) |
| Pose / privacy | MediaPipe Pose Landmarker (on-device) for the skeleton, framing check, person mask and face blur |
| AI | Meta Muse models, called either directly or through OpenRouter (see below) |
| Tests | Node's built-in test runner (domain, API, WebSocket, privacy, provider-stub tests) |

## Quick start

**Prerequisites:** Node.js 22+, a modern browser with a camera and microphone. Optional: [mkcert](https://github.com/FiloSottile/mkcert) (HTTPS for phones/other laptops), Python 3 + PyMuPDF (reference PDF parsing).

```bash
git clone https://github.com/vijaynatesan/muse-yoga.git
cd muse-yoga/app
cp .env.example .env                              # AI_PROVIDER=mock works with no keys
cp config/admins.example.json config/admins.json  # put your own email in it to become admin
npm install                                       # also fetches the ~6 MB pose model (see below)
node scripts/dev.mjs                              # builds the web app and starts everything
```

Open **http://localhost:8080** (camera and microphone work on `localhost`; other devices need HTTPS, see below).

**First login.** Enter your email, then read the one-time code from the newest file in `app/data/mail/` (the default `MAILER=file` writes mail to disk instead of sending it). To send real mail, set `MAILER=gmail` with a Gmail app password.

**Pose model.** `npm install` runs `scripts/setup-mediapipe.mjs`, which copies the MediaPipe runtime from the npm package and downloads the pose model into `apps/web/public/mediapipe/` (git-ignored). If you were offline, rerun `npm run setup:pose`. Without these files practice falls back to a plain camera view.

### Using real AI

Mock mode produces placeholder steps and images and never fails a pose check, so you can explore the whole UI for free. For real generation and validation, set one of these in `app/.env`:

| `AI_PROVIDER` | Needs | Notes |
|---|---|---|
| `mock` (default) | nothing | Offline, deterministic, no spend. Pose checks always pass. |
| `meta` | `META_API_KEY` | Meta API directly: `muse-wonder` (text and vision), `muse-image` (step images), `muse-voice-transcribe`. |
| `openrouter` | `OPENROUTER_API_KEY` | Same Meta models through OpenRouter (`meta/muse-wonder`, `meta/muse-image`, `meta/muse-voice-transcribe-1.0`). |

You can mix providers per feature with `AI_TEXT_PROVIDER`, `AI_IMAGE_PROVIDER` and `AI_VOICE_PROVIDER`, and pick models with `OPENROUTER_TEXT_MODEL`, `OPENROUTER_VISION_MODEL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_VOICE_MODEL`. API keys stay on the server and never reach the browser. Real calls cost money: every call is logged with its estimated cost in the admin **AI calls** view. (Image availability on OpenRouter can depend on your region; if it is blocked, set `AI_IMAGE_PROVIDER=meta`.)

### Phones and other laptops (HTTPS)

Browsers only allow camera/microphone on `localhost` or HTTPS. For other devices on your network, create a local certificate with mkcert and put `cert.pem` / `key.pem` in `app/certs/` (the server then serves HTTPS automatically), then trust the mkcert CA on each device. Step by step: [`app/scripts/mkcert-setup.md`](app/scripts/mkcert-setup.md).

## Privacy and data

- **Skeleton, not video.** The camera picture is analysed in the browser and only a skeleton is drawn. Nothing is recorded or streamed between devices.
- **Pose validation.** The photo for each step is sent to the AI provider for checking, held in server memory only, and discarded after analysis.
- **History photos.** The only photo kept is the one shown on the Results page. It is blurred **on your device** before it is uploaded (background blurred, face pixelated; if a person or face is not found, the whole image is blurred). It is stored under `app/data/objects/practice-photos/<user>/<session>/`, served only to its owner, and can be deleted per session from History. The server cannot verify that an uploaded image is blurred, so the trust is in the client.
- **No voice storage.** Audio is transcribed in memory and never saved.
- **Secrets.** `.env`, `config/admins.json`, certificates and `app/data/` are git-ignored.

## Testing

```bash
cd app
npm test            # unit, API, WebSocket, privacy and provider-stub tests (spawns throw-away servers on test ports)
npm run typecheck   # all workspaces
```

Tests run on temporary data folders and mock AI, so they cost nothing and never touch your real data. A manual QA script for browser and hardware cases is in [`TestScriptsForBuild.md`](TestScriptsForBuild.md); results and open items are in [`app/QA_REPORT.md`](app/QA_REPORT.md).

## Project layout

```
app/
  apps/server/      Fastify API, WebSocket session logic, AI provider layer, JSON store
  apps/web/         React front end (practice screen, skeleton view, privacy blur, admin UI)
  packages/domain/  business rules (limits, OTP, validation, search matching)
  packages/contracts/  WebSocket message validation
  seed/             default characters and a sample asana, loaded on first start
  config/           limits and admin list examples
  scripts/          dev launcher, pose-model setup, mkcert notes, PDF parser worker
  tests/            behavioural tests
POC/ poc/           original proof-of-concept experiments (kept for reference)
prototype/          the clickable UI prototype the screens were built from
design.html, scope.MD, uidesign.MD ...   product scope and design documents
```

## Documentation

- [`scope.MD`](scope.MD): the product scope (what the app does and does not do).
- [`design.html`](design.html): the technical design (open it in a browser, e.g. `python3 -m http.server 5173` then `http://localhost:5173/design.html`).
- [`uidesign.MD`](uidesign.MD) and [`prototype/`](prototype/): screen designs and the clickable prototype.
- [`POC/POC_REPORT.md`](POC/POC_REPORT.md): what the proof-of-concept proved on real hardware and APIs.

## Status and known limitations

- **Single-machine app.** Data lives in one JSON store, so run one server process. `app/docker-compose.yml` provisions Postgres, Redis and Mailpit for a future move, but the app does not use them yet.
- **Not verified on real hardware yet:** multi-device timing, voice recognition at a distance, framing checks for floor poses, and pose-validation accuracy with the real models. Browser automation and the unit tests pass; see the QA report.
- **Voice** uses browser speech recognition with a one-shot server transcription fallback. Streaming server-side recognition is not built.
- **Hands and fingers** are not drawn in the skeleton view.
- **Reference books.** A built-in list of asana names is seeded. Admins can upload a reference PDF; none is bundled (for example, the Government of India *Common Yoga Protocol* is a bring-your-own file).

## License

Licensed under the [Apache License 2.0](LICENSE). The AI models, MediaPipe and any reference PDFs you add keep their own licenses and terms of use.
