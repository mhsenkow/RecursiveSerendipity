import type { GraphStateType } from "./state";

export function shouldContinue(state: GraphStateType): "refine" | "complete" {
  if (!state.scores) return "refine";
  if (state.scores.composite >= state.threshold) return "complete";
  if (state.iteration >= state.maxIterations) return "complete";
  return "refine";
}
