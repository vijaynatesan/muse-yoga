import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME });
const mk = async (q) => { const p = await (await b.newContext()).newPage(); p.on("pageerror", e => console.log("PAGEERR", String(e))); await p.goto("http://localhost:5180/two.html?room=t8&delegate=CPU&auto=1" + q); return p; };
const A = await mk("&role=front&video=test/pose.webm"), B = await mk("&role=side&video=test/poseB.webm");
await A.waitForTimeout(12000);
for (const p of [A, B]) console.log(JSON.stringify(await p.evaluate(() => ({ t: window.__two, diag: document.getElementById("diag").textContent }))));
await b.close();
