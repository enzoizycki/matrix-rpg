import { AIError, toAIError } from "./ai-errors";
import { readNDJSON } from "./ndjson";
import type { AIEvent, AIMessage, ToolDeclaration } from "./ai-types";

export type OllamaTarget = { baseUrl: string; apiKey?: string; model: string; numCtx: number };
type Endpoint = Pick<OllamaTarget, "baseUrl" | "apiKey">;

// ---------- Endereço ----------

const BLOCKED_HOSTS = new Set(["metadata.google.internal", "metadata", "instance-data", "fd00:ec2::254"]);

/** Hosts de rede local: enviar a chave por http:// só é aceitável nesses casos. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "host.docker.internal") return true;
  if (host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host)) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  // Nome sem ponto: serviço do Docker Compose ou computador da rede local.
  return !host.includes(".") && !host.includes(":");
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return BLOCKED_HOSTS.has(host) || /^169\.254\./.test(host) || /^fe80:/.test(host);
}

export function isCloudUrl(baseUrl: string): boolean {
  try { return new URL(baseUrl).hostname.toLowerCase() === "ollama.com"; } catch { return false; }
}

/** Valida e padroniza o endereço informado pelo usuário (ou vindo do .env). */
export function normalizeBaseUrl(raw: string): string {
  const text = raw.trim();
  if (!text || text.length > 300) {
    throw new AIError("Informe o endereço do servidor Ollama (ex.: http://localhost:11434).", "INVALID_URL", 400);
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url: URL;
  try { url = new URL(withScheme); }
  catch { throw new AIError("O endereço do Ollama é inválido. Exemplo: http://localhost:11434", "INVALID_URL", 400); }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AIError("O endereço do Ollama deve começar com http:// ou https://.", "INVALID_URL", 400);
  }
  if (url.username || url.password) {
    throw new AIError("Não coloque usuário ou senha no endereço. Use o campo de chave de API.", "INVALID_URL", 400);
  }
  if (url.search || url.hash) {
    throw new AIError("O endereço do Ollama não deve ter parâmetros (? ou #).", "INVALID_URL", 400);
  }
  if (url.hostname === "0.0.0.0") url.hostname = "localhost";
  if (isBlockedHost(url.hostname)) {
    throw new AIError("Este endereço não é permitido por segurança.", "INVALID_URL", 400);
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

export function sameEndpoint(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ---------- Erros ----------

function errorText(raw: string): string {
  try {
    const data = JSON.parse(raw) as { error?: unknown };
    if (data && typeof data.error === "string") return data.error;
  } catch { /* texto simples */ }
  return raw.slice(0, 300);
}

/** Traduz o erro devolvido pelo Ollama (HTTP ou dentro do fluxo) em uma mensagem útil. */
export function errorFromText(text: string, status: number, target: { baseUrl: string; model: string }): AIError {
  const cloud = isCloudUrl(target.baseUrl);
  const model = target.model;
  if (/does not support tools/i.test(text)) {
    return new AIError(`O modelo “${model}” não suporta ferramentas (tool calling), que o Mestre usa para dados e ficha. Escolha outro modelo em Conectar IA.`, "AI_MODEL_TOOLS", 400);
  }
  if (/more system memory|out of memory|failed to load|unable to load|insufficient memory/i.test(text)) {
    return new AIError(`O Ollama não conseguiu carregar “${model}” (memória insuficiente?). Escolha um modelo menor em Conectar IA.`, "AI_MODEL_LOAD", 503);
  }
  if (status === 401) {
    return new AIError(cloud
      ? "A chave do Ollama foi recusada. Atualize-a em Conectar IA; sua ficha continua salva."
      : "O servidor Ollama exigiu autenticação. Informe a chave de API em Conectar IA.", "AI_AUTH", 401);
  }
  if (status === 403) {
    return new AIError("O Ollama recusou o acesso: a chave não tem permissão para este modelo ou ele não está no seu plano.", "AI_AUTH", 403);
  }
  if (status === 404) {
    if (!model || !/model/i.test(text)) {
      return new AIError("O endereço informado não respondeu como um servidor Ollama (erro 404). Confira a URL em Conectar IA.", "AI_ENDPOINT", 404);
    }
    return new AIError(cloud
      ? `O modelo “${model}” não foi encontrado no Ollama Cloud. Escolha outro da lista em Conectar IA.`
      : `O modelo “${model}” não está instalado neste servidor. Rode “ollama pull ${model}” ou escolha outro em Conectar IA.`, "AI_MODEL", 404);
  }
  if (status === 429) {
    return new AIError(cloud
      ? "O limite de uso do Ollama Cloud foi atingido. Aguarde ou confira seu plano em ollama.com/settings/usage."
      : "O servidor Ollama está sobrecarregado. Aguarde um instante e tente novamente.", "AI_RATE_LIMIT", 429);
  }
  if (status >= 500) {
    return new AIError("O Ollama está indisponível no momento. Sua conexão está salva; tente novamente.", "AI_UNAVAILABLE", 503);
  }
  return new AIError(`O Ollama não aceitou a solicitação: ${text.slice(0, 160) || `erro ${status}`}`, "AI_REQUEST_FAILED", 502);
}

function providerError(response: { status: number }, raw: string, target: { baseUrl: string; model: string }): AIError {
  return errorFromText(errorText(raw), response.status, target);
}

function networkError(error: unknown, baseUrl: string): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return toAIError(error);
  const detail = `${error instanceof Error ? error.message : ""} ${(error as { cause?: { message?: string } } | undefined)?.cause?.message ?? ""}`;
  if (/redirect/i.test(detail)) {
    return new AIError("O endereço do Ollama redirecionou a conexão, o que não é permitido por segurança. Use o endereço final do servidor.", "AI_UNAVAILABLE", 503);
  }
  if (isCloudUrl(baseUrl)) {
    return new AIError("Não foi possível conectar ao Ollama Cloud. Verifique sua internet e tente novamente.", "AI_UNAVAILABLE", 503);
  }
  const host = new URL(baseUrl).host;
  const loopback = /^(localhost|127\.|\[::1\])/.test(host);
  return new AIError(
    `Não foi possível conectar ao Ollama em ${host}. Confira se ele está em execução (ollama serve).${loopback ? " Se este sistema roda no Docker, use http://host.docker.internal:11434 como endereço." : ""}`,
    "AI_UNAVAILABLE", 503);
}

// ---------- Requisições ----------

async function call(endpoint: Endpoint, path: string, init: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json, application/x-ndjson" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`;
  try {
    return await fetch(`${endpoint.baseUrl}${path}`, {
      method: init.method ?? "POST",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      // A chave nunca pode seguir um redirecionamento para outro servidor.
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) { throw networkError(error, endpoint.baseUrl); }
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// ---------- Conversão de mensagens ----------

export type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  thinking?: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  tool_name?: string;
};

export function toOllamaMessages(system: string, messages: AIMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") {
      const last = out[out.length - 1];
      // Alguns modelos exigem alternância; junta mensagens seguidas do jogador.
      if (last?.role === "user") last.content += `\n\n${message.text}`;
      else out.push({ role: "user", content: message.text });
    } else if (message.role === "assistant") {
      const thinking = (message.raw ?? [])
        .map(item => (item && typeof item === "object" && typeof (item as { thinking?: unknown }).thinking === "string" ? (item as { thinking: string }).thinking : ""))
        .join("");
      const converted: OllamaMessage = { role: "assistant", content: message.text };
      if (thinking) converted.thinking = thinking;
      if (message.calls?.length) converted.tool_calls = message.calls.map(call => ({ function: { name: call.name, arguments: call.args } }));
      out.push(converted);
    } else {
      for (const result of message.results) {
        out.push({ role: "tool", tool_name: result.name, content: JSON.stringify(result.response) });
      }
    }
  }
  return out;
}

const toOllamaTool = (tool: ToolDeclaration) => ({
  type: "function" as const,
  function: { name: tool.name, description: tool.description, parameters: tool.parameters },
});

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* argumentos inválidos viram objeto vazio */ }
  }
  return {};
}

