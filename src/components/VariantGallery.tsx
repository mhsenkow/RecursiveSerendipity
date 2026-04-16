import { useState } from "react";
import { ComponentPreview } from "./ComponentPreview";
import type { Variant } from "../lib/tauri-bridge";
import { downloadAllVariantsZip, downloadVariantHtml } from "../lib/exportVariants";

interface VariantGalleryProps {
  variants: Variant[];
  runState: string | null;
  runId: string | null;
}

type ViewMode = "gallery" | "detail" | "fullscreen";

export function VariantGallery({ variants, runState, runId }: VariantGalleryProps) {
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");

  if (variants.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>
          {runState === "generating"
            ? "Generating variants... each one will appear here as it's created"
            : runState === "evaluating"
              ? "Critic is reviewing the variants..."
              : "Enter a prompt and hit Evolve to generate apps"}
        </p>
      </div>
    );
  }

  function scoreColor(s: number): string {
    if (s >= 8) return "#22c55e";
    if (s >= 6) return "#eab308";
    if (s >= 4) return "#f97316";
    return "#ef4444";
  }

  function openDetail(v: Variant) {
    setSelectedVariant(v);
    setViewMode("detail");
  }

  function openFullscreen(v: Variant) {
    setSelectedVariant(v);
    setViewMode("fullscreen");
  }

  function closeOverlay() {
    setSelectedVariant(null);
    setViewMode("gallery");
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button
          type="button"
          style={styles.toolbarBtnPrimary}
          onClick={() => downloadAllVariantsZip(variants, runId)}
        >
          Download all as .zip
        </button>
        <span style={styles.toolbarHint}>
          Folder of standalone HTML files — open any file in a browser. Use “Save .html” on a card for one variant.
        </span>
      </div>
      <div style={styles.grid}>
        {variants.map((v, i) => (
          <div
            key={v.id}
            style={{ ...styles.card, borderColor: v.scores.composite > 0 ? scoreColor(v.scores.composite) : "rgba(255,255,255,0.08)", animationDelay: `${i * 40}ms` }}
          >
            <div style={styles.cardHeader}>
              <span style={styles.tag}>Iter {v.iteration} #{v.variantIndex + 1}</span>
              <div style={styles.cardActions}>
                {v.scores.composite > 0 && (
                  <span style={{ ...styles.score, color: scoreColor(v.scores.composite) }}>
                    {v.scores.composite.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            <div style={styles.previewWrap}>
              <ComponentPreview code={v.code} height={180} showFullscreenButton />
            </div>
            <div style={styles.cardFooter}>
              <button type="button" style={styles.cardBtn} onClick={() => openFullscreen(v)}>Fullscreen</button>
              <button type="button" style={styles.cardBtn} onClick={() => openDetail(v)}>Details</button>
              <button
                type="button"
                style={styles.cardBtn}
                onClick={() => downloadVariantHtml(v, runId)}
              >
                Save .html
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Fullscreen overlay -- just the app, edge to edge */}
      {selectedVariant && viewMode === "fullscreen" && (
        <div style={styles.fullscreenOverlay}>
          <div style={styles.fullscreenBar}>
            <span style={styles.fullscreenTitle}>
              Iter {selectedVariant.iteration} #{selectedVariant.variantIndex + 1}
              {selectedVariant.scores.composite > 0 && (
                <span style={{ color: scoreColor(selectedVariant.scores.composite), marginLeft: 8 }}>
                  {selectedVariant.scores.composite.toFixed(1)}/10
                </span>
              )}
            </span>
            <div style={styles.fullscreenActions}>
              <button
                type="button"
                onClick={() => downloadVariantHtml(selectedVariant, runId)}
                style={styles.fullscreenDownload}
              >
                Save .html
              </button>
              <button type="button" onClick={closeOverlay} style={styles.fullscreenClose}>Exit Fullscreen</button>
            </div>
          </div>
          <iframe
            srcDoc={selectedVariant.code}
            sandbox="allow-scripts allow-same-origin"
            allow="fullscreen"
            style={styles.fullscreenIframe}
            title="Fullscreen Preview"
          />
        </div>
      )}

      {/* Detail modal -- preview + critique + code */}
      {selectedVariant && viewMode === "detail" && (
        <div style={styles.overlay} onClick={closeOverlay}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTop}>
              <h3 style={styles.modalTitle}>
                Iteration {selectedVariant.iteration}, Variant #{selectedVariant.variantIndex + 1}
                {selectedVariant.scores.composite > 0 && (
                  <span style={{ color: scoreColor(selectedVariant.scores.composite), marginLeft: 12 }}>
                    {selectedVariant.scores.composite.toFixed(1)}/10
                  </span>
                )}
              </h3>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => downloadVariantHtml(selectedVariant, runId)}
                  style={styles.modalBtnSecondary}
                >
                  Download .html
                </button>
                <button type="button" onClick={() => setViewMode("fullscreen")} style={styles.modalBtn}>Fullscreen</button>
                <button type="button" onClick={closeOverlay} style={styles.close}>&times;</button>
              </div>
            </div>
            {selectedVariant.scores.composite > 0 && (
              <div style={styles.scoreBar}>
                <span style={styles.scorePill}>Code: {selectedVariant.scores.quality.toFixed(1)}</span>
                <span style={styles.scorePill}>Visual: {selectedVariant.scores.visual.toFixed(1)}</span>
                <span style={{ ...styles.scorePill, background: `${scoreColor(selectedVariant.scores.composite)}22`, color: scoreColor(selectedVariant.scores.composite) }}>
                  Composite: {selectedVariant.scores.composite.toFixed(1)}
                </span>
              </div>
            )}
            <div style={styles.modalBody}>
              <ComponentPreview code={selectedVariant.code} height={400} showFullscreenButton />
              {selectedVariant.screenshotBase64 && (
                <details style={styles.details} open>
                  <summary style={styles.summary}>AI Screenshot (what the vision model saw)</summary>
                  <div style={{ padding: 12, background: "#000", textAlign: "center" }}>
                    <img
                      src={`data:image/png;base64,${selectedVariant.screenshotBase64}`}
                      alt="Screenshot"
                      style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                  </div>
                </details>
              )}
              {selectedVariant.visionFeedback && (
                <details style={styles.details}>
                  <summary style={styles.summary}>Vision Model Feedback</summary>
                  <pre style={styles.critique}>{selectedVariant.visionFeedback}</pre>
                </details>
              )}
              {selectedVariant.critique && (
                <details style={styles.details}>
                  <summary style={styles.summary}>Code Critic Review</summary>
                  <pre style={styles.critique}>{selectedVariant.critique}</pre>
                </details>
              )}
              <details style={styles.details}>
                <summary style={styles.summary}>Source Code</summary>
                <pre style={styles.codeBlock}>{selectedVariant.code}</pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, overflow: "auto", padding: "16px 20px" },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
  },
  toolbarBtnPrimary: {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  toolbarHint: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.45)",
    lineHeight: 1.45,
    maxWidth: 520,
  },
  empty: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 },
  emptyText: { fontSize: "14px", color: "rgba(255,255,255,0.35)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" },
  card: {
    borderRadius: "12px", border: "2px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)",
    overflow: "hidden", animation: "fadeIn 0.3s ease-out forwards", opacity: 0,
    transition: "border-color 0.3s",
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px" },
  cardActions: { display: "flex", alignItems: "center", gap: "8px" },
  tag: { fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  score: { fontSize: "18px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
  previewWrap: { padding: "0 8px" },
  cardFooter: {
    display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px 14px 12px",
  },
  cardBtn: {
    flex: "1 1 30%", minWidth: "72px", padding: "6px 4px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: "11px",
    fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
  },
  // Fullscreen overlay
  fullscreenOverlay: {
    position: "fixed", inset: 0, zIndex: 200,
    background: "#000", display: "flex", flexDirection: "column",
  },
  fullscreenBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 16px", background: "rgba(0,0,0,0.9)", borderBottom: "1px solid rgba(255,255,255,0.1)",
    flexShrink: 0,
  },
  fullscreenActions: { display: "flex", alignItems: "center", gap: "10px" },
  fullscreenTitle: { fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)" },
  fullscreenDownload: {
    padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(99,102,241,0.4)",
    background: "rgba(99,102,241,0.15)", color: "#c7d2fe", fontSize: "12px",
    cursor: "pointer", fontWeight: 500,
  },
  fullscreenClose: {
    padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: "12px",
    cursor: "pointer",
  },
  fullscreenIframe: {
    flex: 1, width: "100%", border: "none", background: "#fff",
  },
  // Detail modal
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "32px" },
  modal: { background: "#1a1a2e", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 960, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalTop: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  modalTitle: { margin: 0, fontSize: "15px", fontWeight: 600, color: "#e4e4e7" },
  modalActions: { display: "flex", alignItems: "center", gap: "8px" },
  modalBtn: {
    padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(99,102,241,0.1)", color: "#a5b4fc", fontSize: "12px", fontWeight: 500, cursor: "pointer",
  },
  modalBtnSecondary: {
    padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", fontSize: "12px", fontWeight: 500, cursor: "pointer",
  },
  close: { background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "24px", cursor: "pointer" },
  scoreBar: { display: "flex", gap: 8, padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  scorePill: {
    fontSize: "11px", padding: "3px 10px", borderRadius: 6,
    background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)",
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
  },
  modalBody: { overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" },
  details: { borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" },
  summary: { padding: "10px 14px", fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", background: "rgba(255,255,255,0.02)" },
  critique: { fontSize: "12px", color: "rgba(255,255,255,0.6)", padding: "14px", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 250, overflow: "auto" },
  codeBlock: { fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#e4e4e7", background: "rgba(0,0,0,0.3)", padding: "14px", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.4, maxHeight: 300, overflow: "auto" },
};
