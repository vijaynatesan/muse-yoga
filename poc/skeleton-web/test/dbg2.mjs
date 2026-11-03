import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await (await b.newContext()).newPage();
p.on("pageerror", e => console.log("PAGEERR", String(e))); p.on("console", m => console.log("CON", m.text().slice(0,150)));
await p.goto("http://localhost:5180/two.html?room=t1");
await p.waitForTimeout(3000); await b.close();
