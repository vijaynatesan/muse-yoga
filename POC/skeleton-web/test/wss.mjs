import WebSocket from "ws"; process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const a = new WebSocket("wss://localhost:5181/ws?room=z", { origin: "https://localhost:5181" }), b = new WebSocket("ws://localhost:5180/ws?room=z");
b.on("open", () => setTimeout(() => a.send(JSON.stringify({ t: "frame", role: "front" })), 300));
b.on("message", d => { console.log("http client got frame from https client:", d.toString()); process.exit(); });
setTimeout(() => { console.log("FAIL"); process.exit(1); }, 4000);
