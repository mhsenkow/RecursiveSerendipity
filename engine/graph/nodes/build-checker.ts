import type { GraphStateType } from "../state";
import { lintCode } from "../../execution/linter";
import { createSandbox } from "../../execution/sandbox";
import { calculateBuildScores } from "../../heuristics/score";
import type { EngineEvent } from "../../types";

export function createBuildCheckerNode(
  broadcast: (event: EngineEvent) => void
) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const sandboxDir = createSandbox(state.runId, state.iteration);
    const lintResult = await lintCode(state.currentCode, sandboxDir);
    const partialScores = calculateBuildScores(lintResult);

    broadcast({
      type: "log",
      data: {
        runId: state.runId,
        iteration: state.iteration,
        message: `Build check: ${lintResult.errorCount} errors, ${lintResult.warningCount} warnings (lint: ${partialScores.lint}/10, build: ${partialScores.build}/10)`,
      },
      timestamp: new Date().toISOString(),
    });

    return {
      lintResult,
      scores: {
        lint: partialScores.lint,
        build: partialScores.build,
        composite: 0,
      },
      state: "evaluating",
    };
  };
}
