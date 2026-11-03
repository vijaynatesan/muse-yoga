// Shared WS/API contracts (design §6.1). Runtime validators are hand-rolled to
// keep the schema check explicit: clients can never fabricate server events.
export type ClientMsgType = "join" | "claimPrimary" | "switchPrimary" | "enableState" | "demoControl" | "readyClicked" | "frameState" | "captureBlob" | "voiceText" | "promptDone" | "rtc" | "ping" | "endSession" | "startDemo" | "beginStep" | "setFraming";
export type ServerMsgType = "state" | "roleChanged" | "captureAt" | "count" | "demoStep" | "voiceWindow" | "voiceDecision" | "deviceOffline" | "framing" | "analysing" | "results" | "error" | "pong" | "rtc" | "job" | "spoken";

const CLIENT_TYPES = new Set<string>(["join","claimPrimary","switchPrimary","enableState","demoControl","readyClicked","frameState","captureBlob","voiceText","promptDone","rtc","ping","endSession","startDemo","beginStep","setFraming"]);

export function validateClientMessage(raw: unknown): { ok: true; msg: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Message must be an object" };
  const m = raw as Record<string, unknown>;
  if (typeof m.type !== "string" || !CLIENT_TYPES.has(m.type)) return { ok: false, error: "Unknown or server-only message type" };
  if (m.type === "captureAt" || m.type === "results" || m.type === "roleChanged") return { ok: false, error: "Server-originated event cannot be fabricated" };
  return { ok: true, msg: m };
}

export const FORBIDDEN_HISTORY_FIELDS = ["photo", "photoData", "audio", "audioData", "transcript", "userPhoto", "imageBytes"];
