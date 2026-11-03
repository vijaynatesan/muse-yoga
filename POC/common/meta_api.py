"""Meta Model API client + $15 budget guard. POC only.

Pricing (public docs, 2026-10): muse-wonder-1.0 $4/1M in, $20/1M out ($0.20 cached);
muse-image-1.0 $0.01/image. Ledger in POC/outputs/cost_ledger.json.
Hard-stop before any call if projected ledger would exceed BUDGET_USD.
"""
import base64, json, os, time
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[2]  # workspace root
POC = Path(__file__).resolve().parents[1]
LEDGER = POC / "outputs" / "cost_ledger.json"
BASE = "https://api.meta.ai/v1"
BUDGET_USD = 15.00
WONDER_IN, WONDER_OUT = 4.0/1e6, 20.0/1e6
IMAGE_USD = 0.01

def api_key():
    k = os.environ.get("META_API_KEY") or os.environ.get("MODEL_API_KEY")
    if k: return k.strip()
    f = ROOT / ".api.txt"
    return f.read_text().strip() if f.exists() else ""

def ledger():
    if LEDGER.exists():
        try: return json.loads(LEDGER.read_text())
        except Exception: pass
    return {"budget_usd": BUDGET_USD, "spent_usd": 0.0, "calls": []}

def _save(l): LEDGER.parent.mkdir(parents=True, exist_ok=True); LEDGER.write_text(json.dumps(l, indent=2))

def charge(item, usd, detail=""):
    l = ledger(); usd = round(float(usd), 6)
    l["spent_usd"] = round(l["spent_usd"] + usd, 6)
    l["calls"].append({"item": item, "usd": usd, "detail": detail, "ts": time.strftime("%Y-%m-%dT%H:%M:%S")})
    _save(l)
    print(f"[cost] {item}: ${usd:.4f}  cumulative ${l['spent_usd']:.4f} / ${BUDGET_USD}")
    return l["spent_usd"]

def guard(est_usd):
    spent = ledger()["spent_usd"]
    if spent + est_usd > BUDGET_USD:
        raise RuntimeError(f"BUDGET GUARD: spent ${spent:.4f} + est ${est_usd:.4f} > ${BUDGET_USD}. Stopping.")
    return spent

def headers():
    return {"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"}

def wonder(messages, max_output_tokens=1200, effort="low", item="wonder", timeout=240):
    """POST /v1/responses (OpenAI Responses dialect, measured on wire for Meta)."""
    guard(0.10)  # conservative per-call estimate
    payload = {"model": "muse-wonder-1.0", "input": messages, "max_output_tokens": max_output_tokens,
               "reasoning": {"effort": effort}, "store": False}
    t0 = time.time()
    r = requests.post(f"{BASE}/responses", headers=headers(), json=payload, timeout=timeout)
    dt = time.time() - t0
    if r.status_code != 200:
        raise RuntimeError(f"wonder {r.status_code} ({dt:.1f}s): {r.text[:800]}")
    data = r.json()
    # extract text
    text = data.get("output_text") or ""
    if not text:
        parts = []
        for o in data.get("output", []):
            for c in o.get("content", []):
                if c.get("text"): parts.append(c["text"])
        text = "\n".join(parts)
    u = data.get("usage", {}) or {}
    in_t, out_t = u.get("input_tokens", 0), u.get("output_tokens", 0)
    usd = in_t * WONDER_IN + out_t * WONDER_OUT if (in_t or out_t) else 0.01
    charge(item, usd, f"in={in_t} out={out_t} {dt:.1f}s")
    return {"text": text, "usage": u, "seconds": dt, "raw": data}

def wonder_chat(messages, max_tokens=1200, item="wonder-chat", timeout=240):
    """Fallback: /v1/chat/completions OpenAI-compatible."""
    guard(0.10)
    payload = {"model": "muse-wonder-1.0", "messages": messages, "max_tokens": max_tokens}
    t0 = time.time()
    r = requests.post(f"{BASE}/chat/completions", headers=headers(), json=payload, timeout=timeout)
    dt = time.time() - t0
    if r.status_code != 200:
        raise RuntimeError(f"chat {r.status_code} ({dt:.1f}s): {r.text[:800]}")
    data = r.json()
    text = data["choices"][0]["message"]["content"]
    u = data.get("usage", {}) or {}
    usd = u.get("prompt_tokens",0)*WONDER_IN + u.get("completion_tokens",0)*WONDER_OUT if u else 0.01
    charge(item, usd, f"usage={u} {dt:.1f}s")
    return {"text": text, "usage": u, "seconds": dt, "raw": data}

def image_generate(prompt, size="1024x1024", item="image-gen", timeout=300):
    guard(IMAGE_USD)
    t0 = time.time()
    r = requests.post(f"{BASE}/images/generations", headers=headers(),
                      json={"model": "muse-image-1.0", "prompt": prompt, "size": size}, timeout=timeout)
    dt = time.time() - t0
    if r.status_code != 200:
        raise RuntimeError(f"image-gen {r.status_code} ({dt:.1f}s): {r.text[:800]}")
    charge(item, IMAGE_USD, f"{dt:.1f}s")
    return {"b64": r.json()["data"][0]["b64_json"], "seconds": dt, "raw_meta": {k: v for k, v in r.json().items() if k != "data"}}

def image_edit(prompt, image_paths, size="1024x1024", item="image-edit", timeout=300):
    """POST /v1/images/edits multipart, fields image[0], image[1]... (Meta indexing)."""
    guard(IMAGE_USD)
    files = []
    fps = []
    try:
        for i, p in enumerate(image_paths):
            f = open(p, "rb"); fps.append(f)
            files.append((f"image[{i}]", (Path(p).name, f, "image/png")))
        t0 = time.time()
        r = requests.post(f"{BASE}/images/edits",
                          headers={"Authorization": f"Bearer {api_key()}"},
                          data={"model": "muse-image-1.0", "prompt": prompt, "size": size},
                          files=files, timeout=timeout)
        dt = time.time() - t0
    finally:
        for f in fps: f.close()
    if r.status_code != 200:
        raise RuntimeError(f"image-edit {r.status_code} ({dt:.1f}s): {r.text[:800]}")
    charge(item, IMAGE_USD, f"refs={len(image_paths)} {dt:.1f}s")
    return {"b64": r.json()["data"][0]["b64_json"], "seconds": dt}

def save_b64(b64, path):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(b64)); return path
