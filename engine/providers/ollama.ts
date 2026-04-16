import type { OllamaHealth } from "../types";

const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://localhost:11434";

interface GenerateOptions {
  temperature?: number;
  num_predict?: number;
  top_p?: number;
  stop?: string[];
}

type TokenCallback = (token: string) => void;

interface QueuedRequest {
  execute: () => Promise<void>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class OllamaProvider {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private currentModel: string | null = null;

  async healthCheck(): Promise<OllamaHealth> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`);
      if (!res.ok) return { running: false, currentModel: null, availableModels: [] };

      const data = (await res.json()) as { models: Array<{ name: string }> };
      const models = data.models.map((m) => m.name);

      let currentModel: string | null = null;
      try {
        const psRes = await fetch(`${OLLAMA_BASE}/api/ps`);
        if (psRes.ok) {
          const psData = (await psRes.json()) as { models: Array<{ name: string }> };
          if (psData.models?.length > 0) currentModel = psData.models[0].name;
        }
      } catch {}

      return { running: true, currentModel, availableModels: models };
    } catch {
      return { running: false, currentModel: null, availableModels: [] };
    }
  }

  async generate(
    model: string,
    prompt: string,
    system?: string,
    options?: GenerateOptions,
    onToken?: TokenCallback
  ): Promise<string> {
    return this.enqueue(async () => {
      this.currentModel = model;

      const body: Record<string, unknown> = {
        model,
        prompt,
        stream: true,
        options: { temperature: 0.7, num_predict: 4096, ...options },
      };
      if (system) body.system = system;

      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama generate failed (${res.status}): ${text}`);
      }

      let fullResponse = "";
      let evalCount = 0;
      let evalDuration = 0;

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as {
              response: string;
              done: boolean;
              eval_count?: number;
              eval_duration?: number;
            };

            fullResponse += chunk.response;

            if (onToken && chunk.response) {
              onToken(chunk.response);
            }

            if (chunk.done) {
              evalCount = chunk.eval_count ?? 0;
              evalDuration = chunk.eval_duration ?? 0;
            }
          } catch {}
        }
      }

      if (evalDuration > 0 && evalCount > 0) {
        const tokPerSec = evalCount / (evalDuration / 1e9);
        console.log(`[Ollama] ${model}: ${evalCount} tokens, ${tokPerSec.toFixed(1)} tok/s`);
      }

      return fullResponse;
    }) as Promise<string>;
  }

  async vision(
    model: string,
    prompt: string,
    imageBase64: string
  ): Promise<string> {
    return this.enqueue(async () => {
      this.currentModel = model;
      console.log(`[Ollama] Vision with ${model}`);

      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          images: [imageBase64],
          stream: false,
          options: { temperature: 0.3, num_predict: 1024 },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama vision failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as { response: string };
      return data.response;
    }) as Promise<string>;
  }

  private enqueue(execute: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: async () => {
          try { resolve(await execute()); }
          catch (err) { reject(err); }
        },
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await item.execute();
    }
    this.processing = false;
  }
}
