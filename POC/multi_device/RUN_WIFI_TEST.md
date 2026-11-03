# Multi-device Wi-Fi test — run sheet

Server (this machine, WSL): `POC/.venv/bin/python POC/multi_device/server_multi.py 8443` → HTTPS (self-signed cert for <PC-LAN-IP>).
Windows Wi-Fi IP today: **<PC-LAN-IP>** · WSL IP today: **<WSL-IP>** (WSL IP changes on reboot — re-check with `wsl hostname -I` in PowerShell).

## One-time Windows setup (Admin PowerShell, on THIS laptop)
```powershell
netsh interface portproxy add v4tov4 listenport=8443 listenaddress=0.0.0.0 connectport=8443 connectaddress=<WSL-IP>
netsh advfirewall firewall add rule name="YogaPOC8443" dir=in action=allow protocol=TCP localport=8443
```
Replace `<WSL-IP>` with the current WSL IP if WSL was restarted.
Remove later: `netsh interface portproxy delete v4tov4 listenport=8443 listenaddress=0.0.0.0`

## Test 1 — second laptop (same Wi-Fi)
1. On second laptop browser, open `https://<PC-LAN-IP>:8443/`
2. Accept the self-signed certificate warning (Advanced → Proceed). This is required for phone/laptop camera on LAN.
3. On THIS laptop, open the same URL in your browser (or `https://localhost:8443/`), tick/name devices differently:
   - This laptop: name `Laptop-Primary`, Join, click **Make this device Primary** if needed.
   - Second laptop: name `Laptop-Secondary`, Join. It must show `SECONDARY (camera only, muted)`.
4. Primary: click **Capture all devices now** — both cameras must capture at the same announced moment; each device then shows the other's capture thumbnail.
5. Primary: click **Run auto session** — only Primary speaks; Secondary stays muted; 3 captures/step.
6. Close the Secondary tab — Primary must log + speak `A device has gone offline: Laptop-Secondary`.
7. Tell Muse the result; sync timing is recorded server-side in `POC/outputs/e/sync_log.jsonl` (`capture_spread` = spread in ms across devices).

## Test 2 — mobile (same Wi-Fi, after laptop test passes)
Same URL on phone browser, name `Phone-Secondary`, repeat steps 4–6. Note: iOS Safari / Android Chrome may phrase the cert warning differently; camera permission must be granted per device.

## Known POC limits (by design, for design phase)
- No live remote video streaming yet (that needs WebRTC) — devices exchange capture thumbnails, not live feeds. Step state, capture timing, roles, and disconnect are live.
- Self-signed cert is POC-only; production needs a real HTTPS domain.
- Clock offset is estimated from server sync pings; `capture_spread` uses each device's corrected capture timestamp.
