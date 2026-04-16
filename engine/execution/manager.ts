import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SANDBOX_ROOT = join(tmpdir(), "rs-sandboxes");

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export class ExecutionManager {
  createSandbox(runId: string, iteration: number): string {
    const dir = join(SANDBOX_ROOT, runId, `iter-${iteration}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  writeFile(sandboxDir: string, filename: string, content: string) {
    writeFileSync(join(sandboxDir, filename), content, "utf-8");
  }

  async exec(
    command: string[],
    cwd: string,
    timeoutMs = 30_000
  ): Promise<ExecResult> {
    const proc = Bun.spawn(command, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    clearTimeout(timer);

    return { stdout, stderr, exitCode, timedOut };
  }

  cleanup(sandboxDir: string) {
    try {
      if (existsSync(sandboxDir)) {
        rmSync(sandboxDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup
    }
  }
}
