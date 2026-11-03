import WebSocket from "ws";
const a = new WebSocket("ws://localhost:5180/ws?room=Demo."), b = new WebSocket("ws://localhost:5180/ws?room=demo");
b.on("open", () => setTimeout(() => a.send(JSON.stringify({ t: "frame" })), 300));
b.on("message", () => { console.log("PASS: 'Demo.' and 'demo' are the same room"); process.exit(); });
setTimeout(() => { console.log("FAIL"); process.exit(1); }, 3000);
