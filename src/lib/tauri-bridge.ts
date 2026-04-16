import { invoke } from "@tauri-apps/api/core";

export interface RunConfig {
  seed: string;
  numVariants?: number;
  numIterations?: number;
  generatorModel?: string;
  criticModel?: string;
}

export interface Scores {
  quality: number;
  visual: number;
  composite: number;
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
  thermalPressure: string;
  shouldThrottle: boolean;
}

export interface OllamaHealth {
  running: boolean;
  currentModel: string | null;
  availableModels: string[];
}

export interface HealthResponse {
  ok: boolean;
  ollama: OllamaHealth;
  thermal: ThermalStatus;
}

export interface EngineEvent {
  type: "connected" | "status" | "variant" | "log" | "stream" | "thermal" | "error" | "complete";
  data: unknown;
  timestamp: string;
}

export async function engineHealth(): Promise<HealthResponse> {
  return invoke("engine_health");
}

export async function startRun(config: RunConfig): Promise<{ runId: string }> {
  return invoke("start_run", {
    seed: config.seed,
    threshold: null,
    maxIterations: null,
    generatorModel: config.generatorModel ?? null,
    criticModel: config.criticModel ?? null,
    numVariants: config.numVariants ?? null,
    numIterations: config.numIterations ?? null,
  });
}

export async function getRunStatus(runId: string): Promise<RunStatus> {
  return invoke("get_run_status", { runId });
}

export async function stopRun(runId: string): Promise<{ stopped: boolean }> {
  return invoke("stop_run", { runId });
}

export async function getModels(): Promise<OllamaHealth> {
  return invoke("get_models");
}

export async function getEnginePort(): Promise<number> {
  return invoke("get_engine_port");
}

export function createEventSource(port: number): EventSource {
  return new EventSource(`http://localhost:${port}/events`);
}
