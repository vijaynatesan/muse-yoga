# POC g — Voice "Ready" check (C15)

Quick POC only, inside `POC/g_voice/`. Not production code.

## Run

```bash
python3 POC/g_voice/server.py 5174
# open http://localhost:5174/  (microphone requires localhost or HTTPS)
```

Press **Start** (the only click, mirroring the Start screen), hear
"Say Ready when you are in position", then say an accepted phrase.
Recording stops when you stop speaking (~1.1 s of silence) or at 10 s,
uploads a browser-built 16 kHz WAV, and the server proxies it in memory to
`POST https://api.meta.ai/v1/asr/transcribe` (model
`muse-voice-transcribe-1.0`, same `.api.txt` key, server-side only).
Audio is never written to disk. Results table shows transcript, matched
phrase, and API seconds per attempt. A no-mic phrase-matcher tester is on
the same page (`POST /api/match`).

Accepted phrases (`matcher.py`, whole-word tokens, negation-vetoed):
`ready` · `i'm ready` (incl. "I am ready") · `let us start` (incl. "let's start").
`already` and `not ready` must not match.

## Results (2026-10-31, this session)

Synthesized speech clips (ffmpeg flite) sent through the real server + API:

| Said | Transcript | Matched | API time |
|---|---|---|---|
| ready | "Ready." | yes — ready | 1.59 s |
| I am ready | "Hi I'm ready." | yes — i'm ready | 1.51 s |
| let us start | "Let us start." | yes — let us start | 1.53 s |
| already | "Already." | no | 1.37 s |
| not ready | "not ready." | no | 1.40 s |
| (1 s silence) | "" | no | 2.09 s |

Cost: ~$0.00005 per attempt ($0.18/audio-hour), charged to the POC ledger.

## What this proves, and what it does not

Proves: the same API key works for `muse-voice-transcribe-1.0`; all three
accepted phrases are recognized; substring/negation traps are rejected;
one-shot latency is ~1.4–1.6 s after the clip ends.

Does not prove: human voice at 2–3 m from a laptop/phone mic (clips above
are synthesized, close-talk quality), background-noise robustness, or
streaming latency. Production candidate is the realtime WebSocket
(`wss://api.meta.ai/v1/asr/realtime`, same model) so counting can start
~as soon as the word is spoken instead of ~1.5 s after the clip ends;
the one-shot path here is the fallback and the phrase/matcher contract
carries over unchanged.
