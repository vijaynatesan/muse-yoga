import { MarkedImage } from "./MarkedImage.js";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import Practice from "./Practice";

type User = { id: string; firstName: string; lastName: string; email: string; isAdmin: boolean };
type Route = "public" | "personal" | "detail" | "favourites" | "create" | "history" | "admin" | "practice" | "edit";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<Route>("public");
  const [origin, setOrigin] = useState<string>("public");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);
  const [practiceAsanaId, setPracticeAsanaId] = useState<string | null>(null);
  const [historySession, setHistorySession] = useState<any>(null);

  useEffect(() => { api("/auth/session").then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="auth-wrap"><div className="card">Loading Muse Yoga…</div></div>;
  if (!user) return <Auth onDone={(u) => { setUser(u); setRoute("public"); }} />;
  if (route === "practice" && practiceAsanaId) return <Practice asanaId={practiceAsanaId} onExit={() => { setRoute(origin === "detail" ? "detail" : (origin as Route)); }} onPickAnother={() => { setPracticeAsanaId(null); setRoute("public"); }} />;
  const goDetail = (a: any, org: string) => { setDetailId(a.id); setOrigin(org); setRoute("detail"); };
  return (
    <div className="page">
      <header className="header">
        <div className="brand display">Muse Yoga</div>
        <nav>
          {(["public", "personal", "favourites", "create", "history"] as Route[]).map((r) => (
            <button key={r} data-nav-create={r === "create" ? "" : undefined} className={route === r ? "on" : ""} onClick={() => setRoute(r)}>{r === "public" ? "Public Library" : r === "personal" ? "My Asanas" : r[0].toUpperCase() + r.slice(1)}</button>
          ))}
          {user.isAdmin && <button className={route === "admin" ? "on" : ""} onClick={() => setRoute("admin")}>Admin</button>}
        </nav>
        <div style={{ flex: 1 }} />
        <span className="chip">{user.firstName} {user.isAdmin ? "· Admin" : ""}</span>
        <button className="btn ghost small" onClick={async () => { await api("/auth/logout", { method: "POST" }); setUser(null); }}>Logout</button>
      </header>
      <main className="main">
        {route === "public" && <Library library="public" onDetail={(a: any) => goDetail(a, "public")} onPractice={(a: any) => { setPracticeAsanaId(a.id); setOrigin("public"); setRoute("practice"); }} />}
        {route === "personal" && <Library library="personal" onDetail={(a: any) => goDetail(a, "personal")} onPractice={(a: any) => { setPracticeAsanaId(a.id); setOrigin("personal"); setRoute("practice"); }} />}
        {route === "detail" && detailId && <Detail id={detailId} isAdmin={user.isAdmin} onEdit={(d: any) => { setEditDraft(d); setRoute("edit"); }} onBack={() => setRoute((origin === "personal" ? "personal" : origin === "favourites" ? "favourites" : "public") as Route)} onPractice={(a: any) => { setPracticeAsanaId(a.id); setRoute("practice"); }} />}
        {route === "favourites" && <Favourites onDetail={(a: any) => goDetail(a, "favourites")} onPractice={(a: any) => { setPracticeAsanaId(a.id); setOrigin("favourites"); setRoute("practice"); }} />}
        {route === "create" && <Create isAdmin={user.isAdmin} onDone={(a: any) => goDetail(a, user.isAdmin ? "public" : "personal")} />}
        {route === "edit" && editDraft && user.isAdmin && <Create key={editDraft.draftId} isAdmin editDraft={editDraft} onDone={(a: any) => { setEditDraft(null); goDetail(a, "public"); }} onCancel={() => { setEditDraft(null); setRoute("detail"); }} />}
        {route === "history" && <History session={historySession} setSession={setHistorySession} />}
        {route === "admin" && user.isAdmin && <Admin />}
      </main>
    </div>
  );
}

function Auth({ onDone }: { onDone: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("");
  const [age, setAge] = useState(""); const [zip, setZip] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [sent, setSent] = useState(false);
  const request = async () => {
    setErr(""); setMsg("");
    try { const d = await api("/auth/otp/request", { method: "POST", body: JSON.stringify({ email, purpose: mode }) }); setMsg(d.message + (d.regOtpUsed ? ` Registration codes used: ${d.regOtpUsed} of ${d.regOtpLimit} (lifetime).` : "")); setSent(true); }
    catch (e: any) { setErr(e.message); }
  };
  const verify = async () => {
    setErr("");
    try { const d = await api("/auth/otp/verify", { method: "POST", body: JSON.stringify({ email, code, purpose: mode, profile: { firstName, lastName, age: age ? Number(age) : null, zip } }) }); onDone(d.user); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="auth-wrap"><div className="auth-card">
      <div className="display" style={{ fontSize: 24, color: "var(--deep)" }}>Muse Yoga</div>
      <h1 className="display">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="sub">{mode === "login" ? "Sign in with your email. We will send you a code — no password, ever." : "Tell us a little about you, then verify your email with a code."}</p>
      <div className="tabs" style={{ marginBottom: 4 }}>
        <button className={`tab ${mode === "login" ? "on" : ""}`} onClick={() => { setMode("login"); setSent(false); }}>Login</button>
        <button className={`tab ${mode === "register" ? "on" : ""}`} onClick={() => { setMode("register"); setSent(false); }}>Register</button>
      </div>
      {mode === "register" && <><label>First name</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} /><label>Last name</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} /><label>Age</label><input type="number" value={age} onChange={(e) => setAge(e.target.value)} /><label>ZIP code</label><input value={zip} onChange={(e) => setZip(e.target.value)} /></>}
      <label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      {!sent ? <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={request}>{mode === "register" ? "Send verification code" : "Send sign-in code"}</button> : <>
        <label>Enter the 6-digit code sent to your email</label><input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" style={{ textAlign: "center", fontSize: 21, fontWeight: 800, letterSpacing: 6 }} />
        <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={verify}>{mode === "register" ? "Create account" : "Verify & sign in"}</button>
        <button className="btn light small" style={{ marginTop: 8 }} onClick={request}>Resend code</button>
      </>}
      {msg && <p className="ok" style={{ marginTop: 10 }}>{msg}</p>}{err && <p className="error" style={{ marginTop: 10 }}>{err}</p>}
      <p style={{ fontSize: 13, color: "var(--ink2)", marginTop: 10 }}>Registration codes: maximum 3 per email, lifetime. Login: 3 wrong codes locks the account for 6 hours; a second lock is permanent.</p>
    </div></div>
  );
}

export function AsanaCard({ a, onDetail, onPractice, extra }: any) {
  return <div className="asana-card">
    {a.steps?.[0]?.imageKey && <img src={`/files/${a.steps[0].imageKey}`} alt={a.name} />}
    <div className="body">
      <h3 className="display" style={{ fontSize: 20 }}>{a.name}</h3>
      {(a.state === "disabled" || a.state === "pending" || a.state === "rejected") && <div>{a.state === "disabled" && <span className="chip">Disabled</span>}{a.state === "pending" && <span className="chip amber">Pending approval</span>}{a.state === "rejected" && <span className="chip red">Rejected</span>}</div>}
      <div className="meta">{a.difficulty} · {a.category} · {a.steps?.length || 0} steps</div>
      <div className="muted" style={{ fontSize: 12.5 }}>{a.submittedByName ? `Submitted by ${a.submittedByName}` : a.library === "personal" ? "Created by you" : "Public Library"}</div>
      {a.state === "rejected" && a.rejectionReason && <div className="note red">Reason: {a.rejectionReason}</div>}
      <div className="row" style={{ marginTop: "auto", paddingTop: 8, flexWrap: "wrap" }}>
        <button className="btn small" style={{ flex: 1 }} onClick={() => onDetail?.(a)}>View</button>
        {onPractice && a.state !== "disabled" && a.state !== "rejected" && <button className="btn ghost small" onClick={() => onPractice(a)}>Practise</button>}
        {extra}
      </div>
    </div>
  </div>;
}

function Library({ library, onDetail, onPractice }: any) {
  const [data, setData] = useState<any>({ items: [], total: 0, pages: 1 });
  const [search, setSearch] = useState(""); const [difficulty, setDifficulty] = useState(""); const [bodyPart, setBodyPart] = useState(""); const [category, setCategory] = useState(""); const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const load = () => { const q = new URLSearchParams({ page: String(page), search, difficulty, bodyPart, category }); api(`/api/${library}?${q}`).then(setData).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, [page, search, difficulty, bodyPart, category]);
  const act = async (a: any, action: string) => { try { await api(`/api/asanas/${a.id}/${action}`, { method: "POST", body: "{}" }); load(); } catch (e: any) { setErr(e.message); } };
  const pub = library === "public";
  return <>
    <div className="pagehead"><div><h2 className="display">{pub ? "Public Library" : "My Asanas"}</h2><p>{pub ? "Asanas for everyone. Search, filter, and start when ready." : "Your personal library. Only you can see these."}</p></div><div className="sp"></div>
      {pub ? <button className="btn" disabled={!data.items.length} onClick={() => data.items[0] && onPractice(data.items[0])}>▶ Start Practice</button> : <button className="btn" onClick={() => document.querySelector<HTMLButtonElement>("[data-nav-create]")?.click()}>+ Create Asana</button>}
    </div>
    <div className="searchbar">
      <input placeholder={pub ? "Search asana name… try “Vrikshasana”" : "Search asana name…"} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search" />
      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="">All difficulties</option>{["Beginner", "Intermediate", "Advanced"].map((x) => <option key={x}>{x}</option>)}</select>
      <select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}><option value="">All body parts</option>{[...new Set(data.items.map((a: any) => a.bodyPart).filter(Boolean))].map((x: any) => <option key={x}>{x}</option>)}</select>
      <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{[...new Set(data.items.map((a: any) => a.category).filter(Boolean))].map((x: any) => <option key={x}>{x}</option>)}</select>
    </div>
    {err && <div className="note red">{err}</div>}
    <div className="grid" style={pub ? undefined : { gridTemplateColumns: "repeat(4,1fr)" }}>{data.items.map((a: any) => <AsanaCard key={a.id} a={a} onDetail={onDetail} onPractice={onPractice} extra={library === "personal" ? <>
      {a.state === "active" && <><button className="btn light small" onClick={() => act(a, "submit")}>Submit</button><button className="btn light small" onClick={() => act(a, "disable")}>Disable</button></>}
      {a.state === "pending" && <button className="btn light small" onClick={() => act(a, "withdraw")}>Withdraw</button>}
      {a.state === "disabled" && <button className="btn light small" onClick={() => act(a, "enable")}>Re-enable</button>}
    </> : null} />)}
    </div>
    {!data.items.length && <div className="note sage">No asanas match your search and filters. <a style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => { setSearch(""); setDifficulty(""); setBodyPart(""); setCategory(""); setPage(1); }}>Clear search &amp; filters</a></div>}
    <div className="pager"><button className="btn light small" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button><span>{data.total} asanas · Page {page} of {data.pages}</span><i className="on"></i><button className="btn light small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button></div>
  </>;
}

