import { runEvolutionLoop, getRunStatus } from "./graph/workflow";
import { OllamaProvider } from "./providers/ollama";
import { ThermalMonitor } from "./providers/thermal";
import { Database } from "./memory/sqlite";
import type { RunConfig, EngineEvent } from "./types";

const PORT = parseInt(process.env.RS_ENGINE_PORT || "9700", 10);
const db = new Database();
const ollama = new OllamaProvider();
const thermal = new ThermalMonitor();

const sseClients = new Set<ReadableStreamDefaultController>();

function broadcastEvent(event: EngineEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const controller of sseClients) {
    try {
      controller.enqueue(new TextEncoder().encode(data));
    } catch {
      sseClients.delete(controller);
    }
  }
}

const activeRuns = new Map<string, AbortController>();

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
      });
    }

    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };

    // SSE
    if (url.pathname === "/events") {
      const stream = new ReadableStream({
        start(controller) {
          sseClients.add(controller);
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "connected", data: null, timestamp: new Date().toISOString() })}\n\n`));
          const hb = setInterval(() => {
            try { controller.enqueue(new TextEncoder().encode(": heartbeat\n\n")); }
            catch { clearInterval(hb); sseClients.delete(controller); }
          }, 5000);
          (controller as unknown as Record<string, unknown>)._hb = hb;
        },
        cancel(controller) {
          const hb = (controller as unknown as Record<string, unknown>)._hb;
          if (hb) clearInterval(hb as ReturnType<typeof setInterval>);
          sseClients.delete(controller);
        },
      });
      return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
    }

    if (url.pathname === "/health") {
      const ollamaHealth = await ollama.healthCheck();
      return Response.json({ ok: true, ollama: ollamaHealth, thermal: thermal.getStatus() }, { headers: cors });
    }

    // Start run
    if (url.pathname === "/runs" && req.method === "POST") {
      const body = await req.json() as Record<string, unknown>;
      if (!body.seed) return Response.json({ error: "seed is required" }, { status: 400, headers: cors });

      const config: RunConfig = {
        id: crypto.randomUUID(),
        seed: body.seed as string,
        numVariants: (body.numVariants as number) || 5,
        numIterations: (body.numIterations as number) || 3,
        generatorModel: (body.generatorModel as string) || "llama3.3:latest",
        criticModel: (body.criticModel as string) || "deepseek-r1:70b",
        createdAt: new Date().toISOString(),
      };

      db.saveRun(config);
      const ac = new AbortController();
      activeRuns.set(config.id, ac);

      runEvolutionLoop(config, ollama, db, broadcastEvent, ac.signal);

      return Response.json({ runId: config.id }, { status: 201, headers: cors });
    }

    // Get run
    if (url.pathname.match(/^\/runs\/[^/]+$/) && req.method === "GET") {
      const runId = url.pathname.split("/runs/")[1];
      const status = getRunStatus(runId, db);
      if (!status) return Response.json({ error: "not found" }, { status: 404, headers: cors });
      return Response.json(status, { headers: cors });
    }

    // Stop run
    if (url.pathname.match(/^\/runs\/[^/]+/) && req.method === "DELETE") {
      const runId = url.pathname.split("/runs/")[1].replace(/\/stop$/, "");
      activeRuns.get(runId)?.abort();
      activeRuns.delete(runId);
      return Response.json({ stopped: true }, { headers: cors });
    }

    // List runs
    if (url.pathname === "/runs" && req.method === "GET") {
      return Response.json(db.listRuns(), { headers: cors });
    }

    if (url.pathname === "/models") {
      return Response.json(await ollama.healthCheck(), { headers: cors });
    }

    if (url.pathname === "/thermal") {
      return Response.json(thermal.getStatus(), { headers: cors });
    }

    return Response.json({ error: "not found" }, { status: 404, headers: cors });
  },
});

console.log(`[RS Engine] Running on http://localhost:${server.port}`);
thermal.startMonitoring();

process.on("SIGINT", () => { thermal.stopMonitoring(); db.close(); process.exit(0); });
