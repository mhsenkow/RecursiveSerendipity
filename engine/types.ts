export interface RunConfig {
  id: string;
  seed: string;
  numVariants: number;
  numIterations: number;
  generatorModel: string;
  criticModel: string;
  createdAt: string;
}

export interface Variant {
  id: string;
  runId: string;
  iteration: number;
  variantIndex: number;
  code: string;
  critique: string;
  visionFeedback: string;
  screenshotBase64: string;
  scores: Scores;
  parentVariantId: string | null;
  createdAt: string;
}

export interface Scores {
  quality: number;
  visual: number;
  composite: number;
}

export interface RunStatus {
  runId: string;
  state: "idle" | "generating" | "evaluating" | "refining" | "complete" | "error";
  iteration: number;
  numIterations: number;
  numVariants: number;
  variants: Variant[];
  error?: string;
}

export interface ThermalStatus {
  cpuTemperature: number | null;
  thermalPressure: "nominal" | "moderate" | "heavy" | "critical" | "unknown";
  shouldThrottle: boolean;
}

export interface OllamaHealth {
  running: boolean;
  currentModel: string | null;
  availableModels: string[];
}

export interface EngineEvent {
  type: "status" | "variant" | "log" | "stream" | "thermal" | "error" | "complete";
  data: unknown;
  timestamp: string;
}
