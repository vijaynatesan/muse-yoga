import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream","--use-file-for-media-stream=" + process.argv[2]] });
const p = await (await b.newContext({ permissions: ["camera"] })).newPage();
await p.goto("http://localhost:5180/index.html?auto=1&delegate=CPU");
await p.waitForFunction(() => window.__pose?.frames > 10, null, { timeout: 90000 });
const d = await p.evaluate(() => { const v = document.getElementById("v"); const c = document.createElement("canvas"); c.width=v.videoWidth; c.height=v.videoHeight; c.getContext("2d").drawImage(v,0,0); return { w:v.videoWidth,h:v.videoHeight, url:c.toDataURL("image/png") }; });
console.log(d.w, d.h); (await import("fs")).writeFileSync("test/frame.png", Buffer.from(d.url.split(",")[1], "base64"));
await b.close();
