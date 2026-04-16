import { mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SANDBOX_ROOT = join(tmpdir(), "rs-sandboxes");

export function createSandbox(runId: string, iteration: number): string {
  const dir = join(SANDBOX_ROOT, runId, `iter-${iteration}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupSandbox(sandboxDir: string) {
  try {
    if (existsSync(sandboxDir)) {
      rmSync(sandboxDir, { recursive: true, force: true });
    }
  } catch {
    // best effort
  }
}

export function getSandboxPath(runId: string, iteration: number): string {
  return join(SANDBOX_ROOT, runId, `iter-${iteration}`);
}
