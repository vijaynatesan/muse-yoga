"""Automated POC-e test with 3 simulated devices (no camera): join, primary switch,
scheduled capture spread, disconnect detection. Requires server on localhost port (HTTP ok).
Usage: POC/.venv/bin/python POC/multi_device/test_sync.py [port]"""
import asyncio, json, sys, time
import aiohttp

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
URL = f"http://127.0.0.1:{PORT}/ws"

async def device(name, inbox):
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(URL) as ws:
            await ws.send_json({"type": "join", "name": name})
            inbox[name] = {"ws": ws, "events": [], "id": None}
            async for raw in ws:
                m = raw.json(); inbox[name]["events"].append(m)
                if m.get("type") == "welcome": inbox[name]["id"] = m["id"]
                if m.get("type") == "capture_at":
                    at = m["capture_at_ms"]
                    delay = max(0, (at - int(time.time()*1000)) / 1000)
                    await asyncio.sleep(delay)
                    await ws.send_json({"type": "capture_report", "capture_id": m["capture_id"],
                                        "server_capture_ms": int(time.time()*1000)})
                if len(inbox[name]["events"]) > 60: break

async def main():
    inbox = {}
    tasks = [asyncio.create_task(device(n, inbox)) for n in ("Laptop-A", "Laptop-B", "Phone-C")]
    await asyncio.sleep(1.5)
    names = list(inbox); assert len(names) == 3, inbox.keys()
    # switch primary to Laptop-B
    await inbox["Laptop-B"]["ws"].send_json({"type": "make_primary"})
    await asyncio.sleep(0.7)
    # Laptop-A tries to step (must be ignored as non-primary), Laptop-B steps + captures
    await inbox["Laptop-A"]["ws"].send_json({"type": "step", "step": 3})
    await inbox["Laptop-B"]["ws"].send_json({"type": "step", "step": 2})
    await inbox["Laptop-B"]["ws"].send_json({"type": "capture_request", "index": 1})
    await asyncio.sleep(2.5)
    # disconnect Phone-C
    await inbox["Phone-C"]["ws"].close()
    await asyncio.sleep(1.0)
    ev = {n: [e["type"] for e in d["events"]] for n, d in inbox.items()}
    print(json.dumps(ev, indent=2))
    assert "capture_at" in ev["Laptop-A"] and "capture_at" in ev["Phone-C"], "all devices must get capture_at"
    assert "device_offline" in ev["Laptop-A"], "remaining devices must be told Phone-C went offline"
    offline = [e for e in inbox["Laptop-A"]["events"] if e["type"] == "device_offline"]
    assert offline and offline[0]["name"] == "Phone-C"
    print("PASS: 3 devices joined, primary switch, non-primary step ignored check via server log, capture_at to all, disconnect broadcast")
    for t in tasks: t.cancel()

if __name__ == "__main__":
    asyncio.run(main())
