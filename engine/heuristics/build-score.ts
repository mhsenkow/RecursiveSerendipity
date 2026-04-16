import type { LintResult } from "../types";

export function calculateBuildScore(lintResult: LintResult): number {
  // Build score focuses on whether the code would compile
  // TypeScript errors = won't compile, warnings are acceptable
  if (lintResult.errorCount === 0) return 10;

  const tsErrors = lintResult.errors.filter(
    (e) => e.ruleId?.startsWith("TS")
  ).length;
  const otherErrors = lintResult.errorCount - tsErrors;

  // TS errors are critical for builds
  const tsPenalty = Math.min(tsErrors * 2, 8);
  const otherPenalty = Math.min(otherErrors * 1, 2);
  return Math.max(0, 10 - tsPenalty - otherPenalty);
}
