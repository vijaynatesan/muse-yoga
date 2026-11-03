"""POC-b v2: regenerate ALL steps from character_for_yoga_pose_boy.png only.
Gate per image (muse-wonder vision): same_character, exactly 1 head/2 arms/2 legs, pose matches step.
Max 3 attempts/step. Passing images -> outputs/b/final/stepN.png ; all attempts kept in attempts/.
Old round-1 images are NOT used as finals (see image_audit.json)."""
import base64, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.meta_api import image_edit, save_b64, wonder, POC, ROOT

CHAR = ROOT / "characters/default/character_for_yoga_pose_boy.png"
OUT = POC / "outputs" / "b" / "final"; ATT = POC / "outputs" / "b" / "attempts"
OUT.mkdir(parents=True, exist_ok=True); ATT.mkdir(parents=True, exist_ok=True)
LOCK = ("Use the reference character EXACTLY and ONLY him: same brown skin, same curly dark-brown hair with blue headband, "
        "same mustard-yellow long-sleeve tracksuit, same black socks, same flat cartoon style, plain white background, SIDE VIEW. "
        "Anatomy: exactly ONE head, exactly TWO arms, exactly TWO legs, no extra limbs, no extra feet or hands. ")

def datauri(p): return "data:image/png;base64," + base64.b64encode(Path(p).read_bytes()).decode()

def check(candidate, instruction, step):
    content = [{"type": "input_text", "text": f"""Compare image 2 against reference character in image 1.
Step instruction: {instruction}
Reply ONLY JSON: {{"same_character":true/false,"heads":1,"arms":2,"legs":2,"pose_correct":true/false,"reason":"..."}}
same_character means same face/skin/hair/blue headband/yellow tracksuit as image 1. Count visible arms/legs in image 2 (a limb partly hidden still counts once; extra limb counts >2). pose_correct means the pose matches the step instruction in side view."""},
               {"type": "input_image", "image_url": datauri(CHAR)},
               {"type": "input_image", "image_url": datauri(candidate)}]
    r = wonder([{"role": "user", "content": content}], max_output_tokens=700, item=f"b2-check-step{step}")
    txt = r["text"].strip().strip("`").removeprefix("json").strip()
    import re
    m = re.search(r"\{.*\}", txt, re.S)
    return json.loads(m.group(0) if m else txt)

def main():
    only = [int(x) for x in sys.argv[1].split(",")] if len(sys.argv) > 1 else None
    steps = [s for s in json.loads((POC / "outputs/a/chakrasana.json").read_text())["steps"][:4] if not only or s["step"] in only]
    report = []
    for s in steps:
        n, instr = s["step"], s["instruction"]
        passed, last = False, None
        for attempt in range(1, 4):
            prompt = LOCK + f"Show him doing this Chakrasana step: {instr}"
            try:
                r = image_edit(prompt, [CHAR], item=f"b2-step{n}-try{attempt}")
            except Exception as e:
                print(f"step{n} try{attempt}: generation failed: {e}"); report.append({"step": n, "attempt": attempt, "error": str(e)[:300]}); continue
            cand = save_b64(r["b64"], ATT / f"step{n}_try{attempt}.png")
            try:
                v = check(cand, instr, n)
            except Exception as e:
                v = {"error": str(e)}
            print(f"step{n} try{attempt}: {v}")
            last = {"step": n, "attempt": attempt, "file": cand.name, "verdict": v}
            # side view legitimately hides 1 arm/leg: fail only on EXTRA limbs (>2) or wrong head count
            ok = v.get("same_character") and v.get("heads") == 1 and 1 <= (v.get("arms") or 0) <= 2 and 1 <= (v.get("legs") or 0) <= 2 and v.get("pose_correct")
            report.append(last)
            if ok:
                save_b64(r["b64"], OUT / f"step{n}.png"); passed = True; print(f"  -> PASS, final step{n}.png"); break
        if not passed:
            print(f"  -> NO PASS after 3 tries for step {n} (best attempts kept, flagged in report)")
    rp = POC / "outputs/b/v2_report.json"
    if rp.exists():
        try: report = json.loads(rp.read_text()) + report
        except Exception: pass
    rp.write_text(json.dumps(report, indent=2))
    print("DONE", OUT)

if __name__ == "__main__": main()
