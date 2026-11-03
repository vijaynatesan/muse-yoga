import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await (await b.newContext()).newPage();
p.on("pageerror", e => console.log("PAGEERR", String(e)));
await p.goto("http://localhost:5180/two.html?room=t9&delegate=CPU&auto=1&video=test/pose.webm");
await p.waitForTimeout(8000);
console.log(JSON.stringify(await p.evaluate(() => ({ t: window.__two, diag: document.getElementById("diag").textContent, vt: document.getElementById("v").currentTime, rs: document.getElementById("v").readyState }))));
await b.close();