function Detail({ id, onBack, onPractice, isAdmin, onEdit }: any) {
  const [a, setA] = useState<any>(null); const [err, setErr] = useState(""); const [fb, setFb] = useState(""); const [fbMsg, setFbMsg] = useState("");
  const [lists, setLists] = useState<any[]>([]); const [editBusy, setEditBusy] = useState(false);
  const load = () => api(`/api/asanas/${id}`).then(setA).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { api("/api/favourites").then(setLists).catch(() => {}); }, []);
  if (err) return <div className="note red">{err}</div>;
  if (!a) return <div className="card">Loading…</div>;
  const submitFb = async () => { try { const d = await api(`/api/asanas/${a.id}/feedback`, { method: "POST", body: JSON.stringify({ feedback: fb }) }); setFbMsg(d.ok ? "Accepted — all steps regenerated. " + d.note || "" : `Rejected (${d.stage}): ${d.reason}`); if (d.ok) load(); } catch (e: any) { setFbMsg(e.message); } };
  return <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
    <div className="pagehead"><button className="btn light" onClick={onBack}>← Back</button><div><h2 className="display">{a.name}</h2><p>{a.library === "public" ? "Public Library" : "My Asanas"}{a.submittedByName ? ` · Submitted by ${a.submittedByName}` : ""}</p></div><div className="sp"></div>
      {lists.length > 0 && <button className="heart" title="Add to a favourites list" onClick={async () => { try { await api(`/api/favourites/${lists[0].id}/items`, { method: "POST", body: JSON.stringify({ asanaId: a.id }) }); setFbMsg(`Added to ${lists[0].name}`); } catch (e: any) { setFbMsg(e.message); } }}>♥</button>}
      {a.isMine && a.state !== "rejected" && a.library !== "public" && <button className="btn ghost" onClick={() => document.getElementById("detail-feedback")?.scrollIntoView()}>Give Feedback</button>}
      {isAdmin && a.library === "public" && <button className="btn ghost" disabled={editBusy} onClick={async () => { setEditBusy(true); try { onEdit(await api(`/api/admin/asanas/${a.id}/edit`, { method: "POST", body: "{}" })); } catch (e: any) { setFbMsg(e.message); } finally { setEditBusy(false); } }}>{editBusy ? "Opening…" : "✎ Edit asana"}</button>}
      {a.state !== "disabled" && a.state !== "rejected" && <button className="btn" onClick={() => onPractice(a)}>▶ Start Practice</button>}
    </div>
    <div className="detail-grid">
      <div className="card" style={{ padding: "24px 26px", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><span className="chip">{a.difficulty}</span><span className="chip">{a.bodyPart}</span><span className="chip">{a.category}</span>{a.state === "pending" && <span className="chip amber">Pending approval</span>}{a.state === "disabled" && <span className="chip">Disabled</span>}{a.state === "rejected" && <span className="chip red">Rejected</span>}</div>
        <h3 style={{ marginTop: 20, fontSize: 19 }}>Benefits</h3>
        <p className="muted" style={{ lineHeight: 1.6, marginTop: 6 }}>{(a.benefits || []).join(". ")}</p>
        <div className="note amber" style={{ marginTop: 18 }}><b>⚠ Cautions — do not practise if you have:</b> {(a.contraindications || []).join(" · ")}</div>
        {a.state === "rejected" && a.rejectionReason && <div className="note red" style={{ marginTop: 12 }}><b>Rejected:</b> {a.rejectionReason}. This asana cannot be edited or resubmitted.</div>}
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 14 }}>These steps and images are stored once and reused in every practice. They are never regenerated, and nothing here can be typed over — corrections go through Feedback only (admins can use Edit asana).</p>
        {lists.length > 1 && <div className="row" style={{ marginTop: 12 }}><span style={{ fontSize: 13, fontWeight: 700 }}>Add to list:</span>{lists.map((l: any) => <button key={l.id} className="btn light small" onClick={async () => { try { await api(`/api/favourites/${l.id}/items`, { method: "POST", body: JSON.stringify({ asanaId: a.id }) }); setFbMsg(`Added to ${l.name}`); } catch (e: any) { setFbMsg(e.message); } }}>{l.name}</button>)}</div>}
        {fbMsg && <div className="note sage" style={{ marginTop: 12 }}>{fbMsg}</div>}
        {a.isMine && a.state !== "rejected" && a.library !== "public" && <div id="detail-feedback" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 19 }}>Request a correction</h3>
          <p className="muted" style={{ fontSize: 13.5, margin: "6px 0" }}>Feedback used: <b>{a.feedbackUsed ?? 0} of 3</b> · remaining {a.feedbackRemaining} (rejected feedback counts too). If accepted, <b>all</b> steps and images are replaced.</p>
          <textarea rows={3} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="One correction per line, about the pose only…" />
          <div className="row" style={{ marginTop: 8 }}><button className="btn" onClick={submitFb}>Submit Feedback</button>{fbMsg && <span>{fbMsg}</span>}</div>
        </div>}
      </div>
      <div className="card" style={{ padding: "24px 26px", overflow: "hidden" }}>
        <h3 style={{ fontSize: 19 }}>Steps <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>· {a.steps?.length || 0} steps · shown in coaching exactly as here</span></h3>
        <div className="steplist">{a.steps.map((s: any) => <div key={s.n} className="steprow"><img src={`/files/${s.imageKey}`} alt={`Step ${s.n}`} /><div><b>Step {s.n} · {s.durationS}s</b><p>{s.instruction}</p></div></div>)}</div>
      </div>
    </div>
  </div>;
}

