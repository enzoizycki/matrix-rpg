import { test, expect } from "@playwright/test";
import { readSSE } from "@/lib/sse";
import { cleanPDFText, readRulebook } from "@/lib/pdf";
import { generateGemini, streamGemini } from "@/lib/gemini";
const { makePdf } = require("./fixtures/pdf.cjs") as { makePdf: (text?: string) => Buffer };

test("SSE preserves UTF-8 across small chunks and consumes the final unterminated event", async () => {
  const bytes = new TextEncoder().encode('data: {"text":"Olá, criação!"}\r\n\r\n: heartbeat\r\n\r\ndata: {"type":"done"}');
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } });
  const events: unknown[] = [];
  for await (const payload of readSSE(stream)) events.push(JSON.parse(payload));
  expect(events).toEqual([{ text: "Olá, criação!" }, { type: "done" }]);
});

test("PDF text is read from the document, not the name, and NULs are removed", async () => {
  const file = new File([new Uint8Array(makePdf())], "not-the-system-name.pdf", { type: "application/pdf" });
  const result = await readRulebook(file, AbortSignal.timeout(10_000));
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].text).toContain("Construct RPG");
  expect(result.file.chars).toBeGreaterThan(40);
  expect(cleanPDFText("For\u0000ça\n\n\nTeste")).toBe("Força\n\nTeste");
});

test("an empty text layer fails even with a long valid-looking filename", async () => {
  const file = new File([new Uint8Array(makePdf(""))], "a-very-long-name-that-is-not-readable-content.pdf", { type: "application/pdf" });
  await expect(readRulebook(file, AbortSignal.timeout(10_000))).rejects.toThrow("não tem texto extraível");
});

test("Gemini identification timeout covers a response body that never finishes", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unit-test-placeholder-only";
  global.fetch = async (_input, init) => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const signal = init?.signal;
      const abort = () => controller.error(signal?.reason);
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    await expect(generateGemini({ prompt: "test", timeoutMs: 50, retries: 1 })).rejects.toMatchObject({ code: "AI_TIMEOUT", status: 504 });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test("empty or blocked Gemini streams are explicit errors, never silent successes", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unit-test-placeholder-only";
  try {
    for (const [payload, code] of [[{ candidates: [] }, "AI_EMPTY"], [{ promptFeedback: { blockReason: "SAFETY" } }, "AI_BLOCKED"]] as const) {
      global.fetch = async () => new Response(`data: ${JSON.stringify(payload)}\n\n`, { headers: { "content-type": "text/event-stream" } });
      const run = async () => { for await (const _ of streamGemini({ system: "test", contents: [{ role: "user", parts: [{ text: "test" }] }], tools: [] })) { /* consume */ } };
      await expect(run()).rejects.toMatchObject({ code });
    }
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
