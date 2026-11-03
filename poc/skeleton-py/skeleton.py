#!/usr/bin/env python3
"""Skeleton POC (single camera) — MoveNet via TensorFlow Hub.

Follows the GeeksforGeeks recipe ("Human Pose Detection using MoveNet
with Tensorflowhub"): hub.load(...singlepose/lightning/4),
resize_with_pad to 192x192, int32 input, keypoints [1,1,17,3].

Difference from the article, by design: the skeleton is drawn on a PLAIN
WHITE canvas. The person and the background are never drawn, so this is
safe to show in the yoga app later. Video frames are processed in memory
only; nothing is recorded unless you pass --save.

Usage (from this folder, with .venv activated):
    python skeleton.py --image sample.jpg            # one photo -> skeleton.png
    python skeleton.py --webcam                      # live skeleton window (q quits, s saves a frame)
    python skeleton.py --webcam --mirror             # mirror the skeleton (selfie view)
    python skeleton.py --video path/to/clip.mp4 --save out.mp4

First run downloads the MoveNet model from TF Hub (needs internet).
"""
import argparse
import sys
import time

import cv2
import numpy as np
import tensorflow as tf
import tensorflow_hub as hub

MODEL_URL = "https://tfhub.dev/google/movenet/singlepose/lightning/4"
INPUT_SIZE = 192  # Lightning variant, per the article
MIN_SCORE = 0.3   # ignore joints the model is unsure about

KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]
# Article's connections, extended with the two torso diagonals it omits.
CONNECTIONS = [
    (0, 1), (0, 2), (1, 3), (2, 4), (0, 5), (0, 6),
    (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 6), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
]

_movenet = None


def load_model():
    global _movenet
    if _movenet is None:
        print("Loading MoveNet from TF Hub (first run downloads the model)...")
        _movenet = hub.load(MODEL_URL)
    return _movenet


def detect(frame_bgr):
    """Run MoveNet on one BGR frame. Returns (17,3) array of [y, x, score]
    in relative coordinates, or None when the model finds no person."""
    model = load_model()
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    resized = tf.image.resize_with_pad(tf.expand_dims(rgb, axis=0), INPUT_SIZE, INPUT_SIZE)
    image_np = resized.numpy().astype(np.int32)
    outputs = model.signatures["serving_default"](tf.constant(image_np))
    keypoints = outputs["output_0"].numpy()
    if keypoints.shape != (1, 1, 17, 3):
        return None
    return keypoints[0, 0]


def draw_skeleton(canvas, keypoints, width, height):
    """Draw ONLY the skeleton onto a white canvas (in place). Keypoint
    coordinates are relative [y, x] in 0..1 of the source frame."""
    canvas[:] = 255
    if keypoints is None:
        cv2.putText(canvas, "no person detected", (16, 34),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (140, 140, 140), 2)
        return canvas
    pts = {}
    for i, (y, x, score) in enumerate(keypoints):
        if score >= MIN_SCORE:
            pts[i] = (int(x * width), int(y * height))
    for a, b in CONNECTIONS:
        if a in pts and b in pts:
            cv2.line(canvas, pts[a], pts[b], (67, 93, 47), 4, cv2.LINE_AA)  # deep green
    for pt in pts.values():
        cv2.circle(canvas, pt, 6, (47, 101, 180), -1, cv2.LINE_AA)          # clay joints
    return canvas


def run_image(path, out_path):
    frame = cv2.imread(path)
    if frame is None:
        sys.exit(f"Could not read image: {path}")
    h, w = frame.shape[:2]
    t0 = time.time()
    kps = detect(frame)
    ms = (time.time() - t0) * 1000
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    draw_skeleton(canvas, kps, w, h)
    cv2.imwrite(out_path, canvas)
    confident = int((kps[:, 2] >= MIN_SCORE).sum()) if kps is not None else 0
    print(f"{path}: {confident}/17 confident keypoints in {ms:.0f} ms -> {out_path}")
    if kps is not None:
        for name, (y, x, s) in zip(KEYPOINT_NAMES, kps):
            if s >= MIN_SCORE:
                print(f"  {name:14s} y={y:.2f} x={x:.2f} score={s:.2f}")


def run_webcam(mirror, save_path, cam_index):
    cap = cv2.VideoCapture(cam_index)
    if not cap.isOpened():
        sys.exit("Could not open the camera. On WSL, cameras usually do not "
                 "pass through — run this on Windows Python or a native "
                 "Linux/macOS shell instead. --image/--video work anywhere.")
    load_model()
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    writer = None
    print("Live skeleton — 'q' quits, 's' saves a frame. Nothing is recorded by default.")
    frames, t0 = 0, time.time()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if mirror:
                frame = cv2.flip(frame, 1)
            kps = detect(frame)
            draw_skeleton(canvas, kps, width, height)
            frames += 1
            if frames % 30 == 0:
                fps = frames / (time.time() - t0)
                cv2.putText(canvas, f"{fps:.0f} fps", (width - 110, 34),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (140, 140, 140), 2)
                frames, t0 = 0, time.time()
            if save_path:
                if writer is None:
                    writer = cv2.VideoWriter(save_path, cv2.VideoWriter_fourcc(*"mp4v"), 20, (width, height))
                writer.write(canvas)
            cv2.imshow("Skeleton POC (white background — skeleton only)", canvas)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("s"):
                cv2.imwrite("skeleton-frame.png", canvas)
                print("Saved skeleton-frame.png")
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        cv2.destroyAllWindows()


def run_video(path, save_path):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        sys.exit(f"Could not open video: {path}")
    load_model()
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    writer = None
    if save_path:
        writer = cv2.VideoWriter(save_path, cv2.VideoWriter_fourcc(*"mp4v"), 20, (width, height))
    n = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        draw_skeleton(canvas, detect(frame), width, height)
        if writer is not None:
            writer.write(canvas)
        n += 1
    cap.release()
    if writer is not None:
        writer.release()
    print(f"Processed {n} frames -> {save_path or '(discarded; pass --save to keep)'}")


def main():
    ap = argparse.ArgumentParser(description="MoveNet skeleton-only POC (white background)")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--image", help="detect pose in one image file")
    src.add_argument("--webcam", action="store_true", help="live skeleton from the camera")
    src.add_argument("--video", help="process a video file frame by frame")
    ap.add_argument("--save", help="output path (image: PNG path; video: MP4 path)")
    ap.add_argument("--mirror", action="store_true", help="mirror the webcam view (selfie style)")
    ap.add_argument("--camera", type=int, default=0, help="camera index (default 0)")
    args = ap.parse_args()

    # TF Hub download noise off; keep real errors visible.
    tf.get_logger().setLevel("ERROR")

    if args.image:
        run_image(args.image, args.save or "skeleton.png")
    elif args.webcam:
        run_webcam(args.mirror, args.save, args.camera)
    else:
        run_video(args.video, args.save)


if __name__ == "__main__":
    main()
