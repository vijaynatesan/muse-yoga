"""Deterministic annotated image: draws red circles/arrows on a COPY of the boy-based step image.
Guarantees character + anatomy unchanged (only pixels added are red marks). No API cost.
Coords are relative (x,y,r) chosen for final/step1.png side view."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.meta_api import POC
from PIL import Image, ImageDraw

src = POC / "outputs/b/final/step1.png"
out = POC / "outputs/f/final_annotated_boy_step1.png"
im = Image.open(src).convert("RGB"); w, h = im.size; d = ImageDraw.Draw(im)
for (x, y, r) in [(0.80, 0.52, 95), (0.88, 0.74, 70)]:  # knees, feet for step1 correction
    d.ellipse([w*x-r, h*y-r, w*x+r, h*y+r], outline=(220, 0, 0), width=9)
    d.line([w*x+r, h*y-r, w*x+r+70, h*y-r-70], fill=(220, 0, 0), width=9)
out.parent.mkdir(parents=True, exist_ok=True); im.save(out)
print(f"saved {out} from {src.name} size={im.size}")