// ---------- Conversa em streaming ----------

type OllamaChunk = {
  error?: unknown;
  done?: boolean;
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[];
  };
};

export async function* streamOllama(opts: {
  target: OllamaTarget;
  system: string;
  messages: AIMessage[];
  tools: ToolDeclaration[];
  signal?: AbortSignal;
  temperature?: number;
  firstByteMs?: number; // modelos locais podem demorar para carregar na memória
  idleMs?: number;
}): AsyncGenerator<AIEvent> {
  const { target } = opts;
  const idle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(new DOMException("A IA parou de responder.", "TimeoutError")), ms);
  };
  const signal = opts.signal ? AbortSignal.any([opts.signal, idle.signal]) : idle.signal;
  arm(opts.firstByteMs ?? 90_000);

  let thinking = "";
  let yielded = false;
  let finished = false;
  try {
    const response = await call(target, "/api/chat", {
      signal,
      body: {
        model: target.model,
        messages: toOllamaMessages(opts.system, opts.messages),
        tools: opts.tools.length ? opts.tools.map(toOllamaTool) : undefined,
        stream: true,
        options: { temperature: opts.temperature ?? 0.85, num_ctx: target.numCtx },
      },
    });
    if (!response.ok) throw providerError(response, await response.text().catch(() => ""), target);
    if (!response.body) throw new AIError("O Ollama respondeu sem conteúdo. Tente novamente.", "AI_EMPTY", 502);

    for await (const line of readNDJSON(response.body, () => arm(opts.idleMs ?? 60_000))) {
      const chunk = line as OllamaChunk;
      if (typeof chunk.error === "string") throw errorFromText(chunk.error, 500, target);
      const message = chunk.message;
      if (message?.thinking) thinking += message.thinking;
      if (message?.content) {
        yielded = true;
        yield { type: "text", text: message.content };
      }
      for (const toolCall of message?.tool_calls ?? []) {
        const fn = toolCall.function;
        if (!fn?.name) continue;
        yielded = true;
        yield { type: "call", call: { name: fn.name, args: parseArgs(fn.arguments), id: toolCall.id } };
      }
      if (chunk.done) finished = true;
    }
    // Modelos de raciocínio: o "thinking" precisa voltar junto com as chamadas de ferramenta.
    if (thinking) yield { type: "raw", raw: { thinking } };
  } catch (error) {
    throw networkError(error, target.baseUrl);
  } finally { clearTimeout(timer); }

  if (!finished) throw new AIError("A conexão com o Ollama foi interrompida antes do fim da resposta. Tente novamente.", "AI_INTERRUPTED", 502);
  if (!yielded) throw new AIError(`O modelo “${target.model}” terminou sem responder (pode ter gastado tudo em raciocínio). Tente novamente ou escolha outro modelo.`, "AI_EMPTY", 502);
}

