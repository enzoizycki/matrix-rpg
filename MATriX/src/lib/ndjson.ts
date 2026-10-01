import { AIError } from "./ai-errors";

function parseLine(line: string): unknown {
  try { return JSON.parse(line); }
  catch { throw new AIError("O Ollama enviou uma resposta ilegível. Tente novamente.", "AI_FORMAT", 502); }
}

/** Lê JSON por linha (NDJSON) com UTF-8 dividido entre pedaços, CRLF e última linha sem quebra. */
export async function* readNDJSON(body: ReadableStream<Uint8Array>, onChunk?: () => void): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      onChunk?.();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) yield parseLine(line);
      }
      if (done) break;
    }
    const rest = buffer.trim();
    if (rest) yield parseLine(rest);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
