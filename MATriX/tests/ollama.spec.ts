import { test, expect } from "@playwright/test";
import { AIError } from "@/lib/ai-errors";
import { readNDJSON } from "@/lib/ndjson";
import {
  generateOllamaJSON, isCloudUrl, isPrivateHost, listOllamaModels, normalizeBaseUrl,
  streamOllama, toOllamaMessages, validateOllama, type OllamaTarget,
} from "@/lib/ollama";
import { aiStream, promptBudget, trimMessages } from "@/lib/ai";
import type { ActiveAI } from "@/lib/ai-config";
import type { AIEvent, AIMessage, AISession, ToolDeclaration } from "@/lib/ai-types";

const encoder = new TextEncoder();
function bodyFrom(text: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
}
const lines = (...objects: unknown[]) => objects.map(item => JSON.stringify(item)).join("\n") + "\n";
const json = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ndjson = (text: string) => new Response(bodyFrom(text), { status: 200, headers: { "content-type": "application/x-ndjson" } });

type FetchCall = { url: string; init: RequestInit; body?: Record<string, unknown> };
async function withFetch<T>(handler: (call: FetchCall) => Response | Promise<Response>, run: (calls: FetchCall[]) => Promise<T>): Promise<T> {
  const original = global.fetch;
  const calls: FetchCall[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = { url: String(input), init: init ?? {}, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  try { return await run(calls); } finally { global.fetch = original; }
}
async function collect(generator: AsyncGenerator<AIEvent>): Promise<AIEvent[]> {
  const out: AIEvent[] = [];
  for await (const event of generator) out.push(event);
  return out;
}
async function failure(promise: Promise<unknown>): Promise<AIError> {
  try { await promise; } catch (error) { expect(error).toBeInstanceOf(AIError); return error as AIError; }
  throw new Error("Era esperado um erro");
}
const headerOf = (call: FetchCall, name: string) => (call.init.headers as Record<string, string> | undefined)?.[name];

const local: OllamaTarget = { baseUrl: "http://localhost:11434", model: "llama3.1", numCtx: 16384 };
const cloud: OllamaTarget = { baseUrl: "https://ollama.com", apiKey: "chave-de-teste", model: "gpt-oss:120b", numCtx: 32768 };
const tools: ToolDeclaration[] = [{ name: "roll_dice", description: "Rola dados", parameters: { type: "object", properties: { notation: { type: "string" } }, required: ["notation"] } }];
const hello: AIMessage[] = [{ role: "user", text: "oi" }];

test("NDJSON: UTF-8 dividido em pedaços, CRLF e última linha sem quebra", async () => {
  const text = '{"a":"Olá, criação!"}\r\n\r\n{"b":2}\r\n{"c":3}';
  const out: unknown[] = [];
  for await (const item of readNDJSON(bodyFrom(text, 3))) out.push(item);
  expect(out).toEqual([{ a: "Olá, criação!" }, { b: 2 }, { c: 3 }]);
});

test("NDJSON: linha ilegível vira erro claro", async () => {
  const error = await failure((async () => { for await (const _ of readNDJSON(bodyFrom("{quebrado}\n"))) { /* consome */ } })());
  expect(error.code).toBe("AI_FORMAT");
});

test("endereços: padroniza, bloqueia o perigoso e reconhece rede local", () => {
  expect(normalizeBaseUrl("localhost:11434")).toBe("http://localhost:11434");
  expect(normalizeBaseUrl("http://127.0.0.1:11434/")).toBe("http://127.0.0.1:11434");
  expect(normalizeBaseUrl("0.0.0.0:11434")).toBe("http://localhost:11434");
  expect(normalizeBaseUrl("https://ollama.com")).toBe("https://ollama.com");
  expect(normalizeBaseUrl("http://proxy.lan/ollama/")).toBe("http://proxy.lan/ollama");
  for (const bad of ["", "ftp://x.com", "http://user:pass@host", "http://169.254.169.254/latest", "http://metadata.google.internal", "http://host?x=1", "http://[fe80::1]:11434", "http://host#frag"]) {
    expect(() => normalizeBaseUrl(bad), bad).toThrow(AIError);
  }
  for (const host of ["localhost", "192.168.1.5", "10.0.0.2", "172.20.1.1", "host.docker.internal", "ollama", "meu-pc.local", "127.0.0.1", "::1"]) expect(isPrivateHost(host), host).toBe(true);
  for (const host of ["example.com", "8.8.8.8", "172.32.0.1", "ollama.com"]) expect(isPrivateHost(host), host).toBe(false);
  expect(isCloudUrl("https://ollama.com")).toBe(true);
  expect(isCloudUrl("http://localhost:11434")).toBe(false);
});

test("mensagens: sistema primeiro, falas do jogador juntas, ferramenta com tool_name e thinking de volta", () => {
  const converted = toOllamaMessages("SISTEMA", [
    { role: "user", text: "A" }, { role: "user", text: "B" },
    { role: "assistant", text: "", calls: [{ name: "roll_dice", args: { notation: "1d20" } }], raw: [{ thinking: "pensei" }, { thinking: " mais" }] },
    { role: "tool", results: [{ name: "roll_dice", response: { total: 7 } }] },
    { role: "assistant", text: "Acertou!" },
  ]);
  expect(converted).toEqual([
    { role: "system", content: "SISTEMA" },
    { role: "user", content: "A\n\nB" },
    { role: "assistant", content: "", thinking: "pensei mais", tool_calls: [{ function: { name: "roll_dice", arguments: { notation: "1d20" } } }] },
    { role: "tool", tool_name: "roll_dice", content: '{"total":7}' },
    { role: "assistant", content: "Acertou!" },
  ]);
});

test("streaming: envia ferramentas e contexto, devolve texto, chamadas e raciocínio", async () => {
  const reply = lines(
    { message: { role: "assistant", content: "Olá" } },
    { message: { role: "assistant", thinking: "pensando..." } },
    { message: { role: "assistant", content: " mundo", tool_calls: [{ id: "c1", function: { name: "roll_dice", arguments: { notation: "1d20" } } }] } },
    { message: { role: "assistant", tool_calls: [{ function: { name: "roll_dice", arguments: '{"notation":"2d6"}' } }] } },
    { done: true },
  );
  await withFetch(() => ndjson(reply), async calls => {
    const events = await collect(streamOllama({ target: cloud, system: "SYS", messages: hello, tools }));
    expect(events).toEqual([
      { type: "text", text: "Olá" },
      { type: "text", text: " mundo" },
      { type: "call", call: { name: "roll_dice", args: { notation: "1d20" }, id: "c1" } },
      { type: "call", call: { name: "roll_dice", args: { notation: "2d6" }, id: undefined } },
      { type: "raw", raw: { thinking: "pensando..." } },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ollama.com/api/chat");
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer chave-de-teste");
    expect(calls[0].init.redirect).toBe("error");
    expect(calls[0].body).toMatchObject({
      model: "gpt-oss:120b", stream: true, options: { num_ctx: 32768 },
      tools: [{ type: "function", function: { name: "roll_dice", description: "Rola dados" } }],
      messages: [{ role: "system", content: "SYS" }, { role: "user", content: "oi" }],
    });
  });
});

test("streaming: sem chave não envia Authorization e sem ferramentas não envia a lista", async () => {
  await withFetch(() => ndjson(lines({ message: { content: "ok" } }, { done: true })), async calls => {
    await collect(streamOllama({ target: local, system: "s", messages: hello, tools: [] }));
    expect(headerOf(calls[0], "Authorization")).toBeUndefined();
    expect(calls[0].body?.tools).toBeUndefined();
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
  });
});

test("erros HTTP do Ollama viram mensagens e códigos úteis", async () => {
  const cases: { status: number; body: unknown; target: OllamaTarget; code: string; text: RegExp }[] = [
    { status: 401, body: { error: "Unauthorized" }, target: cloud, code: "AI_AUTH", text: /chave do Ollama foi recusada/ },
    { status: 401, body: { error: "Unauthorized" }, target: local, code: "AI_AUTH", text: /exigiu autenticação/ },
    { status: 403, body: { error: "forbidden" }, target: cloud, code: "AI_AUTH", text: /plano/ },
    { status: 404, body: { error: 'model "llama3.1" not found, try pulling it first' }, target: local, code: "AI_MODEL", text: /ollama pull llama3\.1/ },
    { status: 404, body: { error: 'model "x" not found' }, target: cloud, code: "AI_MODEL", text: /Ollama Cloud/ },
    { status: 404, body: "404 page not found", target: local, code: "AI_ENDPOINT", text: /Confira a URL/ },
    { status: 400, body: { error: "registry.ollama.ai/library/gemma:2b does not support tools" }, target: local, code: "AI_MODEL_TOOLS", text: /não suporta ferramentas/ },
    { status: 429, body: { error: "too many" }, target: cloud, code: "AI_RATE_LIMIT", text: /limite de uso/ },
    { status: 500, body: { error: "model requires more system memory (8.0 GiB) than is available (4.0 GiB)" }, target: local, code: "AI_MODEL_LOAD", text: /menor/ },
    { status: 503, body: { error: "busy" }, target: local, code: "AI_UNAVAILABLE", text: /indisponível/ },
  ];
  for (const item of cases) {
    await withFetch(() => json(item.status, item.body), async () => {
      const error = await failure(collect(streamOllama({ target: item.target, system: "s", messages: hello, tools })));
      expect(error.code, `${item.status} ${JSON.stringify(item.body)}`).toBe(item.code);
      expect(error.message).toMatch(item.text);
      expect(error.message).not.toContain("chave-de-teste");
    });
  }
});

test("servidor inalcançável: mensagem por tipo de destino, com dica do Docker", async () => {
  const refused = () => { throw Object.assign(new TypeError("fetch failed"), { cause: new Error("connect ECONNREFUSED 127.0.0.1:11434") }); };
  await withFetch(refused, async () => {
    const error = await failure(collect(streamOllama({ target: local, system: "s", messages: hello, tools })));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.message).toContain("localhost:11434");
    expect(error.message).toContain("host.docker.internal");
  });
  await withFetch(refused, async () => {
    const error = await failure(collect(streamOllama({ target: cloud, system: "s", messages: hello, tools })));
    expect(error.message).toContain("Ollama Cloud");
    expect(error.message).not.toContain("host.docker.internal");
  });
  await withFetch(() => { throw Object.assign(new TypeError("fetch failed"), { cause: new Error("unexpected redirect") }); }, async () => {
    const error = await failure(collect(streamOllama({ target: cloud, system: "s", messages: hello, tools })));
    expect(error.message).toContain("redirecionou");
  });
});

test("fluxo: erro no meio, corte sem fim, só raciocínio e silêncio viram erros explícitos", async () => {
  await withFetch(() => ndjson(lines({ message: { content: "começo" } }, { error: "model requires more system memory (8 GiB) than is available (4 GiB)" })), async () => {
    const error = await failure(collect(streamOllama({ target: local, system: "s", messages: hello, tools })));
    expect(error.code).toBe("AI_MODEL_LOAD");
  });
  await withFetch(() => ndjson(lines({ message: { content: "parcial" } })), async () => {
    expect((await failure(collect(streamOllama({ target: local, system: "s", messages: hello, tools })))).code).toBe("AI_INTERRUPTED");
  });
  await withFetch(() => ndjson(lines({ message: { thinking: "só pensei" } }, { done: true })), async () => {
    expect((await failure(collect(streamOllama({ target: local, system: "s", messages: hello, tools })))).code).toBe("AI_EMPTY");
  });
  await withFetch(() => new Response(null, { status: 200 }), async () => {
    expect((await failure(collect(streamOllama({ target: local, system: "s", messages: hello, tools })))).code).toBe("AI_EMPTY");
  });
});

test("fluxo: servidor que para de responder é interrompido por tempo", async () => {
  await withFetch(({ init }) => new Response(new ReadableStream<Uint8Array>({
    start(controller) { init.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true }); },
  }), { status: 200 }), async () => {
    const error = await failure(collect(streamOllama({ target: local, system: "s", messages: hello, tools: [], firstByteMs: 40, idleMs: 40 })));
    expect(error.code).toBe("AI_TIMEOUT");
    expect(error.status).toBe(504);
  });
});

test("JSON único: pede formato json sem streaming e rejeita resposta vazia", async () => {
  await withFetch(() => json(200, { message: { content: ' {"systemName":"X"} ' } }), async calls => {
    const text = await generateOllamaJSON({ target: local, system: "sys", prompt: "p" });
    expect(text).toBe('{"systemName":"X"}');
    expect(calls[0].body).toMatchObject({ stream: false, format: "json", options: { num_ctx: 16384 }, messages: [{ role: "system", content: "sys" }, { role: "user", content: "p" }] });
  });
  await withFetch(() => json(200, { message: { content: "  " } }), async () => {
    expect((await failure(generateOllamaJSON({ target: local, prompt: "p" }))).code).toBe("AI_EMPTY");
  });
  await withFetch(() => json(401, { error: "Unauthorized" }), async () => {
    expect((await failure(generateOllamaJSON({ target: cloud, prompt: "p" }))).code).toBe("AI_AUTH");
  });
});

test("validação: local não consome chat; sem ferramentas é recusado; nuvem testa a chave", async () => {
  // Local sem chave: só /api/show (não carrega o modelo na memória).
  await withFetch(() => json(200, { capabilities: ["completion", "tools"] }), async calls => {
    await validateOllama(local);
    expect(calls.map(call => new URL(call.url).pathname)).toEqual(["/api/show"]);
  });
  // Modelo sem ferramentas: recusado antes de qualquer chat.
  await withFetch(() => json(200, { capabilities: ["completion"] }), async calls => {
    expect((await failure(validateOllama(local))).code).toBe("AI_MODEL_TOOLS");
    expect(calls).toHaveLength(1);
  });
  // Servidor antigo sem "capabilities": não bloqueia.
  await withFetch(() => json(200, {}), async () => { await validateOllama(local); });
  // Modelo inexistente.
  await withFetch(() => json(404, { error: 'model "llama3.1" not found, try pulling it first' }), async () => {
    expect((await failure(validateOllama(local))).code).toBe("AI_MODEL");
  });
  // Nuvem: /api/show é público, então só o chat autenticado prova que a chave vale.
  await withFetch(call => new URL(call.url).pathname === "/api/show" ? json(200, { capabilities: ["completion", "tools", "thinking"] }) : json(200, { message: { content: "OK" } }), async calls => {
    await validateOllama(cloud);
    expect(calls.map(call => new URL(call.url).pathname)).toEqual(["/api/show", "/api/chat"]);
    expect(headerOf(calls[1], "Authorization")).toBe("Bearer chave-de-teste");
    expect(calls[1].body).toMatchObject({ stream: false, options: { num_predict: 16 } });
  });
  await withFetch(call => new URL(call.url).pathname === "/api/show" ? json(200, { capabilities: ["tools"] }) : json(401, { error: "Unauthorized" }), async () => {
    const error = await failure(validateOllama(cloud));
    expect(error.code).toBe("AI_AUTH");
    expect(error.message).not.toContain("chave-de-teste");
  });
});

test("lista de modelos: ordenada, sem repetição e com erro de endereço claro", async () => {
  await withFetch(() => json(200, { models: [{ name: "qwen3:8b" }, { model: "llama3.1:latest" }, { name: "qwen3:8b" }, {}] }), async calls => {
    expect(await listOllamaModels({ baseUrl: "http://localhost:11434" })).toEqual(["llama3.1:latest", "qwen3:8b"]);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });
  await withFetch(() => json(404, "404 page not found"), async () => {
    expect((await failure(listOllamaModels({ baseUrl: "http://localhost:11434" }))).code).toBe("AI_ENDPOINT");
  });
});

test("orçamento: o Ollama recebe menos livro por mensagem; o Gemini mantém tudo", () => {
  const gemini: ActiveAI = { provider: "gemini", configured: true, model: "m", source: "env" };
  expect(promptBudget(gemini)).toMatchObject({ rulesChars: 80_000, historyChars: Infinity, maxHits: 4, excerptChars: 3500 });
  const ollama = (numCtx: number): ActiveAI => ({ provider: "ollama", configured: true, model: "m", source: "saved", baseUrl: "http://localhost:11434", numCtx, mode: "local" });
  const sizes = [8192, 16384, 32768, 65536].map(n => promptBudget(ollama(n)));
  expect(sizes.map(item => item.rulesChars)).toEqual([3000, 12210, 53170, 80000]);
  expect(sizes[0]).toMatchObject({ maxHits: 2, excerptChars: 1500 });
  expect(sizes[1]).toMatchObject({ maxHits: 3, excerptChars: 1800, historyChars: 10240 });
  for (const item of sizes) expect(item.rulesChars).toBeGreaterThanOrEqual(3000);
});

test("histórico: mantém o mais recente, começa pelo jogador e nunca perde a última mensagem", () => {
  const history: AIMessage[] = [
    { role: "user", text: "a".repeat(100) }, { role: "assistant", text: "b".repeat(100) },
    { role: "user", text: "c".repeat(100) }, { role: "assistant", text: "d".repeat(100) }, { role: "user", text: "e".repeat(100) },
  ];
  expect(trimMessages(history, Infinity)).toBe(history);
  expect(trimMessages(history, 10_000)).toEqual(history);
  const letters = (items: AIMessage[]) => items.map(item => (item.role === "user" || item.role === "assistant" ? item.text[0] : "?"));
  const kept = trimMessages(history, 350);
  expect(letters(kept)).toEqual(["c", "d", "e"]);
  expect(kept[0].role).toBe("user");
  // Com 250 caberiam só [d, e]; como a conversa não pode começar pela IA, o "d" é descartado.
  expect(letters(trimMessages(history, 250))).toEqual(["e"]);
  const one = trimMessages(history, 1);
  expect(one).toHaveLength(1);
  expect(one[0]).toMatchObject({ role: "user", text: "e".repeat(100) });
});

test("fachada: Ollama converte eventos; Gemini preserva assinaturas pela camada neutra", async () => {
  const ollama: ActiveAI = { provider: "ollama", configured: true, model: "llama3.1", source: "saved", baseUrl: "http://localhost:11434", numCtx: 16384, mode: "local" };
  await withFetch(() => ndjson(lines({ message: { content: "Oi", tool_calls: [{ function: { name: "roll_dice", arguments: { notation: "1d6" } } }] } }, { done: true })), async () => {
    const events = await collect(aiStream(ollama, { system: "s", messages: hello, tools, session: {} }));
    expect(events).toEqual([{ type: "text", text: "Oi" }, { type: "call", call: { name: "roll_dice", args: { notation: "1d6" }, id: undefined } }]);
  });
  expect((await failure(collect(aiStream({ ...ollama, configured: false }, { system: "s", messages: hello, tools, session: {} })))).code).toBe("AI_NOT_CONFIGURED");

  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "chave-de-teste-gemini";
  try {
    const part = { functionCall: { name: "roll_dice", args: { notation: "1d20" }, id: "g1" }, thoughtSignature: "ASSINATURA" };
    const sse = () => new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [part] } }] })}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
    await withFetch(() => sse(), async calls => {
      const gemini: ActiveAI = { provider: "gemini", configured: true, model: "gemini-flash-lite-latest", source: "env" };
      const session: AISession = {};
      const first = await collect(aiStream(gemini, { system: "s", messages: hello, tools, session }));
      expect(first).toEqual([{ type: "raw", raw: part }, { type: "call", call: { name: "roll_dice", args: { notation: "1d20" }, id: "g1" } }]);
      expect(session.model).toBeTruthy();
      // Segunda chamada: a assinatura e o resultado da ferramenta voltam exatamente como o Gemini exige.
      await collect(aiStream(gemini, {
        system: "s", tools, session,
        messages: [...hello, { role: "assistant", text: "", calls: [{ name: "roll_dice", args: { notation: "1d20" }, id: "g1" }], raw: [part] }, { role: "tool", results: [{ name: "roll_dice", id: "g1", response: { total: 7 } }] }],
      }));
      expect(calls[1].body?.contents).toEqual([
        { role: "user", parts: [{ text: "oi" }] },
        { role: "model", parts: [part] },
        { role: "user", parts: [{ functionResponse: { name: "roll_dice", id: "g1", response: { total: 7 } } }] },
      ]);
    });
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  }
});
