#!/usr/bin/env bash
# Usage: ./gen-cert.sh <windows-LAN-IP> [more hosts]   -> certs/cert.pem + key.pem (server.mjs then serves HTTPS)
set -e; mkdir -p certs; mkcert -cert-file certs/cert.pem -key-file certs/key.pem localhost 127.0.0.1 "$@"
echo "Install this CA on the phone:  $(mkcert -CAROOT)/rootCA.pem"
