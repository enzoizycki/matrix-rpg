import { createHash } from "node:crypto";
import { getDocumentProxy } from "unpdf";
import type { RulePage } from "@/lib/rules";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Livros colocados na pasta rulebooks/ não passam pelo navegador, então aceitam mais.
export const MAX_FIXED_BYTES = 300 * 1024 * 1024;
export const MAX_PDF_FILES = 8;
export const MAX_PDF_PAGES = 2000;

export class PDFInputError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
    this.name = "PDFInputError";
  }
}

// PostgreSQL text/jsonb reject NUL characters that can occur in PDF text layers.
export function cleanPDFText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildRulesText(pages: RulePage[]): string {
  return pages.map(page => `### ${page.file} [p.${page.page}]\n${page.text}`).join("\n\n");
}

export async function readRulebook(file: File, signal: AbortSignal, maxBytes = MAX_UPLOAD_BYTES) {
  const name = cleanPDFText(file.name || "livro.pdf").slice(0, 255);
  if (file.size > maxBytes) throw new PDFInputError(`“${name}” ultrapassa o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`, 413);
  signal.throwIfAborted();
  return readRulebookBytes(new Uint8Array(await file.arrayBuffer()), name, signal, maxBytes);
}

export async function readRulebookBytes(bytes: Uint8Array, rawName: string, signal: AbortSignal, maxBytes = MAX_UPLOAD_BYTES) {
  const name = cleanPDFText(rawName || "livro.pdf").slice(0, 255);
  if (!bytes.byteLength) throw new PDFInputError(`O arquivo “${name}” está vazio. Selecione o PDF novamente.`, 400);
  if (bytes.byteLength > maxBytes) throw new PDFInputError(`“${name}” ultrapassa o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`, 413);
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
    throw new PDFInputError(`“${name}” não contém um PDF válido. Trocar a extensão de um arquivo não o converte em PDF.`);
  }
  // Calculado antes da leitura: o pdf.js pode assumir o controle do buffer.
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(bytes);
    const document = pdf;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new PDFInputError(`“${name}” tem mais de ${MAX_PDF_PAGES} páginas. Divida o livro em volumes menores.`);
    }
    const onAbort = () => { void document.loadingTask.destroy().catch(() => {}); };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const pages: RulePage[] = [];
      let chars = 0;
      // Process sequentially to avoid keeping every page's PDF.js objects in memory.
      for (let number = 1; number <= document.numPages; number++) {
        signal.throwIfAborted();
        const page = await document.getPage(number);
        try {
          const content = await page.getTextContent();
          const text = cleanPDFText(content.items.map(item =>
            "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "",
          ).join(""));
          if (text) {
            pages.push({ file: name, page: number, text });
            chars += text.length;
          }
        } finally { page.cleanup(); }
      }
      if (!chars) {
        throw new PDFInputError(`“${name}” não tem texto extraível. Ele pode ser escaneado ou conter apenas imagens. Use uma versão com texto selecionável ou aplique OCR antes de enviar.`);
      }
      return { pages, file: { name, chars }, pageCount: document.numPages, sha256 };
    } finally { signal.removeEventListener("abort", onAbort); }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof PDFInputError) throw error;
    const type = error instanceof Error ? error.name : "";
    if (type === "PasswordException") {
      throw new PDFInputError(`“${name}” está protegido por senha. Envie uma cópia desbloqueada.`);
    }
    throw new PDFInputError(`Não foi possível ler “${name}”. O PDF pode estar incompleto ou corrompido; tente exportá-lo novamente.`);
  } finally { await pdf?.loadingTask.destroy().catch(() => {}); }
}
