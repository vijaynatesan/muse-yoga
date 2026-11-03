#!/usr/bin/env node
// One-command local start (design §3/§1.4): builds web, starts server (API+WS+workers) on one origin.
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
if (!existsSync(join(root, "node_modules"))) {
  console.log("Installing dependencies (npm install)…");
  if (run("npm", ["install"]).status !== 0) process.exit(1);
}
run("node", ["scripts/setup-mediapipe.mjs"]);   // pose model/runtime for the skeleton view (no-op when present)
if (!existsSync(join(root, "apps/web/dist/index.html"))) {
  console.log("Building web…");
  if (run("npm", ["run", "build"]).status !== 0) process.exit(1);
}
if (!existsSync(join(root, ".env"))) {
  console.log("No app/.env found. Copy .env.example to .env and fill it in first.");
  process.exit(1);
}
const hasCert = existsSync(join(root, "certs/cert.pem"));
console.log(hasCert ? "HTTPS (mkcert) enabled." : "No certs found — serving HTTP. Camera/mic need localhost or HTTPS; see scripts/mkcert-setup.md.");
const child = spawn("node", ["--import", "tsx", "apps/server/src/index.ts"], { stdio: "inherit", cwd: root });
child.on("exit", (c) => process.exit(c ?? 0));
