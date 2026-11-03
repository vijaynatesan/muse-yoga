"""POC-e multi-device sync server (aiohttp, one port: HTTP pages + WebSocket).
Run: POC/.venv/bin/python POC/multi_device/server_multi.py [8443]
HTTPS if cert.pem/key.pem sit next to this file (needed for camera on LAN), else HTTP (localhost only for camera).
Protocol (JSON): join / make_primary / step / capture_request (primary only) /
capture_report / capture_image (jpeg thumb broadcast) / sync (clock offset).
Server broadcasts: state (devices+roles), step, capture_at (server-epoch ms, scheduled +CAPTURE_LEAD_MS),
device_offline. Capture reports are logged to POC/outputs/e/sync_log.jsonl with measured spread."""
import asyncio, json, ssl, sys, time, uuid
from pathlib import Path
from aiohttp import web

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LOG = ROOT / "POC/outputs/e/sync_log.jsonl"
CAPTURE_LEAD_MS = 1200

def now_ms(): return int(time.time() * 1000)

def log(rec):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f: f.write(json.dumps(rec) + "\n")
    print(rec)

devices = {}   # ws -> {"id","name","role"}
state = {"primary_id": None, "step": 1}
captures = {}  # capture_id -> {"reports": {device_id: corrected_ms}, "step": int, "index": int}

async def broadcast(msg, exclude=None):
    dead = []
    for ws in list(devices):
        if ws is exclude: continue
        try: await ws.send_json(msg)
        except Exception: dead.append(ws)
    for ws in dead: devices.pop(ws, None)

def device_list():
    return [{"id": d["id"], "name": d["name"], "role": "primary" if d["id"] == state["primary_id"] else "secondary"}
            for d in devices.values()]

async def send_state():
    await broadcast({"type": "state", "devices": device_list(), "primary_id": state["primary_id"],
                     "step": state["step"], "server_ms": now_ms()})

async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)
    dev = None
    try:
        async for raw in ws:
            try: msg = json.loads(raw.data)
            except Exception: continue
            t = msg.get("type")
            if t == "join":
                dev = {"id": uuid.uuid4().hex[:8], "name": str(msg.get("name") or "device")[:40]}
                devices[ws] = dev
                # No auto-primary: scope 13.1 says user explicitly taps "Make this device Primary".
                await ws.send_json({"type": "welcome", "id": dev["id"], "server_ms": now_ms()})
                log({"event": "join", "name": dev["name"], "id": dev["id"], "devices": len(devices), "ms": now_ms()})
                await send_state()
            elif dev is None:
                continue
            elif t == "sync":
                await ws.send_json({"type": "sync_reply", "server_ms": now_ms(), "echo": msg.get("client_ms")})
            elif t == "make_primary":
                state["primary_id"] = dev["id"]
                log({"event": "primary", "name": dev["name"], "ms": now_ms()})
                await broadcast({"type": "primary_changed", "primary_id": dev["id"], "name": dev["name"], "server_ms": now_ms()})
                await send_state()
            elif t == "step" and dev["id"] == state["primary_id"]:
                state["step"] = int(msg.get("step", 1))
                await broadcast({"type": "step", "step": state["step"], "server_ms": now_ms()})
                await send_state()
            elif t == "capture_request" and dev["id"] == state["primary_id"]:
                cid = uuid.uuid4().hex[:8]
                at = now_ms() + CAPTURE_LEAD_MS
                captures[cid] = {"reports": {}, "step": state["step"], "index": msg.get("index", 1)}
                log({"event": "capture_at", "capture_id": cid, "step": state["step"], "at_ms": at, "devices": len(devices)})
                await broadcast({"type": "capture_at", "capture_id": cid, "step": state["step"],
                                 "index": msg.get("index", 1), "capture_at_ms": at, "server_ms": now_ms()})
            elif t == "capture_report":
                cid = msg.get("capture_id"); c = captures.get(cid)
                if c:
                    c["reports"][dev["id"]] = msg.get("server_capture_ms")
                    await broadcast({"type": "capture_done", "name": dev["name"], "step": c["step"]}, exclude=ws)
                    if len(c["reports"]) >= max(len(devices), 1):
                        vals = [v for v in c["reports"].values() if v]
                        spread = (max(vals) - min(vals)) if len(vals) > 1 else 0
                        log({"event": "capture_spread", "capture_id": cid, "step": c["step"],
                             "devices": len(vals), "spread_ms": spread, "corrected_ms": vals})
            elif t == "capture_image":
                await broadcast({"type": "capture_image", "name": dev["name"], "step": msg.get("step"),
                                 "image": msg.get("image")}, exclude=ws)
    finally:
        if dev is not None:
            devices.pop(ws, None)
            if state["primary_id"] == dev["id"]: state["primary_id"] = None
            log({"event": "offline", "name": dev["name"], "devices": len(devices), "ms": now_ms()})
            await broadcast({"type": "device_offline", "name": dev["name"], "server_ms": now_ms()})
            await send_state()
    return ws

async def index_handler(request):
    return web.FileResponse(HERE / "index_multi.html")

def make_app():
    app = web.Application(client_max_size=10 * 1024 * 1024)
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", ws_handler)
    app.router.add_static("/assets/", str(ROOT), show_index=False)
    app.router.add_static("/poc/", str(ROOT / "POC"), show_index=False)
    return app

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
    ctx = None
    import os
    if not os.environ.get("POC_HTTP") and (HERE / "cert.pem").exists() and (HERE / "key.pem").exists():
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(HERE / "cert.pem", HERE / "key.pem")
    print(f"{'HTTPS' if ctx else 'HTTP'} multi-device POC on 0.0.0.0:{port}  (LAN camera needs HTTPS)")
    web.run_app(make_app(), host="0.0.0.0", port=port, ssl_context=ctx, print=None)
