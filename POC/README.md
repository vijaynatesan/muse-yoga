# POC — run instructions (primary device only)

All code is POC-only inside `POC/`. Budget guard: `common/meta_api.py` hard-stops before a call if ledger > $15 (`outputs/cost_ledger.json`).

```bash
# from workspace root
POC/.venv/bin/python POC/a_wonder/run_a.py          # a: steps+metadata -> outputs/a/
POC/.venv/bin/python POC/b_image/run_b.py           # b: character step images -> outputs/b/
POC/.venv/bin/python POC/c_pdf/run_c.py             # c: PDF extraction -> outputs/c/
python3 POC/d_feedback/run_d.py                     # d: feedback chain -> outputs/d/
python3 POC/e_primary_session/run_f.py --step 1 --label correct   # f vision+annotate
python3 POC/e_primary_session/run_f.py --step 1 --label wrong
POC/.venv/bin/python POC/e_primary_session/server.py 8765         # e/g primary web app
# open http://localhost:8765/  (camera requires localhost; allow camera, tick disclaimer, Start)
```

API key is read from workspace `.api.txt` (never copied into POC) or `META_API_KEY`. Base: `https://api.meta.ai/v1`, models `muse-wonder-1.0` / `muse-image-1.0`.

Multi-device (scope 18e full) is NOT in this phase: it needs this web app served so other devices can connect remotely (HTTPS/LAN + realtime sync) — next phase after owner review.
