import type { OllamaProvider } from "../providers/ollama";
import type { Database } from "../memory/sqlite";
import type { RunConfig, RunStatus, Variant, EngineEvent } from "../types";
import { screenshotHtml, closeBrowser } from "../execution/screenshot";

function createStreamRelay(
  broadcast: (event: EngineEvent) => void,
  runId: string,
  label: string,
  intervalMs = 150
) {
  let buffer = "";
  let charCount = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function flush() {
    if (buffer.length === 0) return;
    broadcast({
      type: "stream",
      data: { runId, label, token: buffer, totalChars: charCount },
      timestamp: new Date().toISOString(),
    });
    buffer = "";
  }

  timer = setInterval(flush, intervalMs);

  return {
    onToken(token: string) {
      buffer += token;
      charCount += token.length;
    },
    stop() {
      if (timer) clearInterval(timer);
      flush();
    },
  };
}

const GENERATOR_SYSTEM = `You are an expert web developer. You create complete, self-contained HTML files that include ALL code inline — HTML, CSS, and JavaScript in a single file.

Rules:
- Output ONLY a complete HTML document starting with <!DOCTYPE html>
- ALL CSS must be in a <style> tag in the <head>
- ALL JavaScript must be in a <script> tag before </body>
- NO external dependencies, CDNs, or imports (everything inline)
- The app must be visually polished with modern CSS (gradients, shadows, animations)
- The app must be fully interactive and functional
- Use vanilla JavaScript (no frameworks)
- Make it look professional, not like a tutorial example`;

const CRITIC_SYSTEM = `You review HTML/CSS/JS apps. Be strict but fair.

Respond in this exact format:

SCORE: <number 1-10>
ISSUES:
- <issue>
FIXES:
- <specific fix>

Scoring:
1-3: Broken or fundamentally wrong
4-5: Works but looks amateur or is missing features
6-7: Good but needs polish
8-10: Excellent`;

