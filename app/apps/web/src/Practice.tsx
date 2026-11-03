import { createPose, drawSkeleton, type PoseEngine } from "./skeleton";
import { createPrivacyEngine, type PrivacyEngine } from "./privacy";
import { MarkedImage } from "./MarkedImage.js";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

// Practice flow (design §4.4): SETUP -> DISCLAIMER -> DEMO -> START -> per-step
// VOICE -> LISTENING -> COUNT x3 -> ANALYSING -> RESULTS.
// Only the Start screen has a click. After Start, every step is voice-only.
export default function Practice({ asanaId, onExit, onPickAnother }: { asanaId: string; onExit: () => void; onPickAnother: () => void }) {
  const [asana, setAsana] = useState<any>(null);
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [state, setState] = useState<any>(null);
  const [screen, setScreen] = useState<"setup" | "disclaimer" | "demo" | "coach" | "results">("setup");
  const [ticked, setTicked] = useState(false);
  const [err, setErr] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [micErr, setMicErr] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [holdUntil, setHoldUntil] = useState(0);
  const [holdLeft, setHoldLeft] = useState(0);
  useEffect(() => {
    if (!holdUntil) { setHoldLeft(0); return; }
    const t = setInterval(() => setHoldLeft(Math.max(0, Math.ceil((holdUntil - Date.now()) / 1000))), 200);
    return () => clearInterval(t);
  }, [holdUntil]);
  const [analysingStep, setAnalysingStep] = useState(0);
  const [demoIdx, setDemoIdx] = useState(0);
  const [demoPaused, setDemoPaused] = useState(false);
  const [large, setLarge] = useState<any>(null);
  const [inView, setInView] = useState(true);
  // Skeleton view: the camera feed is analysed on-device and only a skeleton on white is shown; framing comes from the same detection.
  const skelRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const [skelFallback, setSkelFallback] = useState(false);   // pose model unavailable -> show the plain camera instead
  const [skelReady, setSkelReady] = useState(false);
  const [forceOut, setForceOut] = useState(false);
  // Shutter: blades sweep across the skeleton pane + a synthesized click, at the instant the photo is taken.
  const [shutter, setShutter] = useState(0);
  // Results-page photos: blurred ON THIS DEVICE (background + face), kept only in this component's memory, never uploaded or stored.
  const [shots, setShots] = useState<Record<number, string>>({});
  const privacyRef = useRef<PrivacyEngine | null>(null);
  const makeShot = async (step: number, c: HTMLCanvasElement) => {
    try { if (!privacyRef.current) privacyRef.current = await createPrivacyEngine(); const url = privacyRef.current.blur(c, c.width, c.height); setShots((p) => ({ ...p, [step]: url })); } catch { /* no thumbnail rather than an unblurred one */ }
  };
  const [captured, setCaptured] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const unlockAudio = () => { try { const AC: any = window.AudioContext || (window as any).webkitAudioContext; if (!audioRef.current && AC) audioRef.current = new AC(); audioRef.current?.resume?.(); } catch {} };
  const playShutter = () => {
    try {
      unlockAudio(); const ctx = audioRef.current; if (!ctx) return; const t = ctx.currentTime;
      const click = (at: number, freq: number, dur: number, gain: number) => {          // decaying noise burst through a band-pass = mechanical click
        const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.1;
        const g = ctx.createGain(); g.gain.value = gain; src.connect(bp); bp.connect(g); g.connect(ctx.destination); src.start(at);
      };
      click(t, 2800, 0.05, 1); click(t + 0.075, 1400, 0.09, 0.9);                       // "ka-chk"
    } catch {}
  };
  const detectedRef = useRef(true), forceOutRef = useRef(false), sentInViewRef = useRef(true);
  const [voiceNote, setVoiceNote] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const myIdRef = useRef<string>("");
  const isPrimaryRef = useRef(false);
  const recRef = useRef<any>(null);
  const ttsBusyRef = useRef(false);
  const awaitingListenRef = useRef(false);
  const promptSeqRef = useRef(0);
  const goTimerRef = useRef<any>(null);
  const listeningRef = useRef(false);

  // Speech queue: lines are spoken strictly one after another and are never
  // cut off by the next line. When the queue drains, `onDrain` fires (used to
  // open the mic only after the app has finished talking).
  const speakQ = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const onDrainRef = useRef<(() => void) | null>(null);
  const pump = () => {
    if (speakingRef.current) return;
    const text = speakQ.current.shift();
    if (text === undefined) { ttsBusyRef.current = false; const f = onDrainRef.current; onDrainRef.current = null; f?.(); return; }
    speakingRef.current = true; ttsBusyRef.current = true;
    let finished = false;
    const next = () => { if (finished) return; finished = true; speakingRef.current = false; pump(); };
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      const to = setTimeout(next, 20000);
      u.onend = () => { clearTimeout(to); next(); };
      u.onerror = () => { clearTimeout(to); next(); };
      speechSynthesis.speak(u);
    } catch { next(); }
  };
  const speakTracked = (text: string) => { speakQ.current.push(text); pump(); };
  const clearSpeech = () => { speakQ.current = []; onDrainRef.current = null; try { speechSynthesis.cancel(); } catch {} speakingRef.current = false; };

  useEffect(() => { api(`/api/asanas/${asanaId}`).then(setAsana).catch((e) => setErr(e.message)); }, [asanaId]);

  // The setup, disclaimer and coaching screens each mount their own <video>
  // element. A callback ref re-attaches the live stream to whichever element
  // is currently mounted — a plain ref left the coaching <video> with no
  // stream (black camera, and captures silently drew a blank canvas).
  const attachVideo = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    const stream = streamRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  };

  const enableCamera = async (): Promise<boolean> => {
    setCamErr(""); unlockAudio();
    try {
      const live = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
      if (!live) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        stream.getVideoTracks().forEach((t) => { t.onended = () => { setCamOn(false); setCamErr("Camera stopped. Tap Enable Camera to turn it back on."); }; });
      }
      if (videoRef.current) attachVideo(videoRef.current);
      setCamOn(true);
      wsRef.current?.send(JSON.stringify({ type: "enableState", camera: true, inView }));
      return true;
    } catch { setCamOn(false); setCamErr("Camera blocked. Allow camera permission, then tap Enable Camera again. A Primary device must have a working camera."); return false; }
  };
  /** Camera (and any mic recogniser) fully off: used for the demo and the Start screen. It comes back on when practice starts. */
  const releaseCamera = () => {
    try { stopListening(); } catch {}
    try { recRef.current?.abort?.(); } catch {}
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    streamRef.current = null;
    setCamOn(false); setCamErr(""); setSkelReady(false);
    detectedRef.current = true; sentInViewRef.current = true; setInView(true);
    wsRef.current?.send(JSON.stringify({ type: "enableState", camera: false, inView: true }));
  };
  /** Start button: camera + mic come on right before practice begins, then the server starts the voice flow. */
  const startPractice = async () => { if (await enableCamera()) send({ type: "readyClicked" }); };

  const connect = async (sessionCode: string) => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", code: sessionCode, label: /Mobi|iPhone/i.test(navigator.userAgent) ? "Phone" : "Laptop" }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.you) { myIdRef.current = msg.you; }
      if (msg.type === "state" && msg.asana) { setState(msg); if (typeof msg.demoIdx === "number") setDemoIdx(msg.demoIdx); isPrimaryRef.current = msg.primaryId === myIdRef.current; if (msg.state === "results") setScreen("results"); if (["start", "listening", "counting", "warning", "demo", "analysing"].includes(msg.state)) setScreen("coach"); }
      if (msg.type === "analysing") setAnalysingStep(msg.step || 1);
      if (msg.type === "demoStep") { if (msg.done) { setDemoIdx(0); setDemoPaused(false); } else if (msg.n >= 1) { setDemoIdx(msg.n - 1); if (isPrimaryRef.current) { const n = msg.n; onDrainRef.current = () => send({ type: "demoSpoken", n }); } } }   // the next step starts only after this one has been spoken
      if (msg.type === "spoken" && isPrimaryRef.current) speakTracked(msg.text);
      if (msg.type === "count") { setCount(msg.value); setHoldUntil(0); if (msg.value === 1) setCaptured(false); }
      if (msg.type === "hold") { if (msg.done) setHoldUntil(0); else setHoldUntil(msg.until); }
      if (msg.type === "captureAt") {
        const delay = Math.max(0, msg.ts - Date.now());
        setTimeout(() => capturePhoto(msg.step, msg.set), delay);
      }
      if (msg.type === "voiceWindow" && msg.open && isPrimaryRef.current) {
        if (msg.phase === "listen") { if (speakingRef.current || speakQ.current.length) onDrainRef.current = () => startListening(); else startListening(); }
        else {
          // Prompt phase: open the mic only once everything queued has been
          // spoken. Guard against TTS never finishing with a long timer.
          awaitingListenRef.current = true;
          // Each prompt owns its own guard timer; the previous step's 35 s timer
          // must never fire during this prompt (it used to open the mic mid-instruction).
          if (goTimerRef.current) { clearTimeout(goTimerRef.current); goTimerRef.current = null; }
          const mySeq = ++promptSeqRef.current;
          const go = () => {
            if (mySeq !== promptSeqRef.current || !awaitingListenRef.current) return;
            if (speakingRef.current || speakQ.current.length) { onDrainRef.current = go; return; } // still talking: wait
            awaitingListenRef.current = false;
            send({ type: "promptDone" });
            startListening();
          };
          if (speakingRef.current || speakQ.current.length) onDrainRef.current = go; else setTimeout(go, 300);
          goTimerRef.current = setTimeout(go, 35000);
        }
      }
      if (msg.type === "voiceWindow" && !msg.open) {
        awaitingListenRef.current = false; onDrainRef.current = null; promptSeqRef.current++;
        if (goTimerRef.current) { clearTimeout(goTimerRef.current); goTimerRef.current = null; }
        stopListening();
        if (msg.reason === "timeout") setVoiceNote("Sorry, I didn't hear you say Ready. Click Start when you want to start.");
      }
      if (msg.type === "deviceOffline") setVoiceNote(`${msg.label} has gone offline.`);
      if (msg.type === "results") setScreen("results");
    };
    ws.onerror = () => setErr("Live session connection failed. Check you are on the same network, then reconnect.");
  };

  const capturePhoto = (step: number, set: number) => {
    // Photo travels in memory only (WS → server RAM → vision call, then
    // dropped). It is never stored in the browser, DB, disk, or logs.
    let dataUrl = ""; let shotCanvas: HTMLCanvasElement | null = null;
    try {
      const v = videoRef.current;
      if (v && streamRef.current) {
        const c = document.createElement("canvas"); c.width = 640; c.height = 480;
        c.getContext("2d")?.drawImage(v, 0, 0, 640, 480);
        dataUrl = c.toDataURL("image/jpeg", 0.7); shotCanvas = c;
      }
    } catch {}
    playShutter(); setShutter((n) => n + 1); setCaptured(true);
    if (shotCanvas) makeShot(step, shotCanvas);                                         // privacy-filtered copy for the results page (async, in memory)
    wsRef.current?.send(JSON.stringify({ type: "captureBlob", step, set, deviceId: myIdRef.current, dataUrl, bytes: dataUrl.length, fireAt: Date.now() }));
  };

  // Decode any recorded container and re-encode as 16 kHz mono WAV —
  // the only format the transcription API accepts.
  const toWav16k = async (raw: Blob): Promise<Blob> => {
    const AC: any = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return raw;
    const ctx = new AC();
    try {
      const decoded = await ctx.decodeAudioData(await raw.arrayBuffer());
      const rate = 16000;
      const off = new OfflineAudioContext(1, Math.ceil((decoded.duration || 1) * rate), rate);
      const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
      const rendered = await off.startRendering();
      const pcm = rendered.getChannelData(0);
      const buf = new ArrayBuffer(44 + pcm.length * 2);
      const v = new DataView(buf);
      const wstr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      wstr(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); wstr(8, "WAVEfmt "); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); wstr(36, "data"); v.setUint32(40, pcm.length * 2, true);
      for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
      return new Blob([buf], { type: "audio/wav" });
    } finally { try { ctx.close(); } catch {} }
  };

  const stopListening = () => {
    listeningRef.current = false;
    const rec = recRef.current; recRef.current = null;
    try { if (rec && typeof rec.stop === "function") rec.stop(); } catch {}
    try { if (rec && rec.state !== undefined && rec.state !== "inactive") rec.stop(); } catch {}
  };

  const startListening = async () => {
    // Never run two recognisers over each other (duplicate window opens).
    if (listeningRef.current) return;
    listeningRef.current = true;
    setMicErr("");
    setVoiceNote("Listening… say “Ready”, “I'm ready” or “Let us start”.");
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return startRecording();
    const t0 = Date.now();
    let decided = false, fellBack = false;
    let rec: any = null;
    const fallBack = () => { if (fellBack || decided) return; fellBack = true; recRef.current = null; try { rec?.abort?.(); } catch {} listeningRef.current = false; listeningRef.current = true; startRecording(); };
    const launch = () => {
      rec = new SR(); recRef.current = rec;
      rec.lang = "en-US"; rec.maxAlternatives = 3;
      rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e: any) => {
        // Check every alternative of every result (interim too): the phrases are
        // whole-word matched with negation veto server-side, so early matches are safe.
        let heard = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          for (let j = 0; j < e.results[i].length; j++) {
            const text = e.results[i][j].transcript || "";
            if (j === 0) heard = text;
            api("/api/voice/match", { method: "POST", body: JSON.stringify({ text }) }).then((m: any) => {
              if (decided || !m.matched) return;
              decided = true;
              wsRef.current?.send(JSON.stringify({ type: "voiceText", text, latencyMs: Date.now() - t0 }));
              stopListening();
            }).catch(() => {});
          }
        }
        if (heard && !decided) setVoiceNote(`Listening… I heard “${heard.trim()}”. Say “Ready”.`);
      };
      rec.onerror = (e: any) => {
        const code = e?.error;
        if (code === "not-allowed") setMicErr("Microphone blocked for speech recognition. Allow microphone permission — voice is the only way to start each step.");
        // network / service / audio errors: browser recognition can't work here -> record + server transcription
        else if (code === "network" || code === "service-not-allowed" || code === "audio-capture" || code === "language-not-supported") fallBack();
        // no-speech / aborted: harmless, onend restarts while the window is open
      };
      rec.onend = () => {
        if (decided || fellBack) return;
        // Chrome ends recognition after silence; keep listening until the server closes the window.
        if (listeningRef.current && recRef.current === rec) { try { launch(); } catch { fallBack(); } }
      };
      rec.start();
    };
    try { launch(); } catch { fallBack(); return; }
    setTimeout(() => { if (!decided) stopListening(); }, 10500);
  };

  const startRecording = async () => {
    // One-shot fallback (POC g): record then transcribe via server proxy.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream); const chunks: Blob[] = [];
      recRef.current = rec;
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        if (recRef.current === rec) recRef.current = null;
        stream.getTracks().forEach((t) => t.stop());
        try {
          const raw = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          const wav = await toWav16k(raw); // Meta ASR accepts WAV only (probed 2026-11-02: webm/mp4 all 400)
          const form = new FormData();
          form.set("file", wav, "clip.wav");
          const d = await api("/api/voice/transcribe", { method: "POST", body: form });
          if (d.matched) { wsRef.current?.send(JSON.stringify({ type: "voiceText", text: d.transcript })); }
          else { listeningRef.current = false; setVoiceNote(d.transcript ? `I heard “${d.transcript}”, not “Ready”. Click Start to try again.` : "Sorry, I didn't hear you say Ready. Click Start when you want to start."); }
        } catch { listeningRef.current = false; setMicErr("Transcription error. Use Start again when ready."); }
      };
      rec.start(); setTimeout(() => { if (recRef.current === rec && rec.state !== "inactive") rec.stop(); }, 9000);
    } catch { listeningRef.current = false; setMicErr("Microphone denied. Allow microphone permission — voice is the only way to start each step."); }
  };

  const createSession = async () => {
    try { const d = await api("/api/sessions", { method: "POST", body: JSON.stringify({ asanaId }) }); setCode(d.code); await connect(d.code); setScreen("disclaimer"); }
    catch (e: any) { setErr(e.message); }
  };
  const joinSession = async () => {
    if (!joinCode.trim()) return;
    setCode(joinCode.trim()); await connect(joinCode.trim()); setScreen("disclaimer");
  };
  const send = (obj: any) => wsRef.current?.send(JSON.stringify(obj));

  // Analysing: all captures are done, so release the camera and mic on this device.
  const isAnalysing = state?.state === "analysing";
  useEffect(() => {
    if (!isAnalysing) return;
    try { stopListening(); } catch {}
    try { recRef.current?.abort?.(); } catch {}
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    setCamErr("");
  }, [isAnalysing]);
  // Camera/mic off during the demo; secondary devices (which never press Start) switch theirs on when practice begins.
  const sst = state?.state;
  const cameraWanted = sst === "listening" || sst === "counting" || sst === "warning";
  useEffect(() => { if (sst === "demo" && camOn) releaseCamera(); }, [sst]);
  useEffect(() => { if (sst !== "counting") setCaptured(false); }, [sst]);
  useEffect(() => { if ((screen === "coach" || screen === "demo") && cameraWanted && !camOn) enableCamera(); }, [cameraWanted, screen]);
  const pushFrame = () => { const v = detectedRef.current && !forceOutRef.current; setInView(v); if (v !== sentInViewRef.current) { sentInViewRef.current = v; wsRef.current?.send(JSON.stringify({ type: "frameState", inView: v })); } };
  useEffect(() => {
    if (!camOn) return;
    let stop = false, raf = 0, last = 0, pending: boolean | null = null, since = 0;
    (async () => {
      try { if (!engineRef.current) engineRef.current = await createPose(); } catch { if (!stop) setSkelFallback(true); return; }
      if (stop) return; setSkelFallback(false); engineRef.current!.reset();
      if (!privacyRef.current) createPrivacyEngine().then((e) => { if (!privacyRef.current) privacyRef.current = e; else e.close(); }).catch(() => {});   // preload so the first photo is not delayed
      const loop = (now: number) => {
        if (stop) return; raf = requestAnimationFrame(loop);
        if (now - last < 33) return; last = now;                                   // ~30 fps is plenty
        const v = videoRef.current, c = skelRef.current; if (!v || !c || v.readyState < 2 || !v.videoWidth) return;
        if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
        let r = null; try { r = engineRef.current!.detect(v, performance.now()); } catch {}
        const ctx = c.getContext("2d"); if (ctx) drawSkeleton(ctx, r?.pts ?? null, true);
        setSkelReady((p) => p || true);
        // framing from the same detection, debounced so one noisy frame never pauses practice (out: 1 s, back in: 0.5 s)
        const det = !!r?.inFrame;
        if (det === detectedRef.current) { pending = null; return; }
        if (pending !== det) { pending = det; since = now; return; }
        if (now - since >= (det ? 500 : 1000)) { detectedRef.current = det; pending = null; pushFrame(); }
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [camOn]);
  // Save the blurred photos to this user's History (server keeps them private to the owner). Retried per step until accepted.
  const uploadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pid = state?.results?.practiceId; if (!pid) return;
    for (const [k, url] of Object.entries(shots)) {
      const key = `${pid}:${k}`; if (uploadedRef.current.has(key)) continue; uploadedRef.current.add(key);
      api(`/api/history/${pid}/photos/${k}`, { method: "POST", body: JSON.stringify({ dataUrl: url }) }).catch(() => uploadedRef.current.delete(key));
    }
  }, [state?.results?.practiceId, shots]);
  useEffect(() => () => { engineRef.current?.close(); engineRef.current = null; privacyRef.current?.close(); privacyRef.current = null; }, []);
  // Early returns must come AFTER every hook (React error #310 otherwise: the hook count changed once the asana loaded).
  if (err && !asana) return <div className="page"><main className="main"><div className="note red">{err}</div><button className="btn" onClick={onExit}>Back</button></main></div>;
  if (!asana) return <div className="auth-wrap"><div className="card">Loading…</div></div>;

  const snap = state;
  const stepIdx = snap?.stepIndex ?? 0;
  // During the demo the reference image/caption follow the narrated step
  // (demoIdx, driven by server demoStep messages), not the practice step.
  const inDemo = snap?.state === "demo";
  const displayIdx = inDemo ? Math.min(demoIdx, (asana.steps?.length || 1) - 1) : stepIdx;
  const curStep = asana.steps?.[displayIdx];

  // Plain stored step image for list thumbnails; marks only in the large view (C8).
  const annotated = (s: any, big = false) => big
    ? <MarkedImage src={`/files/${s.imageKey}`} marks={s.marks} alt={`Step ${s.n}`} />
    : <img src={`/files/${s.imageKey}`} alt={`Step ${s.n}`} style={{ width: 112, height: 82, objectFit: "contain", flex: "none", background: "var(--soft)", borderRadius: 11 }} />;


  if (isAnalysing && !snap?.results) {
    const total = asana.steps?.length || 1;
    const cur = Math.min(Math.max(analysingStep, 1), total);
    return <div className="page"><header className="header"><div className="brand display">Muse Yoga</div><span className="chip">{asana.name}</span></header><main className="main" style={{ display: "grid", placeItems: "center" }}>
      <div className="card" style={{ width: "min(600px,95vw)", padding: 40, textAlign: "center" }}>
        <h2 className="display" style={{ fontSize: 30 }}>Analyzing, please wait…</h2>
        <p className="muted" style={{ lineHeight: 1.65, margin: "12px 0 20px" }}>Checking each step with all camera angles. About 10 seconds per step.</p>
        <div style={{ textAlign: "left", maxWidth: 380, margin: "0 auto" }}>
          {Array.from({ length: total }, (_, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", fontWeight: 600 }}><span style={{ color: "var(--deep)", fontWeight: 800, width: 16 }}>{i + 1 < cur ? "✓" : "◌"}</span> {i + 1 < cur ? `Step ${i + 1} checked` : `Checking Step ${i + 1}…`}</div>)}
        </div>
        <div className="progress" style={{ maxWidth: 380, margin: "18px auto 6px" }}><i style={{ width: `${Math.round(((cur - 1) / total) * 100 + 6)}%`, transition: "width .5s" }} /></div>
        <p className="muted" style={{ fontSize: 13.5 }}>Camera and microphone are now off. Your photos are being checked and will not be stored.</p>
      </div></main></div>;
  }

  if (screen === "results" && snap?.results) {
    const r = snap.results;
    return <div className="page"><header className="header"><div className="brand display">Muse Yoga</div><span className="chip">{asana.name} — Results</span></header><main className="main">
      <div className="pagehead"><div><h2 className="display">Your Results — {asana.name}</h2><p>Read aloud on your Primary. No score — each step is correct, or needs a correction. ({r.correctCount} of {r.total} steps correct — a factual count, not a grade.)</p></div><div className="sp"></div><span className="chip">Today</span></div>
      <div className="listrows">{r.steps.map((s: any) => <button key={s.n} className="resultstep" onClick={() => setLarge(s)}>{annotated(s)}{shots[s.n] && <img className="shotthumb" src={shots[s.n]} alt={`Your photo, step ${s.n} (blurred)`} />}<div><div className={`verdict ${s.verdict === "correct" ? "ok" : s.verdict === "incorrect" ? "no" : "mid"}`}>{s.verdict === "correct" ? "✓" : s.verdict === "incorrect" ? "✕" : "–"} Step {s.n} — {s.verdict === "correct" ? "Correct" : s.verdict === "incorrect" ? "Needs correction" : "Could not check"}</div><p className="muted" style={{ lineHeight: 1.6, marginTop: 5 }}>{s.correctionText}</p></div>{(s.marks || []).length > 0 && <span className="chip clay" style={{ flex: "none" }}>Annotated character image</span>}<span className="tap">View large →</span></button>)}</div>
      <div className="flowfoot"><span className="muted" style={{ fontSize: 13.5 }}>Your photo is blurred (background and face) on this device before it is saved to your History. Only you can see it, and you can delete it there at any time.</span><span className="sp"></span><button className="btn light" onClick={() => { send({ type: "endSession" }); onExit(); }}>End session</button><button className="btn ghost" onClick={onPickAnother}>Pick Another Asana</button><button className="btn" onClick={() => { setScreen("coach"); send({ type: "readyClicked" }); }}>↺ Practice Again — all steps</button></div>
      {large && <div className="modal" onClick={() => setLarge(null)}><div className="box" onClick={(e) => e.stopPropagation()}><h3 className="display">Step {large.n} — {large.verdict === "correct" ? "Correct" : large.verdict === "incorrect" ? "Needs correction" : "Could not check"}</h3><div className="bigpair">{annotated(large, true)}{shots[large.n] && <figure className="shotfig"><img src={shots[large.n]} alt={`Your photo, step ${large.n} (blurred)`} /><figcaption>Your photo — background and face blurred; saved to your History (only you can see it)</figcaption></figure>}</div><p>{large.correctionText}</p>{large.debug && <div className="note amber" style={{ marginTop: 10 }}><b>DEBUG — what was sent to the model</b> ({large.debug.sent?.mode}; reference included: {String(large.debug.sent?.referenceIncluded)}; student photos: {large.debug.sent?.photoCount}).<div style={{ display: "flex", gap: 8, flexWrap: "nowrap", overflowX: "auto", marginTop: 6 }}><figure style={{ margin: 0 }}><img src={`/files/${large.imageKey}`} style={{ height: 100 }} /><figcaption style={{ fontSize: 11 }}>Reference (stored)</figcaption></figure>{(large.debug.photos || []).map((u: string, i: number) => <figure key={i} style={{ margin: 0 }}><img src={u} style={{ height: 100 }} /><figcaption style={{ fontSize: 11 }}>Photo {i + 1}{large.debug.bestPhoto === i + 1 ? " (model's pick)" : ""}</figcaption></figure>)}</div>{(large.debug.issues || []).length > 0 && <ul style={{ margin: "6px 0 0 16px", fontSize: 12 }}>{large.debug.issues.map((it: any, i: number) => <li key={i}><b>{it.part}</b>: {it.problem}</li>)}</ul>}{large.debug.photos?.length > 0 && (large.debug.issues || []).some((it: any) => it.photo) && <div style={{ marginTop: 8 }}><div style={{ fontSize: 11 }}>Your photo, annotated (drawn by the app from the model's coordinates):</div><div style={{ position: "relative", display: "inline-block" }}><img src={large.debug.photos[Math.min(large.debug.photos.length, large.debug.bestPhoto || 1) - 1]} style={{ maxHeight: 260 }} />{large.debug.issues.filter((it: any) => it.photo).map((it: any, i: number) => <span key={i} style={{ position: "absolute", left: `${it.photo.x * 100}%`, top: `${it.photo.y * 100}%`, width: `${it.photo.r * 200}%`, aspectRatio: "1", transform: "translate(-50%,-50%)", border: "3px solid #C0392B", borderRadius: "50%" }}><span style={{ position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: 4, background: "#C0392B", color: "#fff", fontSize: 11, padding: "1px 4px", borderRadius: 4, whiteSpace: "nowrap" }}>{it.problem}</span></span>)}</div></div>}{large.debug.annotatedPhoto && <div style={{ marginTop: 8 }}><div style={{ fontSize: 11 }}>Your photo, annotated by muse-image-1.0 (image model):</div><img src={large.debug.annotatedPhoto} style={{ maxHeight: 260 }} /></div>}</div>}<p className="muted" style={{ fontSize: 12.5 }}>Numbered circles are drawn on the stored character image and match the numbers in the text above. Your photo is blurred (background and face) before it is saved to your History.</p><div className="flowfoot"><span className="sp"></span><button className="btn small" onClick={() => setLarge(null)}>Close</button></div></div></div>}
    </main></div>;
  }

  if (screen === "coach" || screen === "demo") {
    const isPrimary = snap?.primaryId === myIdRef.current;
    const framingBad = snap?.state === "warning";
    return <div className="coach">
      <header className="coach-strip"><span className="display" style={{ fontSize: 20, color: "var(--deep)" }}>Muse Yoga</span>
        <span style={{ fontWeight: 800 }}>{asana.name}</span>
        <span style={{ flex: 1 }} />
        {asana.steps.map((s: any, i: number) => <span key={s.n} className="chip" style={i === displayIdx ? { background: "var(--deep)", color: "#fff" } : i < displayIdx && !inDemo ? { background: "#DCE8D8" } : {}}>{i < displayIdx && !inDemo ? "✓" : s.n}{i === displayIdx ? " Now" : ""}</span>)}
        <span className={`chip ${isPrimary ? "" : "amber"}`}>{isPrimary ? "★ Primary" : "Secondary · camera only"}</span>
        <span className="chip">{snap?.devices?.length || 1} devices · Code {code}</span>
      </header>
      <main className="coach-stage">
        <section className="coach-half cam">
          {/* The camera <video> keeps playing (photos for validation are taken from it) but is never shown, unless the pose model cannot load. */}
          <video ref={attachVideo} autoPlay playsInline muted style={camOn && skelFallback ? { display: "block" } : { position: "absolute", width: 2, height: 2, opacity: 0, pointerEvents: "none" }} />
          <canvas ref={skelRef} className="skel" style={{ display: camOn && !skelFallback ? "block" : "none" }} />
          {shutter > 0 && <div key={shutter} className="shutter" aria-hidden><i className="blade top" /><i className="blade bot" /></div>}
          {camOn && !skelFallback && !skelReady && <div className="skel-wait">Starting skeleton view…</div>}
          {!camOn && <div className="stage">
            {inDemo ? <>
              <div className="stage-kicker">DEMO · STEP {displayIdx + 1} OF {asana.steps.length}</div>
              <p className="stage-text">{curStep?.instruction}</p>
              <div className="stage-dots">{asana.steps.map((_: any, i: number) => <i key={i} className={i === displayIdx ? "on" : i < displayIdx ? "done" : ""} />)}</div>
              <p className="stage-note">Camera and microphone are off during the demo. They switch on when you tap Start.</p>
            </> : (snap?.state === "start" || snap?.state === "setup" || !snap?.state) ? <>
              <div className="stage-kicker">READY WHEN YOU ARE</div>
              <h2 className="display stage-title">{asana.name}</h2>
              <p className="stage-sub">{asana.steps.length} steps · about {Math.max(1, Math.round(asana.steps.reduce((t: number, x: any) => t + (x.durationS || 20), 0) / 60))} min of holding</p>
              <p className="stage-note">Tap <b>Start</b>. Your camera and microphone switch on, each step is spoken aloud, and you say “Ready” when you are in position.</p>
              {camErr && <p className="stage-err">{camErr}</p>}
            </> : <>
              <div className="stage-kicker">CAMERA OFF</div>
              <p className="stage-text">{curStep?.instruction}</p>
              <button className="btn primary" onClick={enableCamera}>Enable Camera</button>{camErr && <p className="stage-err">{camErr}</p>}
            </>}
          </div>}
          <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 8, zIndex: 4 }}>{camOn && <><span className="tag">{skelFallback ? "● Your camera" : "● Skeleton view · no video shown"}</span><span className="tag">{inView ? "✓ Fully in view" : "⚠ Not fully in view"}</span></>}</div>
          <div style={{ position: "absolute", left: 14, bottom: 14, display: "flex", gap: 8, zIndex: 4 }}>
            {(snap?.devices || []).filter((d: any) => d.deviceId !== myIdRef.current).map((d: any) => <span key={d.deviceId} className="tag">{d.label} · Muted <button style={{ color: "#fff", fontWeight: 800, textDecoration: "underline" }} onClick={() => send({ type: "switchPrimary" })}>{snap.pendingPrimary === d.deviceId ? "Primary after this step ✓" : "Make Primary"}</button></span>)}
            {!isPrimary && <button className="tag" onClick={() => send({ type: "switchPrimary" })}>{snap?.pendingPrimary ? "Primary after this step ✓" : "Make this device Primary"}</button>}
          </div>
        </section>
        <section className="coach-half ref">
          {curStep?.imageKey && <img className="refimg" src={`/files/${curStep.imageKey}`} alt={`Reference step ${displayIdx + 1}`} />}
          <div className="refcap"><div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>{inDemo ? "Demo" : "Reference"} · Step {displayIdx + 1} of {asana.steps.length} · Stored</div>{(camOn || !inDemo) && <p>{curStep?.instruction}</p>}</div>
        </section>
        {framingBad && <div className="banner" role="alert"><h2 className="display">I can't measure your pose</h2><p>Please come fully within the camera. Counting restarts itself when you are fully in view — no tap needed. There is no “Continue anyway”.</p></div>}
      </main>
      <div className="coach-focus" aria-live="polite">
        {snap?.state === "demo" ? <><span className="chip clay">DEMO · no photos taken</span><span>Step {displayIdx + 1} of {asana.steps.length} · spoken aloud on Primary</span><button className="btn light small" onClick={() => { if (demoPaused) { send({ type: "demoControl", action: "resume" }); setDemoPaused(false); } else { send({ type: "demoControl", action: "pause" }); setDemoPaused(true); } }}>{demoPaused ? "▶ Resume" : "⏸ Pause"}</button><button className="btn ghost small" onClick={() => send({ type: "demoControl", action: "again" })}>↺ Hear This Step Again</button><button className="btn small" onClick={() => { send({ type: "demoControl", action: "end" }); setDemoPaused(false); }}>End Demo → Ready</button></>
        : snap?.state === "listening" ? <><div className="coach-count" style={{ fontSize: 30 }}>Listening…</div><span>Say “Ready” when you are in position (Primary mic only, 10 seconds).</span></>
        : snap?.state === "counting" ? (captured
            ? <><div className="coach-count" style={{ fontSize: 34 }}>Captured ✓</div><span>Photo taken · Step {stepIdx + 1} — relax</span></>
            : <><div className="coach-count">{count ?? "•"}</div><span>Get ready · counting 1, 2, 3 · the photo is taken on 3 · Step {stepIdx + 1}</span></>)
        : snap?.state === "warning" ? <><div style={{ fontSize: 24 }}>Paused — hold still, counting restarts itself</div></>
        : snap?.state === "analysing" ? <><span>Analyzing, please wait…</span></>
        : <><span>Tap Start: your camera and microphone switch on, then every step starts by voice only. There is no per-step click.</span>
            <button className="btn primary" onClick={startPractice}>Start</button>
            <button className="btn small" onClick={() => send({ type: "startDemo" })}>Watch Demo</button></>}
        <span style={{ flex: 1 }} />
        <label style={{ color: "#fff", fontSize: 12 }}>Framing test: <input type="checkbox" style={{ width: "auto" }} checked={forceOut} onChange={(e) => { forceOutRef.current = e.target.checked; setForceOut(e.target.checked); pushFrame(); }} /> Step out of frame</label>
        <button className="btn small" onClick={() => { send({ type: "endSession" }); onExit(); }}>End session</button>
      </div>
      {(voiceNote || micErr) && <div style={{ background: "#10201A", padding: "0 18px 10px", fontSize: 14 }}>{voiceNote} {micErr}</div>}
    </div>;
  }

  // setup + disclaimer screens
  return <div className="page"><header className="header"><div className="brand display">Muse Yoga</div><span className="chip">{asana.name}</span><div style={{ flex: 1 }} /><button className="btn small" onClick={onExit}>Back</button></header>
    <main className="main">
      {screen === "setup" && <div className="card" style={{ maxWidth: 640 }}>
        <h2 className="display" style={{ fontSize: 24 }}>Practice setup</h2>
        <p style={{ margin: "8px 0" }}>Use 1–3 devices on the same account. The first device to join is Primary (speaks, listens, captures). Other devices are camera-only.</p>
        <div className="row"><button className="btn" onClick={enableCamera}>Enable Camera</button>{camOn && <span className="ok">Camera on ✓</span>}<button className="btn" onClick={async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); setMicErr(""); } catch { setMicErr("Microphone denied — voice start will be unavailable on this device."); } }}>Enable Microphone</button></div>
        {camErr && <div className="note red" style={{ marginTop: 8 }}>{camErr}</div>}{micErr && <div className="note amber" style={{ marginTop: 8 }}>{micErr}</div>}
        {/* permission check only: the camera picture is never shown (practice uses a skeleton view) */}
        <video ref={attachVideo} autoPlay playsInline muted style={{ position: "absolute", width: 2, height: 2, opacity: 0, pointerEvents: "none" }} />
        {camOn && <p className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>Camera is ready. Your video is never shown or stored — during practice you see only a skeleton.</p>}
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary" disabled={!camOn} onClick={createSession}>Create session & continue</button>
          {!camOn && <span style={{ fontSize: 13 }}>Enable your camera first — a Primary device must have a camera.</span>}</div>
        <hr style={{ margin: "14px 0" }} />
        <label>Join an existing session (same account, session code)</label>
        <div className="row"><input style={{ maxWidth: 180 }} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="6-digit code" /><button className="btn" onClick={joinSession}>Join session</button></div>
        {err && <div className="note red" style={{ marginTop: 8 }}>{err}</div>}
      </div>}
      {screen === "disclaimer" && <div style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 0 }}><div className="card" style={{ width: "min(640px,95vw)", padding: "34px 38px" }}>
        <div style={{ fontSize: 30 }}>⚠</div>
        <h2 className="display" style={{ fontSize: 29, margin: "8px 0" }}>Before you begin</h2>
        <p className="muted" style={{ marginBottom: 12, fontWeight: 700 }}>You selected {asana.name} — after this you will go straight to its demo, no need to select again.</p>
        <ul className="muted" style={{ lineHeight: 1.75, paddingLeft: 20, fontSize: 15 }}>
          <li>Consult a doctor before practising if you have any medical condition, injury, or are pregnant.</li>
          <li>Check the cautions for your asana in the box below — do not practise it if any apply to you.</li>
          <li>Stop immediately if you feel pain, dizziness, or strain.</li>
          <li>This app gives pose guidance only. It is not medical advice.</li>
        </ul>
        <div className="note amber" style={{ marginTop: 12 }}><b>⚠ {asana.name} — do not practise if you have:</b> {(asana.contraindications || []).join(" · ")}</div>
        <div className="note sage" style={{ marginTop: 12 }}>Your camera photos are used only to check your pose and are <b>never stored</b>.{code && <> Session code: <b>{code}</b> — join on up to 2 more devices with the same account. Devices: {state?.devices?.length || 1} connected.</>}</div>
        <label style={{ display: "flex", gap: 11, alignItems: "flex-start", fontWeight: 600, lineHeight: 1.5, cursor: "pointer", marginTop: 14 }}><input type="checkbox" style={{ width: 20, height: 20, marginTop: 2 }} checked={ticked} onChange={(e) => setTicked(e.target.checked)} /> I have read this and wish to continue</label>
        <div className="flowfoot"><button className="btn light" onClick={onExit}>← Back</button><span className="sp"></span><button className="btn ghost" disabled={!ticked} onClick={() => { releaseCamera(); setScreen("coach"); setTimeout(() => send({ type: "startDemo" }), 300); }}>Watch Demo</button><button className="btn" disabled={!ticked} onClick={() => { releaseCamera(); setScreen("coach"); }}>Continue →</button></div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>The checkbox is unticked on every entry. After the Start tap, every step is voice-only.</p>
      </div></div>}
    </main></div>;
}