/** Uma resposta JSON única (usada para identificar o jogo a partir do livro). */
export async function generateOllamaJSON(opts: {
  target: OllamaTarget; system?: string; prompt: string; signal?: AbortSignal; timeoutMs?: number; temperature?: number;
}): Promise<string> {
  const { target } = opts;
  const signal = withTimeout(opts.signal, opts.timeoutMs ?? 60_000);
  try {
    const response = await call(target, "/api/chat", {
      signal,
      body: {
        model: target.model,
        stream: false,
        format: "json",
        messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: opts.prompt }],
        options: { temperature: opts.temperature ?? 0.1, num_ctx: target.numCtx },
      },
    });
    if (!response.ok) throw providerError(response, await response.text().catch(() => ""), target);
    const data = await response.json() as { error?: unknown; message?: { content?: unknown } };
    if (typeof data.error === "string") throw errorFromText(data.error, 500, target);
    const text = typeof data.message?.content === "string" ? data.message.content.trim() : "";
    if (!text) throw new AIError("O Ollama não identificou o livro nesta tentativa. Tente novamente.", "AI_EMPTY", 502);
    return text;
  } catch (error) { throw networkError(error, target.baseUrl); }
}

// ---------- Modelos e validação ----------

/** Nomes dos modelos disponíveis (instalados no servidor local, ou a lista pública da nuvem). */
export async function listOllamaModels(endpoint: Endpoint, signal?: AbortSignal): Promise<string[]> {
  try {
    const response = await call(endpoint, "/api/tags", { method: "GET", signal: withTimeout(signal, 15_000) });
    if (!response.ok) throw errorFromText(errorText(await response.text().catch(() => "")), response.status, { baseUrl: endpoint.baseUrl, model: "" });
    const data = await response.json().catch(() => null) as { models?: { name?: unknown; model?: unknown }[] } | null;
    const names = (data?.models ?? [])
      .map(item => (typeof item.name === "string" ? item.name : typeof item.model === "string" ? item.model : ""))
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  } catch (error) { throw networkError(error, endpoint.baseUrl); }
}

/**
 * Confere antes de salvar: servidor alcançável, modelo existente, suporte a ferramentas e
 * (na nuvem ou com chave) uma chamada autenticada. As listas públicas da nuvem não exigem chave,
 * então só uma chamada de chat prova que a chave é válida.
 */
export async function validateOllama(target: OllamaTarget, signal?: AbortSignal): Promise<{ capabilities?: string[] }> {
  const limited = withTimeout(signal, 45_000);
  try {
    const show = await call(target, "/api/show", { body: { model: target.model }, signal: limited });
    if (!show.ok) throw providerError(show, await show.text().catch(() => ""), target);
    const info = await show.json().catch(() => ({})) as { capabilities?: unknown };
    const capabilities = Array.isArray(info.capabilities) ? info.capabilities.filter((item): item is string => typeof item === "string") : undefined;
    if (capabilities && !capabilities.includes("tools")) {
      throw new AIError(`O modelo “${target.model}” não suporta ferramentas (tool calling), que o Mestre usa para dados e ficha. Escolha outro modelo.`, "AI_MODEL_TOOLS", 400);
    }
    if (target.apiKey || isCloudUrl(target.baseUrl)) {
      const chat = await call(target, "/api/chat", {
        signal: limited,
        body: { model: target.model, stream: false, messages: [{ role: "user", content: "Responda apenas OK." }], options: { num_predict: 16 } },
      });
      const raw = await chat.text().catch(() => "");
      if (!chat.ok) throw providerError(chat, raw, target);
    }
    return { capabilities };
  } catch (error) { throw networkError(error, target.baseUrl); }
}
