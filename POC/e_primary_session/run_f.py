"""POC-f (primary-device slice): pose validation + annotated image.
- Vision check: muse-wonder-1.0 with images (3 capture sets x 1 angle on primary + reference + instruction)
  -> pick best set, correct/incorrect, correction text. Tries Responses image input, falls back to chat image_url.
- Annotation: muse-image-1.0 edit of the STORED character image -> red circles/arrows. User photo never annotated/stored.
Default user photos: existing chakrasana step1 image as 'correct proxy'; boy character standing as 'wrong proxy'.
Pass real captures: --step 1 --photos cap1.png,cap2.png,cap3.png
"""
import argparse, base64, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.meta_api import wonder, wonder_chat, image_edit, save_b64, POC, ROOT, api_key, BASE, guard, charge
import requests, time

OUT = POC / "outputs" / "f"; OUT.mkdir(parents=True, exist_ok=True)

def datauri(p): return "data:image/png;base64," + base64.b64encode(Path(p).read_bytes()).decode()

def vision_responses(instruction, ref, photos):
    content = [{"type": "input_text", "text": f"""You are validating a yoga pose. Instruction: {instruction}
First image after this text is the REFERENCE character pose. The next {len(photos)} images are capture sets (set 1..{len(photos)}, one angle each on primary device).
Pick the single best set, validate the pose in it against the reference+instruction.
Reply ONLY JSON: {{"best_set":1,"correct":true/false,"correction":"..."}}"""},
               {"type": "input_image", "image_url": datauri(ref)}]
    for p in photos: content.append({"type": "input_image", "image_url": datauri(p)})
    return wonder([{"role": "user", "content": content}], max_output_tokens=800, item="f-vision-responses")

def vision_chat(instruction, ref, photos):
    content = [{"type": "text", "text": f"""Validate yoga pose. Instruction: {instruction}
First image is REFERENCE, next {len(photos)} are capture sets. Pick best set. Reply ONLY JSON: {{"best_set":1,"correct":true/false,"correction":"..."}}"""},
               {"type": "image_url", "image_url": {"url": datauri(ref)}}]
    for p in photos: content.append({"type": "image_url", "image_url": {"url": datauri(p)}})
    return wonder_chat([{"role": "user", "content": content}], max_tokens=800, item="f-vision-chat")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--photos", default=""); ap.add_argument("--label", default="proxy")
    a = ap.parse_args()
    ref = ROOT / f"asanas/public/chakrasana/chakrasana_step_{a.step}.png"
    instr = (ROOT / f"asanas/public/chakrasana/step{a.step}.txt").read_text()
    if a.photos: photos = [Path(p) for p in a.photos.split(",")]
    elif a.label == "wrong":
        photos = [ROOT / "characters/default/character_for_yoga_pose_boy.png"] * 3
    else:
        photos = [ref] * 3  # correct proxy: captured pose identical to reference
    print(f"step={a.step} label={a.label} photos={[p.name for p in photos]}")
    try: res = vision_responses(instr, ref, photos); via = "responses"
    except Exception as e:
        print(f"responses vision failed: {e}\nchat fallback..."); res = vision_chat(instr, ref, photos); via = "chat"
    print("vision:", res["text"][:800])
    verdict = {}
    try: verdict = json.loads(res["text"].strip().strip("`").removeprefix("json").strip())
    except Exception: verdict = {"parse_error": True, "raw": res["text"]}
    # annotation on character image only
    corr = verdict.get("correction") or "Mark the incorrect body alignment"
    ann = image_edit(f"Annotate this yoga character image: draw bold red circles and red arrows highlighting this error: {corr}. "
                     f"Keep the character and pose unchanged, only add red annotation marks.", [ref], item="f-annotate")
    ann_path = save_b64(ann["b64"], OUT / f"step{a.step}_{a.label}_annotated.png")
    report = {"step": a.step, "label": a.label, "via": via, "verdict": verdict, "annotated": ann_path.name, "vision_seconds": round(res["seconds"],1)}
    (OUT / f"report_step{a.step}_{a.label}.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))

if __name__ == "__main__": main()
