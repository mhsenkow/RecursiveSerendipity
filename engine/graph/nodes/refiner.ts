import type { GraphStateType } from "../state";
import type { OllamaProvider } from "../../providers/ollama";
import type { EngineEvent } from "../../types";

export function createRefinerNode(
  ollama: OllamaProvider,
  broadcast: (event: EngineEvent) => void
) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    broadcast({
      type: "status",
      data: {
        runId: state.runId,
        state: "refining",
        iteration: state.iteration,
      },
      timestamp: new Date().toISOString(),
    });

    // The refiner sends the critique back to the generator model
    // for the next iteration. It prepares the state for re-entry.
    const newIteration = state.iteration + 1;

    broadcast({
      type: "log",
      data: {
        runId: state.runId,
        iteration: newIteration,
        message: `Starting refinement iteration ${newIteration}/${state.maxIterations}`,
      },
      timestamp: new Date().toISOString(),
    });

    return {
      iteration: newIteration,
      state: "generating",
    };
  };
}
