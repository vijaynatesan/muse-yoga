"""POC g — voice 'Ready' check. POC only, inside POC/g_voice/.

Standard-library server (no venv needed). Serves a mic test page and proxies
uploaded WAV clips (held in memory only, never written to disk) to
Muse Voice Transcribe:
  POST https://api.meta.ai/v1/asr/transcribe  (model muse-voice-transcribe-1.0)
Key comes from workspace .api.txt — never sent to the browser, never logged.
Price noted 2026: $0.18/audio-hour.

Run: python3 POC/g_voice/server.py 5174
Open: http://localhost:5174/   (mic requires localhost or HTTPS)
"""
import json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from matcher import match_ready
import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MODEL = "muse-voice-transcribe-1.0"
URL = "https://api.meta.ai/v1/asr/transcribe"
USD_PER_AUDIO_HOUR = 0.18
LEDGER = ROOT / "POC" / "outputs" / "cost_ledger.json"


def api_key():
    f = ROOT / ".api.txt"
    return f.read_text().strip() if f.exists() else ""


def charge(usd, detail):
    try:
        led = json.loads(LEDGER.read_text())
        led["spent_usd"] = round(led["spent_usd"] + usd, 6)
        led["calls"].append({"item": "g-voice-transcribe", "usd": round(usd, 6),
                              "detail": detail,
                              "ts": time.strftime("%Y-%m-%dT%H:%M:%S")})
        LEDGER.write_text(json.dumps(led, indent=2))
    except Exception:
        pass


def transcribe_wav(wav_bytes):
    req = {"mode": "PUSH_TO_TALK", "model": MODEL, "audioEncoding": "WAV"}
    t0 = time.time()
    r = requests.post(
        URL,
        headers={"Authorization": f"Bearer {api_key()}"},
        files={
            "request": (None, json.dumps(req), "application/json"),
            "audio": ("ready.wav", wav_bytes, "audio/wav"),
        },
        timeout=60,
    )
    dt = time.time() - t0
    if r.status_code != 200:
        raise RuntimeError(f"transcribe {r.status_code}: {r.text[:400]}")
    return r.json(), dt


def parse_wav_field(body, boundary):
    """Return bytes of the multipart part named 'audio' (kept in memory)."""
    marker = boundary.encode()
    for part in body.split(b"--" + marker):
        if b'name="audio"' in part:
            _, _, data = part.partition(b"\r\n\r\n")
            return data.rstrip(b"\r\n-")
    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            data = (HERE / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        elif self.path == "/api/health":
            self._json({"ok": True, "model": MODEL, "key_present": bool(api_key())})
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        if self.path == "/api/match":
            try:
                text = json.loads(body or b"{}").get("text", "")
            except Exception:
                text = ""
            return self._json(match_ready(text))
        if self.path != "/api/transcribe":
            return self._json({"error": "not found"}, 404)
        ctype = self.headers.get("Content-Type", "")
        if "boundary=" not in ctype:
            return self._json({"error": "expected multipart upload"}, 400)
        wav_bytes = parse_wav_field(body, ctype.split("boundary=", 1)[1])
        if not wav_bytes:
            return self._json({"error": "no audio in upload"}, 400)
        t0 = time.time()
        try:
            data, api_s = transcribe_wav(wav_bytes)
        except Exception as exc:
            return self._json({"error": str(exc)[:500]}, 502)
        transcript = data.get("transcript", "") or ""
        dur_ms = data.get("audioDurationMs") or 0
        usd = (dur_ms / 1000.0 / 3600.0) * USD_PER_AUDIO_HOUR
        charge(usd, f"{dur_ms/1000:.1f}s audio api={api_s:.2f}s")
        verdict = match_ready(transcript)
        self._json({
            "transcript": transcript,
            "matched": verdict["matched"],
            "phrase": verdict["phrase"],
            "audio_seconds": round(dur_ms / 1000.0, 2),
            "api_seconds": round(api_s, 2),
            "total_seconds": round(time.time() - t0, 2),
            "usd": round(usd, 6),
            "model": MODEL,
        })


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5174
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
