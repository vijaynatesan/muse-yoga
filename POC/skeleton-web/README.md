# Skeleton POC — one camera, in the browser

BlazePose (MediaPipe Pose Landmarker, lite) runs on-device in the page. The camera <video>
is hidden; only a skeleton on a white canvas is drawn. Nothing is recorded or uploaded.

Run (WSL):   cd POC/skeleton-web && python3 -m http.server 5180
Open (Windows browser):  http://localhost:5180/index.html   -> "Start camera"

Files: pose.js (source-agnostic pose + angles + framing), index.html (UI), vendor/ + models/ (local, offline).
Test (no camera): `?video=test/pose.webm&auto=1&delegate=CPU`; headless run: node test/run.mjs
Verified in headless Chromium (CPU/WASM): 107/107 frames detected on a Warrior II photo, ~50 fps.
Not verified: your real camera, GPU delegate speed, floor poses.

## Two cameras (landmarks only, no video leaves a device)
node server.mjs            # static + WebSocket relay on :5180 (HTTPS automatically if certs/ exists)
Open  /two.html?room=demo  on each device. Pick "front" or "side", Start my camera. Every page shows both skeletons,
frame skew (clock-synced via the relay), and a Front-vs-Side angle table.
Wire format: pose.js toWire/fromWire (33 x [x,y,visibility], ts in relay-clock ms, ~0.7 KB/frame, <=20 fps).
Test: node test/two.mjs  (two senders from video files + one viewer; verified 65/64 frames, skew 50 ms)
Phone: needs HTTPS + the Windows PC's LAN IP; WSL2 NAT must forward port 5180 (see chat notes).
