export function csrf(): string {
  const m = document.cookie.match(/muse_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const r = await fetch(path, {
    ...opts,
    headers: { ...(opts.body && !isForm ? { "Content-Type": "application/json" } : {}), "x-csrf-token": csrf(), ...(opts.headers || {}) },
    credentials: "same-origin",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { data, status: r.status });
  return data;
}
export const speak = (text: string) => {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return new Promise<void>((res) => { u.onend = () => res(); u.onerror = () => res(); });
  } catch { return Promise.resolve(); }
};
