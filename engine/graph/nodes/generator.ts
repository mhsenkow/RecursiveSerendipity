import type { GraphStateType } from "../state";
import type { OllamaProvider } from "../../providers/ollama";

const SYSTEM_PROMPT = `You are a senior React/TypeScript developer. Your task is to generate a complete, production-quality React component based on a project description.

Rules:
- Output ONLY the TypeScript/TSX code, no explanations or markdown fences
- Use functional components with hooks
- Include proper TypeScript types (no 'any')
- Use modern React patterns (React 19 compatible)
- Include inline styles or CSS-in-JS (no external CSS files needed)
- The component must be self-contained in a single file
- Include all necessary imports at the top
- Export the component as a named export AND a default export
- Make the UI visually appealing with modern design patterns`;

export function createGeneratorNode(ollama: OllamaProvider) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const isFirstIteration = state.iteration === 0;

    let prompt: string;

    if (isFirstIteration) {
      prompt = `Create a React component based on this description:\n\n${state.seed}\n\nGenerate complete, compilable TypeScript/TSX code.`;
    } else {
      prompt = `The previous version of this React component had issues.

Original request: ${state.seed}

Previous code:
\`\`\`tsx
${state.currentCode}
\`\`\`

Critique from the reviewer:
${state.critique}

${state.lintResult && state.lintResult.errorCount > 0
  ? `TypeScript/lint errors found:\n${state.lintResult.errors.map((e) => `  Line ${e.line}: ${e.message} (${e.ruleId})`).join("\n")}`
  : ""}

Generate an improved version that addresses ALL the feedback. Output ONLY the complete TSX code, no explanations.`;
    }

    const response = await ollama.generate(
      state.generatorModel,
      prompt,
      SYSTEM_PROMPT,
      { temperature: isFirstIteration ? 0.8 : 0.5, num_predict: 4096 }
    );

    const code = extractCode(response);

    return {
      previousCode: state.currentCode || "",
      currentCode: code,
      state: "checking",
      iteration: state.iteration + (isFirstIteration ? 1 : 0),
    };
  };
}

function extractCode(response: string): string {
  // Try to extract code from markdown fences if the model wrapped it
  const fenceMatch = response.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // If the response starts with import/export, it's likely raw code
  const trimmed = response.trim();
  if (trimmed.startsWith("import ") || trimmed.startsWith("export ") || trimmed.startsWith("\"use ") || trimmed.startsWith("'use ")) {
    return trimmed;
  }

  // Last resort: take everything after the first line that looks like code
  const lines = trimmed.split("\n");
  const codeStart = lines.findIndex(
    (l) => l.startsWith("import ") || l.startsWith("export ") || l.startsWith("const ") || l.startsWith("function ")
  );
  if (codeStart >= 0) {
    return lines.slice(codeStart).join("\n").trim();
  }

  return trimmed;
}
