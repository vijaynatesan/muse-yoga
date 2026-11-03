"""POC-a: muse-wonder-1.0 step instructions + metadata for Chakrasana."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.meta_api import wonder, wonder_chat, POC

OUT = POC / "outputs" / "a"; OUT.mkdir(parents=True, exist_ok=True)
PROMPT = """You are a yoga instructor generator. For the asana "Chakrasana" (Wheel Pose),
return ONLY valid JSON (no markdown fences) with this exact shape:
{"asana":"Chakrasana","steps":[{"step":1,"instruction":"...","duration_seconds":30}],
 "difficulty":"Beginner|Intermediate|Advanced","body_part":"...","category":"...",
 "benefits":["..."],"contraindications":["..."]}
Rules: 3-5 steps to reach the final pose, each instruction 1-3 short sentences,
include duration per step, benefits and contraindications."""

def main():
    msgs = [{"role": "user", "content": PROMPT}]
    try:
        res = wonder(msgs, max_output_tokens=1500, item="a-wonder-responses")
        via = "responses"
    except Exception as e:
        print(f"responses failed: {e}\nFalling back to chat/completions...")
        res = wonder_chat(msgs, max_tokens=1500, item="a-wonder-chat"); via = "chat"
    (OUT / "raw.txt").write_text(res["text"])
    txt = res["text"].strip()
    if txt.startswith("```"): txt = txt.strip("`").removeprefix("json").strip()
    data = json.loads(txt)
    (OUT / "chakrasana.json").write_text(json.dumps(data, indent=2))
    assert data["steps"] and all(k in data for k in ("difficulty","body_part","category","benefits","contraindications"))
    for s in data["steps"]:
        (OUT / f"step{s['step']}.txt").write_text(s["instruction"])
    print(f"OK via={via} steps={len(data['steps'])} seconds={res['seconds']:.1f} usage={res['usage']}")
    print(json.dumps(data, indent=2)[:2000])

if __name__ == "__main__": main()
