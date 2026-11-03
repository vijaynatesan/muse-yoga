# Skeleton POC (single camera) — MoveNet / TensorFlow Hub

Built from the GeeksforGeeks recipe *Human Pose Detection using MoveNet
with Tensorflowhub*: `hub.load("https://tfhub.dev/google/movenet/singlepose/lightning/4")`,
input resized with pad to 192×192, keypoints `[1, 1, 17, 3]`.

One deliberate difference: the skeleton is drawn on a **plain white
canvas**. The person and the background are never drawn, nothing is
recorded by default, and frames are processed in memory only.

## Run it

```bash
cd POC/skeleton-py
source .venv/bin/activate

# Still photo -> skeleton.png (skeleton only, on white)
python skeleton.py --image ../skeleton/sample.jpg

# Live camera -> skeleton window ('q' quit, 's' save a frame)
python skeleton.py --webcam --mirror

# Video file -> skeleton video
python skeleton.py --video clip.mp4 --save out.mp4
```

First run downloads the MoveNet model from TF Hub (needs internet once;
it is cached afterwards).

## WSL note

Cameras normally do **not** pass through to WSL, and `cv2.imshow` needs a
display. If `--webcam` says it cannot open the camera here, run the same
commands in Windows Python (or any native shell with a camera) — `--image`
and `--video` modes work anywhere. The environment lives in `.venv` inside
this folder; recreate it with:

```bash
uv venv && uv pip install tensorflow tensorflow-hub opencv-python-headless numpy "setuptools<81"
```

## Verified in this environment (WSL, CPU)

- Sample photo (`../skeleton/sample.jpg`, Wikimedia Commons yoga photo):
  **15/17 keypoints confident**, skeleton image written (`out-sample.png`).
- Steady state after warm-up: **~58 ms/frame (~17 fps)** on this CPU at
  960×583; a 640×480 webcam feed is faster.
- Video mode: 20/20 frames processed to a skeleton-only MP4.

## Notes / next steps

- Joint score threshold is 0.3 (`MIN_SCORE` in `skeleton.py`); lower it if
  limbs drop out, raise it if the skeleton jitters.
- MoveNet *Thunder* (256×256) is more accurate but slower; Lightning is
  the right default for realtime.
- This replaces the two earlier browser experiments in `POC/skeleton/`
  (MediaPipe — needs WebGL, which this sandbox lacks) and
  `POC/skeleton-fusion/` (two-camera merge — dropped by request).
