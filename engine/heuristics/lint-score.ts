import type { LintResult } from "../types";

export function calculateLintScore(result: LintResult): number {
  if (result.errorCount === 0 && result.warningCount === 0) return 10;
  if (result.errorCount === 0) return Math.max(7, 10 - result.warningCount * 0.5);

  // Steep penalty for errors, mild for warnings
  const errorPenalty = Math.min(result.errorCount * 1.5, 8);
  const warningPenalty = Math.min(result.warningCount * 0.3, 2);
  return Math.max(0, 10 - errorPenalty - warningPenalty);
}
