import type { Variant } from "../lib/tauri-bridge";

interface Props {
  variants: Variant[];
  currentIteration: number;
  runState: string | null;
}

export function EvolutionTimeline({ variants, currentIteration, runState }: Props) {
  const stateLabel: Record<string, string> = {
    generating: "Generating...", evaluating: "Evaluating...", refining: "Refining...", complete: "Complete", error: "Error",
  };
  const stateColor: Record<string, string> = {
    generating: "#6366f1", evaluating: "#8b5cf6", refining: "#06b6d4", complete: "#22c55e", error: "#ef4444",
  };

  const evaluated = variants.filter((v) => v.scores.composite > 0);
  const avgScore = evaluated.length > 0 ? evaluated.reduce((s, v) => s + v.scores.composite, 0) / evaluated.length : 0;

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: stateColor[runState ?? ""] ?? "rgba(255,255,255,0.2)", boxShadow: runState && runState !== "complete" ? `0 0 8px ${stateColor[runState]}` : "none", transition: "all 0.3s" }} />
        <span style={styles.label}>{stateLabel[runState ?? ""] ?? "Idle"}</span>
      </div>
      <div style={styles.stats}>
        <span style={styles.stat}>Iter {currentIteration}</span>
        <span style={styles.stat}>{variants.length} variants</span>
        {avgScore > 0 && <span style={styles.stat}>Avg: {avgScore.toFixed(1)}/10</span>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  left: { display: "flex", alignItems: "center", gap: 8 },
  label: { fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.6)" },
  stats: { display: "flex", gap: 16 },
  stat: { fontSize: "12px", color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" },
};
