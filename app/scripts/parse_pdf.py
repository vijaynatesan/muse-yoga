#!/usr/bin/env python3
"""Reference PDF parse worker (design §6/A6). PyMuPDF extraction, per-asana index."""
import sys, json, re
from pathlib import Path

pdf_path, book_id = sys.argv[1], sys.argv[2]
out_dir = Path(pdf_path).parent
try:
    import fitz  # PyMuPDF
    doc = fitz.open(pdf_path)
    text = "\n".join(page.get_text() for page in doc)
    pages = len(doc)
except Exception as e:
    # Fallback: raw byte text scan so status still resolves honestly for text PDFs
    try:
        raw = Path(pdf_path).read_bytes().decode("latin-1", errors="ignore")
        text, pages = raw, 0
    except Exception:
        (out_dir / "extracted.json").write_text(json.dumps({"asanas": [], "error": str(e)}))
        sys.exit(1)

candidates = ["Tadasana","Vrikshasana","Pada-Hastasana","Ardha Chakrasana","Trikonasana","Bhujangasana","Shalabhasana","Dhanurasana","Sarvangasana","Halasana","Matsyasana","Ushtrasana","Shashankasana","Vakrasana","Kapalbhati","Anuloma Viloma","Bhramari","Shavasana","Surya Namaskar","Chakrasana"]
found = [c for c in candidates if c.lower() in text.lower()]
(out_dir / "extracted.json").write_text(json.dumps({"asanas": found, "pages": pages, "chars": len(text), "textSample": text[:2000]}))
print(json.dumps({"asanas": found, "pages": pages}))
