import { useState, useEffect, useCallback, useRef } from "react";
import {
  engineHealth,
  getEnginePort,
  getRunStatus,
  createEventSource,
  type HealthResponse,
  type EngineEvent,
  type Variant,
} from "../lib/tauri-bridge";

export interface StreamState {
  label: string;
  text: string;
  totalChars: number;
}

interface EngineState {
  connected: boolean;
  health: HealthResponse | null;
  variants: Variant[];
  activeRunId: string | null;
  activeRunState: string | null;
  activeIteration: number;
  logs: Array<{ message: string; timestamp: string }>;
  stream: StreamState | null;
}

export function useEngine() {
  const [state, setState] = useState<EngineState>({
    connected: false,
    health: null,
    variants: [],
    activeRunId: null,
    activeRunState: null,
    activeIteration: 0,
    logs: [],
    stream: null,
  });

  const activeRunIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamTextRef = useRef("");

  useEffect(() => {
    async function poll() {
      try {
        const h = await engineHealth();
        setState((s) => ({ ...s, health: h, connected: true }));
      } catch {
        setState((s) => ({ ...s, connected: false, health: null }));
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (!state.activeRunId) return;

    const runId = state.activeRunId;
    activeRunIdRef.current = runId;

    async function poll() {
      if (activeRunIdRef.current !== runId) return;
      try {
        const status = await getRunStatus(runId);
        setState((s) => {
          if (s.activeRunId !== runId) return s;
          return { ...s, activeRunState: status.state, activeIteration: status.iteration, variants: status.variants };
        });
        if (status.state === "complete" || status.state === "error") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      } catch {}
    }

    poll();
    pollTimerRef.current = setInterval(poll, 2000);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [state.activeRunId]);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    async function connect() {
      try {
        const port = await getEnginePort();
        if (cancelled) return;
        es = createEventSource(port);

        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as EngineEvent;

            if (parsed.type === "stream") {
              const data = parsed.data as { label: string; token: string; totalChars: number };
              streamTextRef.current += data.token;
              // Keep only the last 2000 chars for display
              if (streamTextRef.current.length > 2000) {
                streamTextRef.current = streamTextRef.current.slice(-2000);
              }
              setState((s) => ({
                ...s,
                stream: { label: data.label, text: streamTextRef.current, totalChars: data.totalChars },
              }));
            }

            if (parsed.type === "log") {
              const data = parsed.data as { message: string };
              streamTextRef.current = "";
              setState((s) => ({
                ...s,
                logs: [...s.logs.slice(-200), { message: data.message, timestamp: parsed.timestamp }],
                stream: null,
              }));
            }

            if (parsed.type === "status") {
              const data = parsed.data as { runId: string; state: string; iteration?: number };
              streamTextRef.current = "";
              setState((s) => ({
                ...s,
                activeRunId: s.activeRunId || data.runId,
                activeRunState: data.state,
                activeIteration: data.iteration ?? s.activeIteration,
                stream: null,
              }));
            }

            if (parsed.type === "complete" || parsed.type === "error") {
              streamTextRef.current = "";
              setState((s) => ({ ...s, stream: null }));
            }
          } catch {}
        };

        es.onerror = () => {
          if (es) es.close();
          es = null;
          if (!cancelled) setTimeout(connect, 3000);
        };
      } catch {
        if (!cancelled) setTimeout(connect, 3000);
      }
    }

    connect();
    return () => { cancelled = true; if (es) es.close(); };
  }, []);

  const setActiveRunId = useCallback((runId: string) => {
    streamTextRef.current = "";
    setState((s) => ({
      ...s,
      activeRunId: runId,
      activeRunState: "generating",
      activeIteration: 0,
      variants: [],
      logs: [],
      stream: null,
    }));
  }, []);

  return { ...state, setActiveRunId };
}
