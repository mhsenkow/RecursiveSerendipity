import type { GraphStateType } from "../state";
import type { OllamaProvider } from "../../providers/ollama";
import type { Database } from "../../memory/sqlite";
import type { Variant, EngineEvent } from "../../types";
import { calculateComposite } from "../../heuristics/score";

const SYSTEM_PROMPT = `You are a ruthlessly honest senior code reviewer. You evaluate React/TypeScript components and are known for high standards.

Respond with this exact format:

QUALITY_SCORE: <number from 1 to 10>
ISSUES:
- <issue 1>
- <issue 2>
IMPROVEMENTS:
- <specific actionable improvement 1>
- <specific actionable improvement 2>
SUMMARY: <one paragraph assessment>

Scoring guide -- be strict:
- 1-3: Broken, wrong approach, or missing core requirements
- 4-5: Works but generic, bland, or has significant quality issues
- 6-7: Decent but needs meaningful improvements before shipping
- 8-9: Excellent, polished, only minor tweaks needed
- 10: Truly exceptional, would not change anything

Most first-attempt generated code should score 4-6. Reserve 8+ for genuinely impressive work.`;

export function createEvaluatorNode(
  ollama: OllamaProvider,
  db: Database,
  broadcast: (event: EngineEvent) => void
) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const errorSummary =
      state.lintResult && state.lintResult.errorCount > 0
        ? `\n\nTypeScript/lint errors:\n${state.lintResult.errors
            .slice(0, 20)
            .map((e) => `  Line ${e.line}: ${e.message}`)
            .join("\n")}`
        : "\n\nNo TypeScript or lint errors found.";

    const prompt = `Review this React/TypeScript component:

Original requirement: ${state.seed}

Code:
\`\`\`tsx
${state.currentCode}
\`\`\`

Build score: ${state.scores?.build ?? "N/A"}/10
Lint score: ${state.scores?.lint ?? "N/A"}/10
${errorSummary}

Be strict. Most AI-generated code deserves a 4-6. Only give 8+ if it's genuinely impressive.`;

    const response = await ollama.generate(
      state.criticModel,
      prompt,
      SYSTEM_PROMPT,
      { temperature: 0.3, num_predict: 2048 }
    );

    const qualityScore = parseQualityScore(response);
    const composite = calculateComposite(
      state.scores!.lint,
      state.scores!.build,
      qualityScore
    );

    const finalScores = {
      lint: state.scores!.lint,
      build: state.scores!.build,
      composite,
    };

    // NOW save the variant with full scores and critique
    const variant: Variant = {
      id: crypto.randomUUID(),
      runId: state.runId,
      iteration: state.iteration,
      code: state.currentCode,
      critique: response,
      scores: finalScores,
      parentVariantId:
        state.variants.length > 0
          ? state.variants[state.variants.length - 1].id
          : null,
      createdAt: new Date().toISOString(),
    };

    db.saveVariant(variant);

    broadcast({
      type: "variant",
      data: variant,
      timestamp: new Date().toISOString(),
    });

    broadcast({
      type: "log",
      data: {
        runId: state.runId,
        iteration: state.iteration,
        message: `Evaluation: quality=${qualityScore}/10, composite=${composite}/10 (threshold: ${state.threshold})`,
      },
      timestamp: new Date().toISOString(),
    });

    return {
      critique: response,
      scores: finalScores,
      variants: [...state.variants, variant],
      state: "refining",
    };
  };
}

function parseQualityScore(response: string): number {
  // Look for our structured format first
  const match = response.match(/QUALITY_SCORE:\s*(\d+(?:\.\d+)?)/);
  if (match) return Math.min(10, Math.max(1, parseFloat(match[1])));

  // Fallback: look for score patterns
  const fallback = response.match(/score[:\s]*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
  if (fallback) return Math.min(10, Math.max(1, parseFloat(fallback[1])));

  // If we can't parse a score, assume mediocre -- force another iteration
  return 4;
}
