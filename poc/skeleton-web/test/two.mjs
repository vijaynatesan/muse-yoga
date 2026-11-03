import { chromium } from "playwright-core";
const base = `http://localhost:5180/two.html?room=t1&delegate=CPU&auto=1&model=${process.env.MODEL || "lite"}`;
const b = await chromium.launch({ executablePath: process.env.CHROME });
const mk = async (q) => { const p = await (await b.newContext()).newPage(); p.errs = []; p.on("pageerror", e => p.errs.push(String(e))); await p.goto(base + q); return p; };
const viewer = await mk("&noauto=1");           // auto=1 would start a camera; viewer has no video param -> will fail getUserMedia harmlessly
const A = await mk("&role=front&video=test/pose.webm");
const B = await mk("&role=side&video=test/poseB.webm");
await viewer.waitForFunction(() => window.__two.recv.front > 15 && window.__two.recv.side > 15, null, { timeout: 60000 });
await viewer.waitForTimeout(1500);
await viewer.waitForFunction(() => window.__two.fused, null, { timeout: 30000 }).catch(() => {});
console.log(JSON.stringify(await viewer.evaluate(() => window.__two)), A.errs, B.errs, viewer.errs);
console.log(await viewer.locator("#sync").textContent(), "|", await viewer.locator("#conn").textContent(), "|", await viewer.locator("#off").textContent(), await viewer.locator("#rtt").textContent());
await viewer.screenshot({ path: "test/two.png", fullPage: true });
await b.close();