export async function runEvolutionLoop(
  config: RunConfig,
  ollama: OllamaProvider,
  db: Database,
  broadcast: (event: EngineEvent) => void,
  signal: AbortSignal
) {
  const { id: runId, seed, numVariants, numIterations, generatorModel, criticModel } = config;

  try {
    // === ITERATION LOOP ===
    for (let iteration = 1; iteration <= numIterations; iteration++) {
      if (signal.aborted) throw new Error("Aborted");

      const isFirst = iteration === 1;
      const previousVariants = db.getVariants(runId);

      /** Best-first survivors we copy into this iteration (no new LLM call). */
      let keepers: Variant[] = [];
      /** Worst half we regenerate from critic feedback. */
      let parentsToRefine: Variant[] = [];

      if (!isFirst && previousVariants.length > 0) {
        const sorted = [...previousVariants]
          .filter((v) => v.iteration === iteration - 1)
          .sort((a, b) => b.scores.composite - a.scores.composite);

        const keepCount = Math.ceil(sorted.length / 2);
        keepers = sorted.slice(0, keepCount);
        parentsToRefine = sorted.slice(keepCount);
      }

      db.updateRunState(runId, "generating", iteration);
      broadcast({
        type: "status",
        data: { runId, state: "generating", iteration },
        timestamp: new Date().toISOString(),
      });

      // === POPULATE THIS ITERATION: carry forward best half + regenerate worst half ===
      if (!isFirst && keepers.length > 0) {
        for (let ki = 0; ki < keepers.length; ki++) {
          if (signal.aborted) throw new Error("Aborted");
          const prev = keepers[ki];
          broadcast({
            type: "log",
            data: {
              runId,
              iteration,
              message: `Carrying forward variant ${ki + 1}/${keepers.length} (composite ${prev.scores.composite}/10) — no regen.`,
            },
            timestamp: new Date().toISOString(),
          });
          const carried: Variant = {
            id: crypto.randomUUID(),
            runId,
            iteration,
            variantIndex: ki,
            code: prev.code,
            critique: prev.critique,
            visionFeedback: prev.visionFeedback,
            screenshotBase64: prev.screenshotBase64,
            scores: { ...prev.scores },
            parentVariantId: prev.id,
            createdAt: new Date().toISOString(),
          };
          db.saveVariant(carried);
          broadcast({ type: "variant", data: carried, timestamp: new Date().toISOString() });
        }
      }

      const refineCount = isFirst ? numVariants : parentsToRefine.length;
      const refineOffset = isFirst ? 0 : keepers.length;

      for (let vi = 0; vi < refineCount; vi++) {
        if (signal.aborted) throw new Error("Aborted");

        const variantNum = vi + 1;
        broadcast({
          type: "log",
          data: {
            runId,
            iteration,
            message: isFirst
              ? `Generating variant ${variantNum}/${refineCount}...`
              : `Regenerating weaker variant ${variantNum}/${refineCount}...`,
          },
          timestamp: new Date().toISOString(),
        });

        let prompt: string;

        if (isFirst) {
          prompt = `Create variant ${variantNum} of ${refineCount}. Each variant should be a DIFFERENT creative interpretation.

Project: ${seed}

Make this variant unique — try a different visual style, layout, or interaction approach than the others.
Output a complete HTML file.`;
        } else {
          const parent = parentsToRefine[vi];
          prompt = `Here is a previous version that scored ${parent.scores.composite}/10:

\`\`\`html
${parent.code}
\`\`\`

Critic feedback:
${parent.critique}

Improve this app based on the feedback. If the game or app already works, preserve the core mechanics and controls — fix bugs and polish incrementally rather than rewriting from scratch unless it is broken.
Output a complete HTML file.`;
        }

        const displayIdx = refineOffset + vi + 1;
        const relay = createStreamRelay(broadcast, runId, `Generating #${displayIdx}`);
        const response = await ollama.generate(generatorModel, prompt, GENERATOR_SYSTEM, {
          temperature: isFirst ? 0.9 : 0.55,
          num_predict: 8192,
        }, relay.onToken);
        relay.stop();

        const code = extractHtml(response);

        const variant: Variant = {
          id: crypto.randomUUID(),
          runId,
          iteration,
          variantIndex: refineOffset + vi,
          code,
          critique: "",
          visionFeedback: "",
          screenshotBase64: "",
          scores: { quality: 0, visual: 0, composite: 0 },
          parentVariantId: isFirst ? null : (parentsToRefine[vi]?.id ?? null),
          createdAt: new Date().toISOString(),
        };

        db.saveVariant(variant);
        broadcast({ type: "variant", data: variant, timestamp: new Date().toISOString() });
      }

      // === EVALUATE ALL VARIANTS FROM THIS ITERATION ===
      db.updateRunState(runId, "evaluating", iteration);
      broadcast({
        type: "status",
        data: { runId, state: "evaluating", iteration },
        timestamp: new Date().toISOString(),
      });

      const iterVariants = db.getVariants(runId).filter((v) => v.iteration === iteration);

      for (let vi = 0; vi < iterVariants.length; vi++) {
        if (signal.aborted) throw new Error("Aborted");

        const variant = iterVariants[vi];
        const num = vi + 1;

        const alreadyEvaluated =
          variant.critique.trim().length > 0 &&
          variant.scores.composite > 0 &&
          variant.scores.quality > 0;

        if (alreadyEvaluated) {
          broadcast({
            type: "log",
            data: {
              runId,
              iteration,
              message: `#${num}: carried forward — skipping duplicate critic/vision (composite ${variant.scores.composite}/10).`,
            },
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // --- Step 1: Screenshot the rendered app ---
        broadcast({
          type: "log",
          data: { runId, iteration, message: `Screenshotting variant ${num}/${iterVariants.length}...` },
          timestamp: new Date().toISOString(),
        });

        let screenshotB64 = "";
        try {
          const buf = await screenshotHtml(variant.code);
          screenshotB64 = buf.toString("base64");
        } catch (err) {
          broadcast({
            type: "log",
            data: { runId, iteration, message: `Screenshot failed for #${num}: ${err}` },
            timestamp: new Date().toISOString(),
          });
        }

        // --- Step 2: Code critique (text model reads the source) ---
        broadcast({
          type: "log",
          data: { runId, iteration, message: `Code review #${num}...` },
          timestamp: new Date().toISOString(),
        });

        const critiquePrompt = `Review this app.

Original brief: ${seed}

\`\`\`html
${variant.code}
\`\`\`

Does it meet the brief? Is it polished? Is it interactive? Be strict.`;

        const critiqueRelay = createStreamRelay(broadcast, runId, `Critiquing #${num}`);
        const critiqueResponse = await ollama.generate(criticModel, critiquePrompt, CRITIC_SYSTEM, {
          temperature: 0.3,
          num_predict: 1024,
        }, critiqueRelay.onToken);
        critiqueRelay.stop();

        const codeQuality = parseScore(critiqueResponse);

        // --- Step 3: Visual evaluation (vision model looks at screenshot) ---
        let visualScore = codeQuality;
        let visionFeedback = "";

        if (screenshotB64) {
          broadcast({
            type: "log",
            data: { runId, iteration, message: `Visual review #${num} (llama3.2-vision)...` },
            timestamp: new Date().toISOString(),
          });

          try {
            const visionPrompt = `You are evaluating a web application screenshot.

The app was supposed to be: "${seed}"

Look at this screenshot and answer:
1. Does the app appear to be working and rendered correctly? (or is it blank/broken?)
2. Does the visual design look professional or amateur?
3. Does it match what was requested?

Respond with:
VISUAL_SCORE: <number 1-10>
WORKING: <yes/no/partially>
FEEDBACK: <one paragraph>`;

            visionFeedback = await ollama.vision(
              "llama3.2-vision:latest",
              visionPrompt,
              screenshotB64
            );

            visualScore = parseVisualScore(visionFeedback);
          } catch (err) {
            broadcast({
              type: "log",
              data: { runId, iteration, message: `Vision eval failed for #${num}: ${err}` },
              timestamp: new Date().toISOString(),
            });
          }
        }

        // --- Composite: 50% code quality, 50% visual ---
        const composite = Math.round((codeQuality * 0.5 + visualScore * 0.5) * 10) / 10;

        const updatedVariant: Variant = {
          ...variant,
          critique: critiqueResponse,
          visionFeedback,
          screenshotBase64: screenshotB64,
          scores: { quality: codeQuality, visual: visualScore, composite },
        };

        db.updateVariant(updatedVariant);
        broadcast({ type: "variant", data: updatedVariant, timestamp: new Date().toISOString() });

        broadcast({
          type: "log",
          data: { runId, iteration, message: `#${num}: code=${codeQuality}/10 visual=${visualScore}/10 composite=${composite}/10` },
          timestamp: new Date().toISOString(),
        });
      }

      await closeBrowser();
    }

    // === DONE ===
    db.updateRunState(runId, "complete");
    broadcast({
      type: "complete",
      data: { runId, variants: db.getVariants(runId) },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.updateRunState(runId, "error", undefined, msg);
    broadcast({
      type: "error",
      data: { runId, error: msg },
      timestamp: new Date().toISOString(),
    });
  }
}

export function getRunStatus(runId: string, db: Database): RunStatus | null {
  const runState = db.getRunState(runId);
  if (!runState) return null;
  const runConfig = db.getRun(runId);
  if (!runConfig) return null;
  const variants = db.getVariants(runId);

  return {
    runId,
    state: runState.state as RunStatus["state"],
    iteration: runState.iteration,
    numIterations: runConfig.numIterations,
    numVariants: runConfig.numVariants,
    variants,
    error: runState.error,
  };
}

function extractHtml(response: string): string {
  // Try to extract from markdown fences
  const fenceMatch = response.match(/```(?:html)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    if (inner.includes("<!DOCTYPE") || inner.includes("<html")) return inner;
  }

  // Find the HTML document in the response
  const docMatch = response.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (docMatch) return docMatch[1].trim();

  const htmlMatch = response.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlMatch) return htmlMatch[1].trim();

  // Last resort: wrap in basic HTML
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>App</title></head>
<body>${response}</body></html>`;
}

function parseScore(response: string): number {
  const match = response.match(/SCORE:\s*(\d+(?:\.\d+)?)/);
  if (match) return Math.min(10, Math.max(1, parseFloat(match[1])));
  const fallback = response.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (fallback) return Math.min(10, Math.max(1, parseFloat(fallback[1])));
  return 4;
}

function parseVisualScore(response: string): number {
  const match = response.match(/VISUAL_SCORE:\s*(\d+(?:\.\d+)?)/);
  if (match) return Math.min(10, Math.max(1, parseFloat(match[1])));
  const fallback = response.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (fallback) return Math.min(10, Math.max(1, parseFloat(fallback[1])));
  return 4;
}
