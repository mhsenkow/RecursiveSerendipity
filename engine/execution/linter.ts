import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ExecutionManager, type ExecResult } from "./manager";
import type { LintResult, LintMessage } from "../types";

const exec = new ExecutionManager();

export async function lintCode(
  code: string,
  sandboxDir: string
): Promise<LintResult> {
  mkdirSync(sandboxDir, { recursive: true });

  writeFileSync(join(sandboxDir, "Component.tsx"), code, "utf-8");

  writeFileSync(
    join(sandboxDir, "package.json"),
    JSON.stringify({
      name: "lint-sandbox",
      private: true,
      type: "module",
      devDependencies: {},
    }),
    "utf-8"
  );

  writeFileSync(
    join(sandboxDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
      },
      include: ["*.tsx", "*.ts"],
    }),
    "utf-8"
  );

  const errors: LintMessage[] = [];
  const warnings: LintMessage[] = [];

  // Run TypeScript type check via tsc (use npx to find local/global tsc)
  const tscResult = await exec.exec(
    ["npx", "tsc", "--noEmit", "--pretty", "false"],
    sandboxDir,
    15_000
  );

  if (tscResult.exitCode !== 0) {
    const tscErrors = parseTscOutput(tscResult.stdout + tscResult.stderr);
    errors.push(...tscErrors);
  }

  // Simple static analysis for common React issues
  const staticErrors = staticAnalysis(code);
  errors.push(...staticErrors.filter((e) => e.severity === "error"));
  warnings.push(...staticErrors.filter((e) => e.severity === "warning"));

  return {
    errors,
    warnings,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

function parseTscOutput(output: string): LintMessage[] {
  const messages: LintMessage[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Format: file.tsx(line,col): error TS1234: message
    const match = line.match(
      /^[^(]+\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)/
    );
    if (match) {
      messages.push({
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        severity: match[3] as "error" | "warning",
        ruleId: match[4],
        message: match[5].trim(),
      });
    }
  }

  return messages;
}

function staticAnalysis(code: string): LintMessage[] {
  const messages: LintMessage[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (line.includes("console.log") || line.includes("console.error")) {
      messages.push({
        line: lineNum,
        column: line.indexOf("console") + 1,
        message: "Unexpected console statement",
        ruleId: "no-console",
        severity: "warning",
      });
    }

    if (line.includes("// @ts-ignore") || line.includes("// @ts-nocheck")) {
      messages.push({
        line: lineNum,
        column: 1,
        message: "TypeScript suppression comment found",
        ruleId: "no-ts-suppress",
        severity: "warning",
      });
    }

    if (line.match(/\bany\b/) && line.match(/:\s*any\b/)) {
      messages.push({
        line: lineNum,
        column: line.indexOf("any") + 1,
        message: "Explicit 'any' type usage",
        ruleId: "no-explicit-any",
        severity: "warning",
      });
    }
  }

  return messages;
}
