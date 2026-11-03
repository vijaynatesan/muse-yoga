"""POC-b: consistent-character step images. Uses POC-a steps + boy character via images/edits.
Fallback: images/generations with character described, if edits fails. 1 image/step (3 steps max to save cost)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.meta_api import image_edit, image_generate, save_b64, POC, ROOT

OUT = POC / "outputs" / "b"; OUT.mkdir(parents=True, exist_ok=True)
CHAR = ROOT / "characters/default/character_for_yoga_pose_boy.png"

def main():
    steps_file = POC / "outputs" / "a" / "chakrasana.json"
    if steps_file.exists():
        steps = json.loads(steps_file.read_text())["steps"][:3]
    else:
        steps = [{"step": i+1, "instruction": Path(ROOT/f"asanas/public/chakrasana/step{i+1}.txt").read_text()} for i in range(3)]
    results = []
    for s in steps:
        prompt = (f"Show the exact same character from the reference image (same boy, same outfit, same art style, "
                  f"plain light background, full body visible) performing this yoga step: {s['instruction']} "
                  f"Keep the character identical to the reference. Step {s['step']} of Chakrasana (Wheel Pose).")
        try:
            r = image_edit(prompt, [CHAR], item=f"b-step{s['step']}-edit")
            mode = "edit(character-ref)"
        except Exception as e:
            print(f"edit failed step {s['step']}: {e}\nFalling back to generations...")
            r = image_generate(prompt, item=f"b-step{s['step']}-gen"); mode = "generate(no-ref)"
        p = save_b64(r["b64"], OUT / f"step{s['step']}.png")
        results.append({"step": s["step"], "mode": mode, "seconds": round(r["seconds"],1), "file": p.name})
        print(results[-1])
    (OUT / "report.json").write_text(json.dumps(results, indent=2))
    print("DONE. Visually compare step1-3.png: same character/outfit/style? Record verdict in POC_REPORT.md")

if __name__ == "__main__": main()
