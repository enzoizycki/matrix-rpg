/** Decode SSE across arbitrary network chunks, CRLFs and a final unterminated event. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  function lineEvent(line: string): string | null {
    if (line === "") {
      if (!data.length) return null;
      const event = data.join("\n");
      data = [];
      return event;
    }
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    return null;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let position: number;
      while ((position = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, position).replace(/\r$/, "");
        buffer = buffer.slice(position + 1);
        const event = lineEvent(line);
        if (event !== null) yield event;
      }
      if (done) break;
    }
    if (buffer) {
      const event = lineEvent(buffer.replace(/\r$/, ""));
      if (event !== null) yield event;
    }
    if (data.length) yield data.join("\n");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
