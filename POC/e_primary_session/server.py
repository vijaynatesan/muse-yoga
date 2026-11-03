"""POC primary-device server (stdlib only). Serves index.html, /assets/<workspace path>, /outputs/<poc outputs>.
Usage: POC/.venv/bin/python POC/e_primary_session/server.py [port]  -> http://localhost:8765
Camera needs localhost (secure context). Multi-device remote access is a later phase (needs HTTPS/LAN design)."""
import http.server, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]
POC = ROOT / "POC"
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith("/assets/"): return str(ROOT / path[len("/assets/"):])
        if path.startswith("/outputs/"): return str(POC / "outputs" / path[len("/outputs/"):])
        if path in ("/", ""): return str(POC / "e_primary_session" / "index.html")
        return str(POC / "e_primary_session" / path.lstrip("/"))
    def log_message(self, *a): pass
if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"POC primary server: http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
