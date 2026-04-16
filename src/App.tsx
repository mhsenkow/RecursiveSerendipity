import { useCallback } from "react";
import { SeedInput } from "./components/SeedInput";
import { VariantGallery } from "./components/VariantGallery";
import { EvolutionTimeline } from "./components/EvolutionTimeline";
import { MetricsPanel } from "./components/MetricsPanel";
import { useEngine } from "./hooks/useEngine";
import { stopRun } from "./lib/tauri-bridge";
import "./App.css";

function App() {
  const engine = useEngine();

  const handleRunStarted = useCallback(
    (runId: string) => {
      engine.setActiveRunId(runId);
    },
    [engine.setActiveRunId]
  );

  const handleStop = useCallback(async () => {
    if (engine.activeRunId) {
      await stopRun(engine.activeRunId);
    }
  }, [engine.activeRunId]);

  const isRunning =
    engine.activeRunState !== null &&
    engine.activeRunState !== "complete" &&
    engine.activeRunState !== "error" &&
    engine.activeRunState !== "idle";

  const models = engine.health?.ollama?.availableModels ?? [];

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>RecursiveSerendipity</h1>
          <span className="app-subtitle">Evolutionary Perfection Engine</span>
        </div>
        {isRunning && (
          <button className="stop-button" onClick={handleStop}>
            Stop Run
          </button>
        )}
      </header>

      <SeedInput
        onRunStarted={handleRunStarted}
        disabled={isRunning}
        availableModels={models}
      />

      <EvolutionTimeline
        variants={engine.variants}
        currentIteration={engine.activeIteration}
        runState={engine.activeRunState}
      />

      <VariantGallery
        variants={engine.variants}
        runState={engine.activeRunState}
      />

      <MetricsPanel
        health={engine.health}
        connected={engine.connected}
        logs={engine.logs}
        stream={engine.stream}
      />
    </div>
  );
}

export default App;
