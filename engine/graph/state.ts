import { Annotation } from "@langchain/langgraph";
import type { Scores, LintResult, Variant } from "../types";

export const GraphState = Annotation.Root({
  runId: Annotation<string>,
  seed: Annotation<string>,
  currentCode: Annotation<string>,
  previousCode: Annotation<string>,
  critique: Annotation<string>,
  lintResult: Annotation<LintResult | null>,
  scores: Annotation<Scores | null>,
  iteration: Annotation<number>,
  maxIterations: Annotation<number>,
  threshold: Annotation<number>,
  generatorModel: Annotation<string>,
  criticModel: Annotation<string>,
  variants: Annotation<Variant[]>,
  state: Annotation<
    "generating" | "checking" | "evaluating" | "refining" | "complete" | "error"
  >,
  error: Annotation<string | null>,
});

export type GraphStateType = typeof GraphState.State;
