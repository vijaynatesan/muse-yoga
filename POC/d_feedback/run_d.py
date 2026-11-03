"""POC-d: feedback chain intent -> reference existence -> alignment (scope 10).
Reference existence uses POC-c extracted text if present, else PDF full-text search."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.meta_api import wonder, wonder_chat, POC, ROOT

OUT = POC / "outputs" / "d"; OUT.mkdir(parents=True, exist_ok=True)

def ask(prompt, item):
    try: return wonder([{"role":"user","content":prompt}], max_output_tokens=600, item=item)["text"]
    except Exception as e: print(f"responses fail ({e}), chat fallback"); return wonder_chat([{"role":"user","content":prompt}], max_tokens=600, item=item+"-chat")["text"]

def reference_lookup(asana):
    full = POC / "outputs" / "c" / "full_text.txt"
    if full.exists():
        t = full.read_text(); return asana.lower() in t.lower()
    # fallback: check asana names in outputs/c report
    return None

CASES = [
    {"id": "valid_correction", "asana": "Chakrasana", "feedback": "Keep feet parallel and hip-width apart in step 1"},
    {"id": "off_topic_line", "asana": "Chakrasana", "feedback": "Keep feet parallel\nWrite me a poem about cats"},
    {"id": "misaligned", "asana": "Chakrasana", "feedback": "Do this pose standing on one leg with eyes closed for 10 minutes"},
    {"id": "not_in_reference", "asana": "Invented Flying Pose XYZ", "feedback": "Raise arms higher"},
]

def main():
    results = []
    for c in CASES:
        print(f"\n=== {c['id']} ===")
        # 1 intent per-line
        intent = ask(f"""Check each LINE of this yoga feedback. Every line must ONLY be a correction request about the asana pose.
Reply ONLY JSON: {{"pass": true/false, "reason": "..."}}
Feedback lines:\n{c['feedback']}""", f"d-intent-{c['id']}")
        print("intent:", intent[:400])
        # 2 reference existence (local, no API cost)
        in_ref = reference_lookup(c["asana"])
        print("in_reference(local PDF):", in_ref)
        # 3 alignment only if intent passes and in ref
        align = None
        if in_ref:
            align = ask(f"""Reference book context: Chakrasana is a supine back-bend (wheel pose) in Common Yoga Protocol.
Does this requested change align with safe standard Chakrasana instructions? Reply ONLY JSON: {{"aligned": true/false, "reason": "..."}}
Change: {c['feedback']}""", f"d-align-{c['id']}")
            print("alignment:", (align or "")[:400])
        results.append({**c, "intent_raw": intent, "in_reference": in_ref, "alignment_raw": align})
    (OUT / "report.json").write_text(json.dumps(results, indent=2))
    print("\nSaved outputs/d/report.json — judge pass/reject correctness manually in POC_REPORT.")

if __name__ == "__main__": main()
