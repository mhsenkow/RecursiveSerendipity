import type { ThermalStatus } from "../types";

export class ThermalMonitor {
  private status: ThermalStatus = {
    cpuTemperature: null,
    thermalPressure: "unknown",
    shouldThrottle: false,
  };
  private intervalId: ReturnType<typeof setInterval> | null = null;

  getStatus(): ThermalStatus {
    return { ...this.status };
  }

  startMonitoring(intervalMs = 10_000) {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll() {
    try {
      const proc = Bun.spawn(["pmset", "-g", "therm"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      this.status.thermalPressure = this.parseThermalPressure(output);
      this.status.shouldThrottle =
        this.status.thermalPressure === "heavy" ||
        this.status.thermalPressure === "critical";
    } catch {
      this.status.thermalPressure = "unknown";
      this.status.shouldThrottle = false;
    }

    try {
      const proc = Bun.spawn(
        ["sysctl", "-n", "machdep.xcpm.cpu_thermal_level"],
        { stdout: "pipe", stderr: "pipe" }
      );

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      const level = parseInt(output.trim(), 10);
      if (!isNaN(level)) {
        // Thermal level is 0-based; rough mapping to temperature estimate
        this.status.cpuTemperature = level > 0 ? 70 + level * 10 : null;
      }
    } catch {
      // sysctl key may not exist on all macOS versions
    }
  }

  private parseThermalPressure(output: string): ThermalStatus["thermalPressure"] {
    const lower = output.toLowerCase();
    if (lower.includes("cpu_speed_limit") || lower.includes("cpu_available_cpus")) {
      // If thermal management is actively throttling
      if (lower.includes("speed_limit = 100")) return "nominal";
      if (lower.includes("speed_limit")) return "moderate";
    }
    if (lower.includes("nominal")) return "nominal";
    if (lower.includes("moderate") || lower.includes("fair")) return "moderate";
    if (lower.includes("serious") || lower.includes("heavy")) return "heavy";
    if (lower.includes("critical")) return "critical";
    return "nominal";
  }
}
