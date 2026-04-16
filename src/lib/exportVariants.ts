import { strToU8, zipSync } from "fflate";
import type { Variant } from "./tauri-bridge";

function runFolderName(runId: string | null | undefined): string {
  const id = (runId ?? "export").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 12) || "export";
  return `recursive-serendipity-${id}`;
}

function variantFileBase(v: Variant): string {
  const score =
    v.scores.composite > 0 ? `-score${String(v.scores.composite).replace(".", "p")}` : "";
  return `iter${v.iteration}-variant${v.variantIndex + 1}${score}`;
}

function sanitizeFilename(base: string): string {
  return `${base.replace(/[^a-zA-Z0-9-_.,]/g, "_")}.html`;
}

export function downloadVariantHtml(v: Variant, runId?: string | null): void {
  const folder = runFolderName(runId);
  const name = sanitizeFilename(`${folder}-${variantFileBase(v)}`);
  const blob = new Blob([v.code], { type: "text/html;charset=utf-8" });
  triggerDownload(name, blob);
}

export function downloadAllVariantsZip(variants: Variant[], runId?: string | null): void {
  if (variants.length === 0) return;
  const root = runFolderName(runId);
  const files: Record<string, Uint8Array> = {};
  for (const v of variants) {
    const path = `${root}/${sanitizeFilename(variantFileBase(v))}`;
    files[path] = strToU8(v.code);
  }
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  triggerDownload(`${root}.zip`, blob);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
