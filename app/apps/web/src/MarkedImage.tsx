import React from "react";

/** Stored step image with optional numbered circles (programmatic overlay, C8).
 *  The wrapper shrink-wraps the <img>, so mark percentages map to the image itself. */
export function MarkedImage({ src, marks, alt }: { src: string; marks?: Array<{ x: number; y: number; r: number; n?: number }>; alt: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", background: "var(--soft)", borderRadius: 12 }}>
      <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
        <img src={src} alt={alt} style={{ display: "block", maxWidth: "100%", maxHeight: "50dvh", objectFit: "contain" }} />
        {(marks || []).map((mk, i) => (
          <span key={i} aria-hidden style={{ position: "absolute", left: `${mk.x * 100}%`, top: `${mk.y * 100}%`, width: `${mk.r * 200}%`, aspectRatio: "1", minWidth: 26, transform: "translate(-50%,-50%)", border: "3px solid #C0392B", borderRadius: "50%", pointerEvents: "none", display: "grid", placeItems: "center" }}>
            <span style={{ background: "#C0392B", color: "#fff", font: "700 13px/1 Outfit, sans-serif", minWidth: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center" }}>{mk.n ?? i + 1}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
