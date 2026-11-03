"""POC-c: extract text+images per asana from reference PDF, measure time. No API cost."""
import json, re, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.meta_api import POC, ROOT
import fitz  # PyMuPDF

PDF = ROOT / "reference/common_yoga_protocol_india_govt/Common_Yoga_protocol_english,_2018_(Government_of_India).pdf"
OUT = POC / "outputs" / "c"; OUT.mkdir(parents=True, exist_ok=True)

def main():
    t0 = time.time()
    doc = fitz.open(PDF)
    pages, total_images = [], 0
    for i, page in enumerate(doc):
        text = page.get_text()
        imgs = page.get_images(full=True)
        total_images += len(imgs)
        pages.append({"page": i+1, "chars": len(text), "images": len(imgs), "text": text})
    extract_s = time.time() - t0
    # Save page images (cap: first image per page, max 40 pages) to prove image extraction
    img_saved = 0
    for i, page in enumerate(doc):
        for xref, *_ in page.get_images(full=True)[:1]:
            try:
                pix = fitz.Pixmap(doc, xref)
                if pix.n > 4: pix = fitz.Pixmap(fitz.csRGB, pix)
                pix.save(OUT / f"page{i+1:02d}_img.png"); img_saved += 1
            except Exception as e: print("img err", e)
        if i >= 39: break
    # Heuristic per-asana split: headings in this book are numbered asana names.
    full = "\n".join(p["text"] for p in pages)
    (OUT / "full_text.txt").write_text(full)
    # Known asana markers in Common Yoga Protocol (search occurrences + context)
    candidates = ["Tadasana","Vrikshasana","Ardha Chakrasana","Chakrasana","Bhujangasana","Shalabhasana",
                  "Dhanurasana","Sarvangasana","Halasana","Matsyasana","Ushtrasana","Shashankasana",
                  "Vakrasana","Kapalbhati","Anuloma","Bhramari","Shavasana"]
    found = {}
    for name in candidates:
        idx = [m.start() for m in re.finditer(re.escape(name), full, re.I)]
        if idx: found[name] = {"occurrences": len(idx), "snippet": full[idx[0]:idx[0]+400].replace("\n"," ")[:400]}
        if idx:
            d = OUT / name.lower().replace(" ","_"); d.mkdir(exist_ok=True)
            (d / "text.txt").write_text(full[idx[0]:idx[0]+2500])
    report = {"pdf": PDF.name, "pages": len(doc), "total_embedded_images": total_images,
              "images_saved_sample": img_saved, "chars": len(full), "extract_seconds": round(extract_s,2),
              "sec_per_page": round(extract_s/max(len(doc),1),3), "asanas_found": found}
    (OUT / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "asanas_found"}, indent=2))
    print("asanas_found:", {k: v["occurrences"] for k, v in found.items()})
    print(f"CONCLUSION: full book extracted in {extract_s:.1f}s -> in production this must be a background/batch job (scope 8), not a blocking upload request.")

if __name__ == "__main__": main()
