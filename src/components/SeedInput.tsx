import { useState } from "react";
import { startRun, type RunConfig } from "../lib/tauri-bridge";

interface SeedInputProps {
  onRunStarted: (runId: string) => void;
  disabled: boolean;
  availableModels: string[];
}

export function SeedInput({ onRunStarted, disabled, availableModels }: SeedInputProps) {
  const [seed, setSeed] = useState("");
  const [numVariants, setNumVariants] = useState(5);
  const [numIterations, setNumIterations] = useState(2);
  const [generatorModel, setGeneratorModel] = useState("llama3.3:latest");
  const [criticModel, setCriticModel] = useState("deepseek-r1:70b");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!seed.trim() || submitting) return;

    setSubmitting(true);
    try {
      const config: RunConfig = {
        seed: seed.trim(),
        numVariants,
        numIterations,
        generatorModel,
        criticModel,
      };
      const result = await startRun(config);
      onRunStarted(result.runId);
    } catch (err) {
      console.error("Failed to start run:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.inputRow}>
        <textarea
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="Describe what you want... e.g. '10 different Pong games' or '5 creative portfolio landing pages'"
          style={styles.textarea}
          disabled={disabled || submitting}
          rows={2}
        />
        <button
          type="submit"
          disabled={!seed.trim() || disabled || submitting}
          style={{ ...styles.button, opacity: !seed.trim() || disabled || submitting ? 0.5 : 1 }}
        >
          {submitting ? "Starting..." : "Evolve"}
        </button>
      </div>

      <div style={styles.quickSettings}>
        <label style={styles.inlineLabel}>
          Variants:
          <select value={numVariants} onChange={(e) => setNumVariants(parseInt(e.target.value))} style={styles.inlineSelect}>
            {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={styles.inlineLabel}>
          Iterations:
          <select value={numIterations} onChange={(e) => setNumIterations(parseInt(e.target.value))} style={styles.inlineSelect}>
            {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} style={styles.advancedToggle}>
          {showAdvanced ? "Less" : "More"} options
        </button>
      </div>

      {showAdvanced && (
        <div style={styles.advanced}>
          <div style={styles.field}>
            <label style={styles.label}>Generator Model</label>
            <select value={generatorModel} onChange={(e) => setGeneratorModel(e.target.value)} style={styles.select}>
              {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Critic Model</label>
            <select value={criticModel} onChange={(e) => setCriticModel(e.target.value)} style={styles.select}>
              {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: { padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  inputRow: { display: "flex", gap: "12px", alignItems: "flex-start" },
  textarea: {
    flex: 1, padding: "12px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontSize: "14px",
    fontFamily: "'Inter', system-ui, sans-serif", resize: "none", outline: "none", lineHeight: 1.5,
  },
  button: {
    padding: "12px 24px", borderRadius: "10px", border: "none",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white",
    fontSize: "14px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  },
  quickSettings: { marginTop: "8px", display: "flex", alignItems: "center", gap: "16px" },
  inlineLabel: { fontSize: "12px", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: "6px" },
  inlineSelect: {
    padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontSize: "12px", outline: "none",
  },
  advancedToggle: { background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "11px", cursor: "pointer", marginLeft: "auto" },
  advanced: { marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "12px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  label: { fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 500 },
  select: { padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontSize: "13px", outline: "none" },
};
