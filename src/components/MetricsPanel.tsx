import { useRef, useEffect } from "react";
import type { HealthResponse } from "../lib/tauri-bridge";
import type { StreamState } from "../hooks/useEngine";

interface MetricsPanelProps {
  health: HealthResponse | null;
  connected: boolean;
  logs: Array<{ message: string; timestamp: string }>;
  stream: StreamState | null;
}

export function MetricsPanel({ health, connected, logs, stream }: MetricsPanelProps) {
  const streamRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [stream?.text]);

  const thermalColor: Record<string, string> = {
    nominal: "#22c55e", moderate: "#eab308", heavy: "#f97316", critical: "#ef4444",
  };

  return (
    <div style={styles.container}>
      {/* Status bar */}
      <div style={styles.statusBar}>
        <div style={styles.statusGroup}>
          <div style={{ ...styles.dot, backgroundColor: connected ? "#22c55e" : "#ef4444" }} />
          <span style={styles.label}>Engine</span>
        </div>
        <div style={styles.statusGroup}>
          <div style={{ ...styles.dot, backgroundColor: health?.ollama?.running ? "#22c55e" : "#ef4444" }} />
          <span style={styles.label}>Ollama</span>
        </div>
        {health?.ollama?.currentModel && (
          <span style={styles.modelTag}>{health.ollama.currentModel}</span>
        )}
        {health?.thermal && (
          <div style={styles.statusGroup}>
            <div style={{ ...styles.dot, backgroundColor: thermalColor[health.thermal.thermalPressure] ?? "rgba(255,255,255,0.3)" }} />
            <span style={styles.label}>{health.thermal.thermalPressure}</span>
          </div>
        )}
        {stream && (
          <span style={styles.streamLabel}>
            {stream.label} — {stream.totalChars.toLocaleString()} chars
          </span>
        )}
      </div>

      {/* Live stream: show AI writing in real-time */}
      {stream && (
        <div style={styles.streamContainer}>
          <div style={styles.streamHeader}>
            <span style={styles.streamHeaderLabel}>{stream.label}</span>
            <span style={styles.streamCursor} />
          </div>
          <pre ref={streamRef} style={styles.streamPre}>
            {stream.text}
          </pre>
        </div>
      )}

      {/* Log lines (show when not streaming) */}
      {!stream && logs.length > 0 && (
        <div style={styles.logContainer}>
          {logs.slice(-6).map((log, i) => (
            <div key={i} style={styles.logLine}>
              <span style={styles.logTime}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span style={styles.logMsg}>{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.25)",
  },
  statusBar: {
    display: "flex", alignItems: "center", gap: 14,
    padding: "8px 20px", flexWrap: "wrap",
  },
  statusGroup: { display: "flex", alignItems: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: "50%" },
  label: { fontSize: "11px", color: "rgba(255,255,255,0.45)" },
  modelTag: {
    fontSize: "10px", padding: "1px 6px", borderRadius: 4,
    background: "rgba(99,102,241,0.2)", color: "#a5b4fc",
    fontFamily: "'JetBrains Mono', monospace",
  },
  streamLabel: {
    fontSize: "11px", color: "#6366f1", fontWeight: 500, marginLeft: "auto",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  streamContainer: {
    borderTop: "1px solid rgba(255,255,255,0.04)",
  },
  streamHeader: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 20px",
    background: "rgba(99,102,241,0.05)",
    borderBottom: "1px solid rgba(99,102,241,0.1)",
  },
  streamHeaderLabel: {
    fontSize: "11px", fontWeight: 600, color: "#818cf8",
    textTransform: "uppercase" as const, letterSpacing: "0.04em",
  },
  streamCursor: {
    width: 6, height: 14, background: "#6366f1", borderRadius: 1,
    animation: "pulse 0.8s ease-in-out infinite",
  },
  streamPre: {
    margin: 0, padding: "8px 20px 10px", fontSize: "11px",
    fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.55)",
    lineHeight: 1.5, maxHeight: 160, overflow: "auto",
    whiteSpace: "pre-wrap", wordBreak: "break-all",
    background: "rgba(0,0,0,0.15)",
  },
  logContainer: {
    borderTop: "1px solid rgba(255,255,255,0.04)",
    padding: "6px 20px",
  },
  logLine: {
    display: "flex", gap: 10, padding: "1px 0",
    fontSize: "11px", fontFamily: "'JetBrains Mono', monospace",
  },
  logTime: { color: "rgba(255,255,255,0.2)", flexShrink: 0 },
  logMsg: { color: "rgba(255,255,255,0.45)" },
};