function Favourites({ onDetail, onPractice }: any) {
  const [lists, setLists] = useState<any[]>([]); const [name, setName] = useState(""); const [err, setErr] = useState(""); const [selId, setSelId] = useState<string | null>(null);
  const load = () => api("/api/favourites").then((ls: any[]) => { setLists(ls); setSelId((cur) => cur && ls.some((l) => l.id === cur) ? cur : ls[0]?.id || null); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const sel = lists.find((l) => l.id === selId) || lists[0];
  return <>
    <div className="pagehead"><div><h2 className="display">Favourites</h2><p>Your lists. Practise one asana at a time — no auto-play.</p></div><div className="sp"></div>
      <input style={{ maxWidth: 220 }} placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn ghost" onClick={async () => { try { await api("/api/favourites", { method: "POST", body: JSON.stringify({ name }) }); setName(""); load(); } catch (e: any) { setErr(e.message); } }}>+ New List</button></div>
    {err && <div className="note red">{err}</div>}
    {lists.length > 0 && <div className="tabs">
      {lists.map((l: any) => <button key={l.id} className={`tab ${sel?.id === l.id ? "on" : ""}`} onClick={() => setSelId(l.id)}>{l.name} ({l.items.length})</button>)}
      <span style={{ flex: 1 }} />
      {sel && <><button className="btn light small" onClick={async () => { const n = prompt("Rename list", sel.name); if (n) { await api(`/api/favourites/${sel.id}`, { method: "PATCH", body: JSON.stringify({ name: n }) }); load(); } }}>Rename</button>
      <button className="btn light small" onClick={async () => { await api(`/api/favourites/${sel.id}`, { method: "DELETE" }); load(); }}>Delete List</button></>}
    </div>}
    {sel ? <>
      <div className="grid">{sel.items.map((a: any) => <AsanaCard key={a.id} a={a} onDetail={onDetail} onPractice={onPractice} extra={<button className="btn light small" onClick={async () => { await api(`/api/favourites/${sel.id}/items/${a.id}`, { method: "DELETE" }); load(); }}>Remove</button>} />)}</div>
      {!sel.items.length && <div className="note sage">No asanas in this list yet. Open an asana and add it from its detail page.</div>}
      <div className="pager"><span>{sel.name} · {sel.items.length} asanas · Page 1 of 1</span><i className="on"></i></div>
      <div className="note sage" style={{ flex: "none" }}>Disabled asanas are automatically hidden here. The same asana cannot be added twice to one list.</div>
    </> : <div className="card">No favourite lists yet. Create one above.</div>}
  </>;
}

// ---- Admin-only step tools (C16). The server enforces admin-only; this UI is just hidden for everyone else. ----
function StepTools({ s, i, draft, run, pending }: any) {
  const [mode, setMode] = useState<"" | "edit" | "insert" | "delete">(""); const [text, setText] = useState(""); const [dur, setDur] = useState(20);
  const total = draft.steps.length, { minSteps, maxSteps } = draft.limits, base = `/api/creation/${draft.draftId}/steps`, off = !!pending;
  const open = (m: "edit" | "insert" | "delete") => { setMode(m); setText(m === "edit" ? s.instruction : ""); setDur(m === "edit" ? s.durationS : 20); };
  return <div style={{ marginTop: 8 }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <button className="btn ghost small" disabled={off} onClick={() => open("edit")}>Edit</button>
      <button className="btn ghost small" disabled={off || i === 0} title="Move up" onClick={() => run(`${base}/${s.sid}/move`, "POST", { dir: "up" }, s.sid)}>↑</button>
      <button className="btn ghost small" disabled={off || i === total - 1} title="Move down" onClick={() => run(`${base}/${s.sid}/move`, "POST", { dir: "down" }, s.sid)}>↓</button>
      <button className="btn ghost small" disabled={off || total >= maxSteps} title={total >= maxSteps ? `At most ${maxSteps} steps` : ""} onClick={() => open("insert")}>+ Insert below</button>
      <button className="btn danger small" disabled={off || total <= minSteps} title={total <= minSteps ? `At least ${minSteps} steps` : ""} onClick={() => open("delete")}>Delete</button>
    </div>
    {mode === "delete" && <div className="note red" style={{ marginTop: 8 }}>Delete step {i + 1} only? The other steps stay and shift up.{" "}
      <button className="btn danger small" disabled={off} onClick={async () => { if (await run(`${base}/${s.sid}`, "DELETE", undefined, s.sid)) setMode(""); }}>Yes, delete</button>{" "}
      <button className="btn ghost small" onClick={() => setMode("")}>Cancel</button></div>}
    {(mode === "edit" || mode === "insert") && <div style={{ marginTop: 8 }}>
      <label style={{ marginTop: 0 }}>{mode === "edit" ? `Step ${i + 1} instruction` : `New step after step ${i + 1}`}</label>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Raise both arms overhead and join the palms." />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>Seconds</span><input type="number" min={1} max={600} value={dur} onChange={(e) => setDur(Number(e.target.value))} style={{ width: 84 }} />
        <button className="btn small" disabled={off || text.trim().length < 5} onClick={async () => { const ok = mode === "edit" ? await run(`${base}/${s.sid}`, "PATCH", { instruction: text, durationS: dur }, s.sid) : await run(base, "POST", { afterSid: s.sid, instruction: text, durationS: dur }, s.sid); if (ok) setMode(""); }}>{mode === "edit" ? "Save" : "Add step"}</button>
        <button className="btn ghost small" onClick={() => setMode("")}>Cancel</button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{mode === "edit" ? (s.imageKey ? "Changing the text marks this step's image as stale — regenerate it afterwards." : "") : "The new step has no image yet — generate it after adding."} The text is checked to be a genuine yoga instruction.</p>
    </div>}
  </div>;
}
function ImageTools({ s, draft, run, pending }: any) {
  const [adj, setAdj] = useState(s.imageNote || "");
  const [open, setOpen] = useState(false);
  const mine = pending === s.sid;
  const MAX = 1500;
  const go = (note: string | undefined) => run(`/api/creation/${draft.draftId}/steps/${s.sid}/image`, "POST", note === undefined ? {} : { adjustment: note }, s.sid);
  return <div style={{ marginTop: 8 }}>
    {s.imageCheck && !s.imageCheck.ok && <div className="note" style={{ fontSize: 12.5, marginBottom: 6, background: "#FFF1D6", color: "#6b4600" }} role="status"><b>Automatic check:</b> this picture may still differ from your note.<ul style={{ margin: "4px 0 0 16px", padding: 0 }}>{s.imageCheck.problems.map((p: string, k: number) => <li key={k}>{p}</li>)}</ul>Add more detail in <b>Adjust image…</b> and regenerate if needed.</div>}
    {s.imageCheck?.ok && <p style={{ fontSize: 12.5, margin: "0 0 6px", color: "#2f6b45" }}>✓ Automatic check: matches your note.</p>}
    {s.imageNote && <p className="muted" style={{ fontSize: 12.5, margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.imageNote}>Adjustment: {s.imageNote}</p>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn ghost small" disabled={!!pending} onClick={() => { setAdj(s.imageNote || adj); setOpen(true); }}>✎ Adjust image…</button>
      <button className="btn small" disabled={!!pending} onClick={() => go(undefined)}>{mine ? "Regenerating & checking… (up to ~1–2 min)" : s.imageKey ? "Regenerate image" : "Generate image"}</button>
    </div>
    {open && <div className="modal" onClick={() => setOpen(false)}><div className="box" onClick={(e) => e.stopPropagation()}>
      <h3 style={{ margin: 0 }}>Adjust the image for step {s.n}</h3>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Describe exactly what the picture should show. This is applied as a mandatory correction when the image is regenerated.</p>
      <textarea autoFocus rows={9} maxLength={MAX} value={adj} onChange={(e) => setAdj(e.target.value)} placeholder="e.g. Show her standing on one leg, right foot pressed high on the inner left thigh with the knee pointing out to the side, both hands joined at the chest." style={{ width: "100%", fontSize: 16, lineHeight: 1.45, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>{adj.length} / {MAX}</span><span style={{ flex: 1 }}></span>
        <button className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn ghost small" disabled={!!pending} onClick={() => { setAdj(""); setOpen(false); go(""); }}>Clear note &amp; regenerate</button>
        <button className="btn small" disabled={!!pending || !adj.trim()} onClick={() => { setOpen(false); go(adj); }}>Regenerate with this note</button>
      </div>
    </div></div>}
  </div>;
}
const badge = (st: string) => st === "stale" ? <span className="chip" style={{ background: "#FFF1D6", color: "#8a5a00" }}>Stale — regenerate</span> : st === "failed" ? <span className="chip" style={{ background: "#FBE3DE", color: "#a3361f" }}>Failed — retry</span> : st === "none" ? <span className="chip">No image yet</span> : null;

function DetailsEditor({ draft, run, pending }: any) {
  const [v, setV] = useState({ name: draft.name || "", difficulty: draft.difficulty || "", bodyPart: draft.bodyPart || "", category: draft.category || "", benefits: (draft.benefits || []).join("\n"), contraindications: (draft.contraindications || []).join("\n") });
  const [open, setOpen] = useState(false); const [saved, setSaved] = useState("");
  const set = (k: string) => (e: any) => { setSaved(""); setV((p) => ({ ...p, [k]: e.target.value })); };
  return <div className="card" style={{ padding: "14px 16px", marginBottom: 10, background: "var(--soft)" }}>
    <div className="row"><b>Details</b><span className="muted" style={{ fontSize: 13 }}>{draft.name} · {draft.difficulty} · {draft.bodyPart} · {draft.category}</span><span className="sp"></span><button className="btn ghost small" onClick={() => setOpen(!open)}>{open ? "Hide" : "Edit details"}</button></div>
    {open && <div style={{ marginTop: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
        <div><label style={{ marginTop: 0 }}>Name</label><input value={v.name} onChange={set("name")} /></div>
        <div><label style={{ marginTop: 0 }}>Difficulty</label><input value={v.difficulty} onChange={set("difficulty")} placeholder="Beginner / Intermediate / Advanced" /></div>
        <div><label style={{ marginTop: 0 }}>Body part</label><input value={v.bodyPart} onChange={set("bodyPart")} /></div>
        <div><label style={{ marginTop: 0 }}>Category</label><input value={v.category} onChange={set("category")} /></div>
      </div>
      <label>Benefits (one per line)</label><textarea rows={3} value={v.benefits} onChange={set("benefits")} />
      <label>Cautions — do not practise if you have (one per line)</label><textarea rows={3} value={v.contraindications} onChange={set("contraindications")} />
      <div className="row" style={{ marginTop: 8 }}><button className="btn small" disabled={!!pending} onClick={async () => { if (await run(`/api/creation/${draft.draftId}/details`, "PATCH", { ...v, benefits: v.benefits.split("\n"), contraindications: v.contraindications.split("\n") }, "details")) setSaved("Details updated in this draft ✓"); }}>Update details</button>{saved && <span className="ok">{saved}</span>}</div>
    </div>}
  </div>;
}
function Create({ onDone, isAdmin, editDraft, onCancel }: any) {
  const [chars, setChars] = useState<any[]>([]); const [name, setName] = useState(""); const [characterId, setCharacterId] = useState("char-boy");
  const [draft, setDraft] = useState<any>(editDraft || null); const [images, setImages] = useState<any>(editDraft ? { edit: true } : null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(""); const [fb, setFb] = useState(""); const [fbMsg, setFbMsg] = useState(""); const [pending, setPending] = useState("");
  useEffect(() => { api("/api/characters").then((c: any[]) => { setChars(c); if (c[0]) setCharacterId(c[0].id); }); }, []);
  const start = async () => { setErr(""); setBusy("Generating steps… (~6 s with AI)"); try { const d = await api("/api/creation/start", { method: "POST", body: JSON.stringify({ name, characterId }) }); setDraft(d); } catch (e: any) { setErr(e.message); } finally { setBusy(""); } };
  const genImages = async () => { setErr(""); setBusy("Generating images per step… (11–35 s each with AI)"); try { const d = await api(`/api/creation/${draft.draftId}/images`, { method: "POST", body: "{}" }); setDraft((p: any) => ({ ...p, ...d.draft })); setImages(d); } catch (e: any) { if (e.data?.draft) setDraft((p: any) => ({ ...p, ...e.data.draft })); setErr(e.message + " Nothing was saved yet — you can retry."); } finally { setBusy(""); } };
  // one admin mutation: call the server, replace the draft with the returned view, show any error (e.g. intent check)
  const run = async (url: string, method: string, body: any, sid: string) => { setErr(""); setPending(sid); try { const d = await api(url, { method, body: body ? JSON.stringify(body) : undefined }); setDraft((p: any) => ({ ...p, ...(d.draft || d) })); return true; } catch (e: any) { if (e.data?.draft) setDraft((p: any) => ({ ...p, ...e.data.draft })); setErr(e.message); return false; } finally { setPending(""); } };
  const wizNow = !draft ? 1 : !images ? 3 : 5;
  const wizSteps = ["Name & character", "Checks", "Review steps", "Generate images", "Review & feedback", "Save"];
  const missing = draft ? draft.steps.filter((s: any) => s.imageStatus !== "fresh").length : 0;
  return <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, overflow: "hidden" }}>
    <div className="pagehead"><div><h2 className="display">{draft?.editOf ? `Edit ${draft.name}` : "Create Asana"}</h2><p>{draft?.editOf ? "Changes are saved to the Public Library only when you click Save changes. Nothing is published until then." : isAdmin ? "AI creates the steps and images. As admin you can also edit, add, delete and reorder steps, and adjust images." : "AI creates the steps and images. You review — nothing is typed by hand."}</p></div></div>
    <div className="wizard">
      <aside className="card wiznav">
        {draft?.editOf ? <><div className="st now"><span className="n">✎</span>Editing a public asana</div><p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>Edit the details, then each step's text, duration, order and image. Edited steps get a stale image — regenerate them before saving. Practice history keeps the images it was recorded with.</p><button className="btn danger" onClick={async () => { if (!window.confirm("Discard all unsaved changes?")) return; try { await api(`/api/creation/${draft.draftId}`, { method: "DELETE" }); } catch {} onCancel?.(); }}>Discard changes</button></> : wizSteps.map((s, i) => <div key={s} className={`st ${wizNow === i + 1 ? "now" : wizNow > i + 1 ? "done" : ""}`}><span className="n">{wizNow > i + 1 ? "✓" : i + 1}</span>{s}</div>)}
        {!draft?.editOf && <div className="note sage" style={{ marginTop: 16 }}>As an <b>admin</b> your asana goes to the Public Library. As a regular user it goes to My Asanas, and must exist in a reference book.</div>}
      </aside>
      <div className="card wizmain">
        {!draft ? <>
          <h2 className="display" style={{ fontSize: 29, marginBottom: 8 }}>Name &amp; character</h2>
          <div style={{ maxWidth: 480 }}><label>Asana name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bhujangasana" /></div>
          <label>Choose your character — default characters first. The same character appears in every step.</label>
          <div className="chargrid">{chars.map((c: any) => <button key={c.id} className={`charpick ${characterId === c.id ? "sel" : ""}`} onClick={() => setCharacterId(c.id)}><img src={`/files/${c.imageKey}`} alt={c.name} /><span>{c.name} · {c.isDefaultFolder ? "Default" : c.folder}</span></button>)}</div>
          {err && <div className="note red">{err}</div>}
          <div className="flowfoot"><span className="muted" style={{ fontSize: 13.5 }}>{isAdmin ? "You can edit the generated steps in the next screen." : "You cannot choose the number of steps or edit instructions."}</span><span className="sp"></span><button className="btn" onClick={start} disabled={!name || !!busy}>{busy ? "Checking…" : "Check & Generate Steps →"}</button></div>
        </> : !images ? <>
          <h2 className="display" style={{ fontSize: 29, marginBottom: 8 }}>Review steps <span className="chip">{draft.difficulty}</span> <span className="chip">{draft.bodyPart}</span> <span className="chip">{draft.category}</span>{isAdmin && <span className="chip">{draft.steps.length} steps · {draft.limits.minSteps}–{draft.limits.maxSteps} allowed</span>}</h2>
          {draft.adminNote && <div className="note amber">{draft.adminNote}</div>}
          <div className="wizscroll"><div className="steplist">{draft.steps.map((s: any, i: number) => <div key={s.sid} className="steprow" style={{ alignItems: "flex-start" }}><div style={{ flex: 1 }}><b>Step {i + 1} · {s.durationS}s</b> {isAdmin && badge(s.imageStatus === "fresh" ? "" : s.imageStatus === "none" ? "" : s.imageStatus)}<p>{s.instruction}</p>{isAdmin && <StepTools s={s} i={i} draft={draft} run={run} pending={pending} />}</div></div>)}</div>
          {isAdmin && <button className="btn ghost small" style={{ marginTop: 10 }} disabled={!!pending || draft.steps.length >= draft.limits.maxSteps} onClick={() => { const t = window.prompt("New first step — instruction:"); if (t) run(`/api/creation/${draft.draftId}/steps`, "POST", { afterSid: null, instruction: t, durationS: 20 }, "first"); }}>+ Add a step at the start</button>}
          <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>{isAdmin ? "Edits here are admin-only. Image edits and corrections are available after images are generated." : "Read-only. To change anything, use Feedback after images are generated."}</p></div>
          {err && <div className="note red">{err}</div>}
          <div className="flowfoot"><span className="sp"></span><button className="btn" onClick={genImages} disabled={!!busy || !!pending}>{busy ? "Generating images…" : "Generate Images →"}</button></div>
          {busy && <><div className="progress"><i style={{ width: "40%" }}></i></div><p className="muted" style={{ fontSize: 13.5 }}>One image per step with your character, checked automatically (same character? one head, two arms, two legs? pose matches?). This usually takes 1–2 minutes with real AI — please keep this tab open.</p></>}
        </> : <>
          <h2 className="display" style={{ fontSize: 29, marginBottom: 8 }}>Review your asana{isAdmin && <span className="chip" style={{ marginLeft: 8 }}>{draft.steps.length} steps · {draft.limits.minSteps}–{draft.limits.maxSteps} allowed</span>}</h2>
          <div className="wizscroll">
          {draft.editOf && <DetailsEditor key={draft.name + draft.difficulty} draft={draft} run={run} pending={pending} />}
          <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "repeat(auto-fill,minmax(270px,1fr))" : "repeat(4,1fr)", gap: 11, margin: "12px 0" }}>{draft.steps.map((s: any, i: number) => <div key={s.sid} style={isAdmin ? { border: "1px solid var(--line)", borderRadius: 14, padding: 10, background: "var(--soft)" } : undefined}>
            {s.imageKey ? <img key={s.imageKey} src={`/files/${s.imageKey}`} alt={`Step ${i + 1}`} style={{ width: "100%", height: isAdmin ? 190 : 104, objectFit: isAdmin ? "contain" : "cover", background: "#fff", borderRadius: 12, opacity: s.imageStatus === "stale" ? 0.5 : 1 }} /> : <div style={{ height: isAdmin ? 190 : 104, borderRadius: 12, background: "#fff", border: "1px dashed var(--line)", display: "grid", placeItems: "center", fontSize: 13 }} className="muted">No image yet</div>}
            <div style={{ fontSize: 12, marginTop: 4 }}><b>Step {i + 1}</b> · {s.durationS}s {badge(s.imageStatus)}</div>
            {isAdmin && <><p style={{ fontSize: 13, margin: "4px 0" }}>{s.instruction}</p><ImageTools key={s.sid + (s.imageNote || "")} s={s} draft={draft} run={run} pending={pending} /><StepTools s={s} i={i} draft={draft} run={run} pending={pending} /></>}
          </div>)}</div>
          <p className="muted" style={{ fontSize: 13.5 }}>Check every image: same character, 1 head / 2 arms / 2 legs, pose matches the step.</p>
          {!isAdmin && <div className="note sage">Happy with it? Accept below — or request a correction. Each request replaces <b>all</b> steps and images.</div>}
          {isAdmin && !draft.editOf && <div className="note sage">Happy with it? Accept below. Use the tools on each step to adjust it, or request a whole-asana correction — that replaces <b>all</b> steps and images.</div>}
          {!draft.editOf && <>          <label>Request a correction (pose corrections only, one per line)</label>
          <textarea rows={2} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="e.g. In step 2, palms should be beside the ears, not the shoulders" /></>}
          {fbMsg && <div className={fbMsg.startsWith("Accepted") ? "note sage" : "note red"} style={{ marginTop: 10 }}>{fbMsg}</div>}
          </div>
          {err && <div className="note red">{err}</div>}
          {draft.blocked && <div className="note amber">{draft.blocked}</div>}
          <div className="flowfoot">{!draft.editOf && <button className="btn ghost" onClick={async () => { try { const d = await api(`/api/creation/${draft.draftId}/feedback`, { method: "POST", body: JSON.stringify({ feedback: fb }) }); setFbMsg(d.ok ? "Accepted — all steps regenerated. Generate images again to review." : `Rejected (${d.stage}): ${d.reason}`); if (d.ok) { setDraft((p: any) => ({ ...p, ...d.draft })); setImages(null); } } catch (e: any) { setFbMsg(e.message); } }}>Submit Feedback</button>}
            {missing > 0 && <button className="btn light" onClick={genImages} disabled={!!busy || !!pending}>{busy ? "Generating…" : `Generate ${missing} missing/stale image${missing > 1 ? "s" : ""}`}</button>}
            <span className="sp"></span><button className="btn" disabled={!!draft.blocked || !!pending || !!busy} onClick={async () => { try { const a = await api(`/api/creation/${draft.draftId}/accept`, { method: "POST", body: "{}" }); onDone(a); } catch (e: any) { setErr(e.message); } }}>{draft.editOf ? "Save changes →" : "Accept & Save →"}</button></div>
        </>}
      </div>
    </div>
  </div>;
}

/** Blurred photos of one step: one per camera in newer sessions; a single photoKey in older ones. */
const photosOf = (s: any): Array<{ label: string; key: string }> => s?.photos?.length ? s.photos : s?.photoKey ? [{ label: "Photo", key: s.photoKey }] : [];
function History({ session, setSession }: any) {
  const [rows, setRows] = useState<any[]>([]); const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); const [day, setDay] = useState<string | null>(null);
  const [large, setLarge] = useState<any>(null);
  useEffect(() => { api("/api/history").then(setRows).catch(() => {}); }, []);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.date.slice(0, 10), (counts.get(r.date.slice(0, 10)) || 0) + 1);
  const dayRows = day ? rows.filter((r) => r.date.slice(0, 10) === day) : [];
  const monthName = new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const shiftMonth = (d: number) => { const dt = new Date(y, m - 1 + d, 1); setMonth(dt.toISOString().slice(0, 7)); setDay(null); setSession(null); };
  const dayTitle = day ? new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "Select a day";
  return <>
    <div className="pagehead"><div><h2 className="display">Practice History</h2><p>Your practice, day by day. Text, marked character images and your blurred photos (only you can see them) are kept.</p></div><div className="sp"></div>
      <button className="btn light small" onClick={() => shiftMonth(-1)}>← Prev</button><span className="chip">{monthName}</span><button className="btn light small" onClick={() => shiftMonth(1)}>Next →</button></div>
    {!session ? <div className="hist-grid">
      <div className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column" }}>
        <div className="cal">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <div key={d} className="dow">{d}</div>)}
          {Array.from({ length: firstDow }, (_, i) => <span key={`b${i}`}></span>)}
          {Array.from({ length: daysInMonth }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, "0")}`; const c = counts.get(d) || 0; return <button key={d} className={`day ${day === d ? "sel" : ""}`} onClick={() => setDay(d)}>{i + 1}{c > 0 && <><span className="dot"></span><span className="cnt">{c} session{c > 1 ? "s" : ""}</span></>}</button>; })}
        </div>
        <p className="muted" style={{ fontSize: 13, paddingTop: 12, flex: "none" }}>● = you practised · this month fits one screen</p>
      </div>
      <div className="card" style={{ padding: "20px 22px", overflow: "hidden" }}>
        <h3 className="display" style={{ fontSize: 21 }}>{dayTitle}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {dayRows.map((r: any) => <div key={r.id} className="note sage" style={{ cursor: "pointer" }} onClick={() => api(`/api/history/${r.id}`).then(setSession)}><b>{new Date(r.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {r.asanaName}</b><br />{r.steps.filter((s: any) => s.verdict === "correct").length} of {r.steps.length} steps correct — tap for full detail</div>)}
          {day && !dayRows.length && <div className="note sage">No practice on this day yet. Days with a ● mark are days you practised.</div>}
          {!day && <div className="note sage">Pick a day on the calendar to see its sessions.</div>}
        </div>
        {dayRows[0]?.steps?.find((s: any) => s.verdict === "incorrect") && <>
          <div className="step-img" style={{ marginTop: 12 }}><img src={`/files/${dayRows[0].steps.find((s: any) => s.verdict === "incorrect").imageKey}`} alt="Annotated character image from history" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 13 }} /></div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 9 }}>Annotated character image — stored in history. Your own photos never appear here.</p>
        </>}
      </div>
    </div> : <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div className="pagehead"><button className="btn light" onClick={() => setSession(null)}>← Calendar</button><div><h2 className="display">Your Results — {session.asanaName}</h2><p>{new Date(session.startedAt).toLocaleString()} · Read aloud on your Primary. No score — each step is correct, or needs a correction.</p></div></div>
      <div className="listrows">{session.steps.map((s: any) => <button key={s.n} className="resultstep" onClick={() => setLarge(s)}><div className="step-img"><img src={`/files/${s.imageKey || s.annotatedKey}`} alt={`Step ${s.n}`} style={{ objectFit: "contain", background: "var(--soft)" }} /></div>{photosOf(s).map((p: any, k: number) => <span key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}><img className="shotthumb" src={`/files/${p.key}`} alt={`${p.label} photo, step ${s.n} (blurred)`} /><span className="muted" style={{ fontSize: 11.5 }}>{p.label}</span></span>)}<div><div className={`verdict ${s.verdict === "correct" ? "ok" : s.verdict === "incorrect" ? "no" : "mid"}`}>{s.verdict === "correct" ? "✓" : s.verdict === "incorrect" ? "✕" : "–"} Step {s.n} — {s.verdict === "correct" ? "Correct" : s.verdict === "incorrect" ? "Needs correction" : "Could not check"}</div><p className="muted" style={{ lineHeight: 1.6, marginTop: 5 }}>{s.correctionText}</p></div>{(s.marks || []).length > 0 && <span className="chip clay" style={{ flex: "none" }}>Annotated character image</span>}<span className="tap">View large →</span></button>)}</div>
      <div className="flowfoot"><span className="muted" style={{ fontSize: 13.5 }}>Photos are blurred (background and face) before they are saved, and only you can see them.</span><span className="sp"></span>{session.steps.some((s: any) => photosOf(s).length) && <button className="btn danger small" onClick={async () => { if (!window.confirm("Delete the saved photos of this session? This cannot be undone.")) return; try { await api(`/api/history/${session.id}/photos`, { method: "DELETE" }); const fresh = await api(`/api/history/${session.id}`); setSession(fresh); setRows((rs: any[]) => rs.map((x: any) => x.id === fresh.id ? { ...x, steps: fresh.steps } : x)); } catch {} }}>Delete saved photos</button>}</div>
    </div>}
    {large && session && <div className="modal" onClick={() => setLarge(null)}><div className="box" onClick={(e) => e.stopPropagation()}>
      <h3 className="display">Step {large.n} — {large.verdict === "correct" ? "Correct" : large.verdict === "incorrect" ? "Needs correction" : "Could not check"}</h3>
      <div className="bigpair"><MarkedImage src={`/files/${large.imageKey || large.annotatedKey}`} marks={large.marks} alt="Annotated character image" />{photosOf(large).map((p: any, k: number) => <figure className="shotfig" key={k}><img src={`/files/${p.key}`} alt={`${p.label} photo, step ${large.n} (blurred)`} /><figcaption>{p.label} camera — background and face blurred</figcaption></figure>)}</div>
      <p>{large.correctionText}</p>
      <p className="muted" style={{ fontSize: 12.5 }}>Numbered circles are drawn on the stored character image. Your photo is blurred (background and face) before it is saved; only you can see it.</p>
      <div className="flowfoot"><button className="btn ghost small" disabled={large.n <= 1} onClick={() => setLarge(session.steps[large.n - 2])}>← Prev step</button><button className="btn ghost small" disabled={large.n >= session.steps.length} onClick={() => setLarge(session.steps[large.n])}>Next step →</button><span className="sp"></span><button className="btn small" onClick={() => setLarge(null)}>Close</button></div>
    </div></div>}
  </>;
}

function Admin() {
  const [tab, setTab] = useState<"sub" | "up" | "limits" | "audit">("sub");
  const [subs, setSubs] = useState<any[]>([]); const [settings, setSettings] = useState<any>({}); const [auditRows, setAuditRows] = useState<any[]>([]); const [aiRows, setAiRows] = useState<any[]>([]); const [books, setBooks] = useState<any[]>([]); const [msg, setMsg] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const load = () => { api("/api/admin/submissions").then(setSubs); api("/api/admin/settings").then(setSettings); api("/api/admin/audit").then(setAuditRows); api("/api/admin/ai-calls").then(setAiRows); api("/api/admin/reference").then(setBooks); };
  useEffect(() => { load(); }, []);
  const upload = async (kind: string, file: File) => { const fd = new FormData(); fd.append("file", file); const r = await fetch(`/api/admin/${kind}`, { method: "POST", body: fd, credentials: "same-origin", headers: { "x-csrf-token": document.cookie.match(/muse_csrf=([^;]+)/)?.[1] || "" } }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Upload failed"); return d; };
  return <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, flex: 1 }}>
    <div className="pagehead"><div><h2 className="display">Admin Panel</h2><p>Approvals, public asanas, characters, reference books, and limits.</p></div></div>
    <div className="tabs">
      <button className={`tab ${tab === "sub" ? "on" : ""}`} onClick={() => setTab("sub")}>Submissions</button>
      <button className={`tab ${tab === "up" ? "on" : ""}`} onClick={() => setTab("up")}>Characters &amp; PDFs</button>
      <button className={`tab ${tab === "limits" ? "on" : ""}`} onClick={() => setTab("limits")}>Limits &amp; Settings</button>
      <button className={`tab ${tab === "audit" ? "on" : ""}`} onClick={() => setTab("audit")}>Audit &amp; AI Calls</button>
    </div>
    {msg && <div className="note sage" style={{ marginBottom: 12 }}>{msg}</div>}
    <div className="card" style={{ flex: 1, minHeight: 0, padding: "20px 24px", overflow: "hidden" }}>
      {tab === "sub" && <>
        {!subs.length && <p className="muted">No pending submissions.</p>}
        <table className="tbl"><thead><tr><th>Asana</th><th>Steps</th><th>Rejection reason (required to reject)</th><th></th></tr></thead><tbody>
          {subs.map((a: any) => <tr key={a.id}><td><b>{a.name}</b></td><td>{a.steps?.length}</td><td><input style={{ maxWidth: 260 }} placeholder="Reason shown to the owner" value={reason[a.id] || ""} onChange={(e) => setReason({ ...reason, [a.id]: e.target.value })} /></td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}><button className="btn small" onClick={async () => { await api(`/api/asanas/${a.id}/approve`, { method: "POST", body: "{}" }); setMsg(`Approved ${a.name} — moved to Public Library`); load(); }}>Approve</button> <button className="btn light small" onClick={async () => { try { await api(`/api/asanas/${a.id}/reject`, { method: "POST", body: JSON.stringify({ reason: reason[a.id] || "" }) }); setMsg(`Rejected ${a.name}`); load(); } catch (e: any) { setMsg(e.message); } }}>Reject…</button></td></tr>)}
        </tbody></table>
      </>}
      {tab === "up" && <>
        <p className="muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>Default-folder characters are offered first when creating an asana. Only admins can add characters or reference books.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><label>Upload character image</label><input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { await upload("characters", f); setMsg("Character uploaded"); load(); } catch (err: any) { setMsg(err.message); } } }} /></div>
          <div><label>Upload reference PDF</label><input type="file" accept="application/pdf" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { const b = await upload("reference", f); setMsg(`PDF ${b.status}: ${b.title}`); load(); } catch (err: any) { setMsg(err.message); } } }} /></div>
        </div>
        <table className="tbl" style={{ marginTop: 16 }}><thead><tr><th>Reference book</th><th>Status</th><th></th></tr></thead><tbody>
          {books.map((b: any) => <tr key={b.id}><td><b>{b.title}</b></td><td><span className={`chip ${b.status === "failed" ? "red" : b.status === "ready" ? "" : "amber"}`}>{b.status === "ready" ? "● Ready" : b.status === "failed" ? "✕ Failed" : "◌ Processing"}</span></td><td>{b.failReason}</td></tr>)}
        </tbody></table>
      </>}
      {tab === "limits" && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, maxWidth: 760 }}>
          {Object.keys(settings).map((k) => <div key={k}><label>{k}</label><input type="number" value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })} /></div>)}
        </div>
        <button className="btn" style={{ marginTop: 16 }} onClick={async () => { await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) }); setMsg("Limits saved. Behaviour changes without code changes."); load(); }}>Save Limits</button>
        <p className="muted" style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.6 }}>Admin emails themselves live in the app config file — they are not managed here. There is no user management.</p>
      </>}
      {tab === "audit" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div><h3 style={{ fontSize: 17, marginBottom: 10 }}>Audit log</h3><table className="tbl"><tbody>{auditRows.slice(0, 10).map((r: any) => <tr key={r.id}><td>{r.at?.slice(0, 19)}<br /><span className="muted">{r.actor} · {r.action} · {r.subject}</span></td></tr>)}</tbody></table></div>
        <div><h3 style={{ fontSize: 17, marginBottom: 10 }}>AI calls</h3><table className="tbl"><tbody>{aiRows.slice(0, 10).map((r: any) => <tr key={r.id}><td>{r.model} · {r.purpose}<br /><span className="muted">{r.ms}ms{r.mode ? ` · ${r.mode}` : ""}{r.gate ? ` · gate ${r.gate}` : ""}</span></td></tr>)}</tbody></table></div>
      </div>}
    </div>
  </div>;
}
