import { Database as BunSQLite } from "bun:sqlite";
import { resolve } from "path";
import { mkdirSync, existsSync, unlinkSync } from "fs";
import type { RunConfig, Variant, RunStatus } from "../types";

const DB_PATH = resolve(import.meta.dir, "../../data/rs.db");
const SCHEMA_VERSION = 3;

export class Database {
  private db: BunSQLite;

  constructor() {
    mkdirSync(resolve(import.meta.dir, "../../data"), { recursive: true });

    // Check schema version; drop if outdated
    if (existsSync(DB_PATH)) {
      try {
        const tmp = new BunSQLite(DB_PATH);
        const row = tmp.prepare("PRAGMA user_version").get() as Record<string, number>;
        const ver = row?.user_version ?? 0;
        tmp.close();
        if (ver < SCHEMA_VERSION) {
          unlinkSync(DB_PATH);
          try { unlinkSync(DB_PATH + "-wal"); } catch {}
          try { unlinkSync(DB_PATH + "-shm"); } catch {}
        }
      } catch {
        try { unlinkSync(DB_PATH); } catch {}
      }
    }

    this.db = new BunSQLite(DB_PATH);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        seed TEXT NOT NULL,
        num_variants INTEGER NOT NULL DEFAULT 5,
        num_iterations INTEGER NOT NULL DEFAULT 3,
        generator_model TEXT NOT NULL,
        critic_model TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'idle',
        current_iteration INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS variants (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        iteration INTEGER NOT NULL,
        variant_index INTEGER NOT NULL DEFAULT 0,
        code TEXT NOT NULL,
        critique TEXT NOT NULL DEFAULT '',
        vision_feedback TEXT NOT NULL DEFAULT '',
        screenshot_b64 TEXT NOT NULL DEFAULT '',
        score_quality REAL NOT NULL DEFAULT 0,
        score_visual REAL NOT NULL DEFAULT 0,
        score_composite REAL NOT NULL DEFAULT 0,
        parent_variant_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_variants_run ON variants(run_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_variants_iter ON variants(run_id, iteration)");
  }

  saveRun(config: RunConfig) {
    this.db
      .prepare(
        `INSERT INTO runs (id, seed, num_variants, num_iterations, generator_model, critic_model, state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)`
      )
      .run(config.id, config.seed, config.numVariants, config.numIterations, config.generatorModel, config.criticModel, config.createdAt);
  }

  updateRunState(runId: string, state: RunStatus["state"], iteration?: number, error?: string) {
    if (iteration !== undefined && error !== undefined) {
      this.db.prepare("UPDATE runs SET state=?, current_iteration=?, error=?, updated_at=datetime('now') WHERE id=?").run(state, iteration, error, runId);
    } else if (iteration !== undefined) {
      this.db.prepare("UPDATE runs SET state=?, current_iteration=?, updated_at=datetime('now') WHERE id=?").run(state, iteration, runId);
    } else if (error !== undefined) {
      this.db.prepare("UPDATE runs SET state=?, error=?, updated_at=datetime('now') WHERE id=?").run(state, error, runId);
    } else {
      this.db.prepare("UPDATE runs SET state=?, updated_at=datetime('now') WHERE id=?").run(state, runId);
    }
  }

  getRun(runId: string): RunConfig | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE id=?").get(runId) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      id: row.id as string,
      seed: row.seed as string,
      numVariants: row.num_variants as number,
      numIterations: row.num_iterations as number,
      generatorModel: row.generator_model as string,
      criticModel: row.critic_model as string,
      createdAt: row.created_at as string,
    };
  }

  getRunState(runId: string): { state: string; iteration: number; error?: string } | null {
    const row = this.db.prepare("SELECT state, current_iteration, error FROM runs WHERE id=?").get(runId) as Record<string, unknown> | null;
    if (!row) return null;
    return { state: row.state as string, iteration: row.current_iteration as number, error: (row.error as string) || undefined };
  }

  listRuns() {
    const rows = this.db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string, seed: r.seed as string, numVariants: r.num_variants as number,
      numIterations: r.num_iterations as number, generatorModel: r.generator_model as string,
      criticModel: r.critic_model as string, createdAt: r.created_at as string,
      state: r.state as string, currentIteration: r.current_iteration as number,
    }));
  }

  saveVariant(variant: Variant) {
    this.db.prepare(
      `INSERT INTO variants (id, run_id, iteration, variant_index, code, critique, vision_feedback, screenshot_b64, score_quality, score_visual, score_composite, parent_variant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(variant.id, variant.runId, variant.iteration, variant.variantIndex, variant.code, variant.critique, variant.visionFeedback, variant.screenshotBase64, variant.scores.quality, variant.scores.visual, variant.scores.composite, variant.parentVariantId, variant.createdAt);
  }

  updateVariant(variant: Variant) {
    this.db.prepare(
      "UPDATE variants SET critique=?, vision_feedback=?, screenshot_b64=?, score_quality=?, score_visual=?, score_composite=? WHERE id=?"
    ).run(variant.critique, variant.visionFeedback, variant.screenshotBase64, variant.scores.quality, variant.scores.visual, variant.scores.composite, variant.id);
  }

  getVariants(runId: string): Variant[] {
    const rows = this.db.prepare("SELECT * FROM variants WHERE run_id=? ORDER BY iteration ASC, variant_index ASC").all(runId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string, runId: r.run_id as string, iteration: r.iteration as number,
      variantIndex: r.variant_index as number, code: r.code as string, critique: r.critique as string,
      visionFeedback: (r.vision_feedback as string) || "", screenshotBase64: (r.screenshot_b64 as string) || "",
      scores: { quality: r.score_quality as number, visual: r.score_visual as number, composite: r.score_composite as number },
      parentVariantId: (r.parent_variant_id as string) || null, createdAt: r.created_at as string,
    }));
  }

  close() { this.db.close(); }
}
