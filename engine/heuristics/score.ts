import type { Scores, LintResult } from "../types";
import { calculateLintScore } from "./lint-score";
import { calculateBuildScore } from "./build-score";

export function calculateBuildScores(lintResult: LintResult): Pick<Scores, "lint" | "build"> {
  return {
    lint: Math.round(calculateLintScore(lintResult) * 10) / 10,
    build: Math.round(calculateBuildScore(lintResult) * 10) / 10,
  };
}

export function calculateComposite(
  lint: number,
  build: number,
  quality: number
): number {
  // Quality (critic assessment) is the heaviest weight -- clean code that
  // looks generic or misses the brief should NOT pass.
  return Math.round((lint * 0.2 + build * 0.2 + quality * 0.6) * 10) / 10;
}
