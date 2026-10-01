import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rulebooks } from "@/db/schema";
import { buildRulesText, MAX_FIXED_BYTES, PDFInputError, readRulebookBytes } from "@/lib/pdf";
import type { RulePage } from "@/lib/rules";
import type { RulebookStatus } from "@/lib/types";

/** Pasta dos livros fixos. Em Docker é montada em /app/rulebooks. */
export function rulebooksDir(): string {
  return process.env.RULEBOOKS_DIR?.trim() || path.join(process.cwd(), "rulebooks");
}

type FolderFile = { name: string; fullPath: string; size: number; mtimeMs: number };

export async function listFolderPDFs(dir = rulebooksDir()): Promise<FolderFile[]> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files: FolderFile[] = [];
  for (const entry of entries) {
    const visible = !entry.name.startsWith(".") && !entry.name.startsWith("~$");
    if (!visible || !/\.pdf$/i.test(entry.name) || !(entry.isFile() || entry.isSymbolicLink())) continue;
    const fullPath = path.join(dir, entry.name);
    const info = await stat(fullPath).catch(() => null);
    if (info?.isFile()) files.push({ name: entry.name, fullPath, size: info.size, mtimeMs: Math.round(info.mtimeMs) });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
}

/** Identifica o conteúdo exato dos PDFs (nomes + hashes), independente da ordem. */
export function rulebookKey(parts: { name: string; sha256: string }[]): string {
  const lines = [...parts].sort((a, b) => a.name.localeCompare(b.name)).map(part => `${part.name}\0${part.sha256}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

export function displayNameFor(files: { name: string }[]): string {
  return files.map(file => file.name.replace(/\.pdf$/i, "")).join(" + ").slice(0, 200);
}

const summaryColumns = {
  id: rulebooks.id,
  name: rulebooks.name,
  files: rulebooks.files,
  systemName: rulebooks.systemName,
  pageCount: sql<number>`jsonb_array_length(${rulebooks.pages})`,
};

async function loadSummary(id: number) {
  const [row] = await db.select(summaryColumns).from(rulebooks).where(eq(rulebooks.id, id));
  return row;
}

/** Lê todos os PDFs de uma pasta como um único livro. Reaproveita o que já foi indexado. */
export async function indexDirectory(dir: string, signal: AbortSignal): Promise<{ id: number; created: boolean }> {
  const files = await listFolderPDFs(dir);
  if (!files.length) throw new PDFInputError("Nenhum PDF encontrado na pasta rulebooks/.", 404);

  const hashes: { name: string; sha256: string }[] = [];
  for (const file of files) {
    signal.throwIfAborted();
    hashes.push({ name: file.name, sha256: createHash("sha256").update(await readFile(file.fullPath)).digest("hex") });
  }
  const key = rulebookKey(hashes);
  const [existing] = await db.select({ id: rulebooks.id }).from(rulebooks).where(eq(rulebooks.key, key));
  if (existing) return { id: existing.id, created: false };

  const pages: RulePage[] = [];
  const fileMeta: { name: string; chars: number }[] = [];
  for (const file of files) {
    signal.throwIfAborted();
    const bytes = new Uint8Array(await readFile(file.fullPath));
    const result = await readRulebookBytes(bytes, file.name, signal, MAX_FIXED_BYTES);
    pages.push(...result.pages);
    fileMeta.push(result.file);
  }
  const [row] = await db.insert(rulebooks).values({
    key, name: displayNameFor(fileMeta), source: "folder", isDefault: false,
    files: fileMeta, pages, rulesText: buildRulesText(pages),
  }).onConflictDoNothing({ target: rulebooks.key }).returning({ id: rulebooks.id });
  if (row) return { id: row.id, created: true };
  const [again] = await db.select({ id: rulebooks.id }).from(rulebooks).where(eq(rulebooks.key, key));
  return { id: again.id, created: false };
}

type FolderJob = {
  signature: string;
  status: "indexing" | "ready" | "error";
  names: string[];
  id?: number;
  error?: string;
  finishedAt?: number;
};
const globalState = globalThis as typeof globalThis & { __folderRulebookJob?: FolderJob };

function friendlyError(error: unknown): string {
  if (error instanceof PDFInputError) return error.message;
  console.error("Livro fixo: falha ao indexar:", error instanceof Error ? error.message : error);
  return "Não foi possível indexar os PDFs da pasta rulebooks/. Confira se são PDFs válidos e com texto selecionável.";
}

/**
 * Situação do livro da pasta rulebooks/. A leitura só acontece quando os arquivos mudam
 * (comparação por tamanho/data) e em segundo plano; o resultado fica salvo no banco.
 */
export async function getFolderRulebook(): Promise<RulebookStatus> {
  const files = await listFolderPDFs();
  if (!files.length) {
    globalState.__folderRulebookJob = undefined;
    return { state: "none" };
  }
  const signature = files.map(file => `${file.name}:${file.size}:${file.mtimeMs}`).join("|");
  let job = globalState.__folderRulebookJob;
  const retryError = job?.status === "error" && Date.now() - (job.finishedAt ?? 0) > 60_000;
  if (!job || job.signature !== signature || retryError) {
    const fresh: FolderJob = { signature, status: "indexing", names: files.map(file => file.name) };
    globalState.__folderRulebookJob = fresh;
    indexDirectory(rulebooksDir(), AbortSignal.timeout(20 * 60_000))
      .then(result => { fresh.status = "ready"; fresh.id = result.id; fresh.finishedAt = Date.now(); })
      .catch(error => { fresh.status = "error"; fresh.error = friendlyError(error); fresh.finishedAt = Date.now(); });
    job = fresh;
  }
  const name = displayNameFor(job.names.map(n => ({ name: n })));
  if (job.status === "indexing") return { state: "indexing", source: "folder", name };
  if (job.status === "error") return { state: "error", source: "folder", name, error: job.error };
  const summary = await loadSummary(job.id!);
  if (!summary) {
    // A linha foi apagada do banco: indexa de novo na próxima consulta.
    globalState.__folderRulebookJob = undefined;
    return { state: "indexing", source: "folder", name };
  }
  return { state: "ready", source: "folder", ...summary };
}

/** Livro padrão: o da pasta rulebooks/ tem prioridade; senão, o salvo pelo site. */
export async function getDefaultRulebookStatus(): Promise<RulebookStatus> {
  const folder = await getFolderRulebook();
  if (folder.state !== "none") return folder;
  const [saved] = await db.select(summaryColumns).from(rulebooks)
    .where(and(eq(rulebooks.source, "upload"), eq(rulebooks.isDefault, true)))
    .orderBy(desc(rulebooks.id)).limit(1);
  return saved ? { state: "ready", source: "upload", ...saved } : { state: "none" };
}

export async function getReadyDefaultRulebook() {
  const status = await getDefaultRulebookStatus();
  if (status.state === "none") throw new PDFInputError("Nenhum livro fixo foi configurado. Envie um PDF ou coloque o arquivo na pasta rulebooks/.", 404);
  if (status.state === "indexing") throw new PDFInputError("O livro fixo ainda está sendo indexado. Aguarde alguns instantes e tente novamente.", 409);
  if (status.state === "error") throw new PDFInputError(status.error || "Não foi possível ler o livro fixo.", 422);
  const [row] = await db.select().from(rulebooks).where(eq(rulebooks.id, status.id!));
  if (!row) throw new PDFInputError("O livro fixo não foi encontrado. Atualize a página e tente novamente.", 409);
  return row;
}

export async function saveUploadedRulebook(input: {
  key: string; name: string; files: { name: string; chars: number }[]; pages: RulePage[]; rulesText: string;
}): Promise<number> {
  return db.transaction(async tx => {
    await tx.update(rulebooks).set({ isDefault: false })
      .where(and(eq(rulebooks.source, "upload"), eq(rulebooks.isDefault, true)));
    const [row] = await tx.insert(rulebooks).values({ ...input, source: "upload", isDefault: true })
      .onConflictDoUpdate({ target: rulebooks.key, set: { isDefault: true, source: "upload", name: input.name } })
      .returning({ id: rulebooks.id });
    return row.id;
  });
}

/** Remove o livro fixo salvo pelo site. Livros da pasta rulebooks/ são removidos apagando o arquivo. */
export async function removeUploadedDefault(): Promise<void> {
  await db.delete(rulebooks).where(and(eq(rulebooks.source, "upload"), eq(rulebooks.isDefault, true)));
}
