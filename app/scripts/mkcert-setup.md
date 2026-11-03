# LAN HTTPS setup (mkcert)

Primary on this PC: `https://localhost:8080` works with the cert in `app/certs/`.

Phones / other laptops on LAN need the mkcert CA trusted on each device:

1. On this PC: `mkcert -install` (already done for Linux).
2. Generate / refresh the app cert: `cd app/certs && mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 <this-pc-LAN-IP>`
3. Install the mkcert root CA (`mkcert -CAROOT`) on each phone/laptop (Windows/phone CA trust is done at the multi-device test).
4. Open `https://<this-pc-LAN-IP>:8080` on each device. No warning click-through should appear.

Without a trusted cert, browsers block camera/microphone on LAN IPs.
