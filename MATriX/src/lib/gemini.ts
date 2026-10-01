import { readSSE } from "./sse";
import { AIError } from "./ai-errors";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY?.trim());

export class GeminiError extends AIError {
  constructor(message: string, code: string, status: number) {
    super(message, code, status);
    this.name = "GeminiError";
  }
}

export function toGeminiError(error: unknown): GeminiError {
  if (error instanceof GeminiError) return error;
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return new GeminiError("A IA demorou para responder. Sua conexão está salva; tente iniciar novamente.", "AI_TIMEOUT", 504);
  }
  return new GeminiError("Não foi possível conectar ao Gemini. Sua conexão está salva; tente novamente.", "AI_UNAVAILABLE", 503);
}

function providerError(status: number, raw: string): GeminiError {
  if ([401, 403].includes(status) || (status === 400 && /api.?key|key.*expired|key.*invalid/i.test(raw))) {
    return new GeminiError("A chave Gemini foi recusada. Use Conectar IA para atualizar a conexão, sem perder sua ficha.", "AI_AUTH", 401);
  }
  if (status === 429) return new GeminiError("O limite de uso do Gemini foi atingido. Aguarde e tente novamente ou verifique a cota da chave.", "AI_RATE_LIMIT", 429);
  if (status === 404) return new GeminiError("O modelo Gemini configurado não está disponível. Escolha outro em Conectar IA.", "AI_MODEL", 404);
  if (status >= 500) return new GeminiError("O Gemini está temporariamente indisponível. Sua conexão está salva; tente novamente.", "AI_UNAVAILABLE", 503);
  return new GeminiError("O Gemini não aceitou esta solicitação. Tente novamente ou revise o modelo em Conectar IA.", "AI_REQUEST_FAILED", 502);
}

export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
};
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
export type FunctionDeclaration = { name: string; description: string; parameters: Record<string, unknown> };
export type StreamEvent =
  | { type: "text"; text: string; part: GeminiPart; model: string }
  | { type: "functionCall"; name: string; args: Record<string, unknown>; id?: string; thoughtSignature?: string; part: GeminiPart; model: string };

type GeminiResponse = {
  error?: { code?: number; message?: string };
  promptFeedback?: { blockReason?: string };
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
};

function assertResponse(data: GeminiResponse) {
  if (data.error) throw providerError(data.error.code || 502, data.error.message || "");
  if (data.promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "RECITATION"].includes(data.candidates?.[0]?.finishReason || "")) {
    throw new GeminiError("O Gemini não respondeu a este conteúdo. Reformule a mensagem para continuar.", "AI_BLOCKED", 422);
  }
}

function requireKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("Conecte o Mestre IA para iniciar. As regras de Matrix já estão incorporadas.", "AI_NOT_CONFIGURED", 428);
  return key;
}

export async function* streamGemini(opts: {
  system: string;
  contents: GeminiContent[];
  tools: FunctionDeclaration[];
  temperature?: number;
  signal?: AbortSignal;
  model?: string;
}): AsyncGenerator<StreamEvent> {
  const key = requireKey();
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    tools: opts.tools.length ? [{ functionDeclarations: opts.tools }] : undefined,
    generationConfig: { temperature: opts.temperature ?? 0.85 },
  };
  // Never change model after its signed tool calls: signatures are model-specific.
  const models = opts.model ? [opts.model] : [...new Set([geminiModel(), "gemini-flash-latest"])];
  let lastError: GeminiError | undefined;
  for (const model of models) {
    const timeout = AbortSignal.timeout(35_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let yielded = false;
    try {
      const response = await fetch(`${BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body), signal, cache: "no-store",
      });
      if (!response.ok) throw providerError(response.status, await response.text());
      if (!response.body) throw new GeminiError("O Gemini respondeu sem conteúdo. Tente novamente.", "AI_EMPTY", 502);
      for await (const payload of readSSE(response.body)) {
        if (payload === "[DONE]") continue;
        const data = JSON.parse(payload) as GeminiResponse;
        assertResponse(data);
        for (const part of data.candidates?.[0]?.content?.parts || []) {
          if (part.thought) continue;
          if (typeof part.text === "string" && part.text) {
            yielded = true;
            yield { type: "text", text: part.text, part, model };
          } else if (part.functionCall) {
            yielded = true;
            yield { type: "functionCall", ...part.functionCall, args: part.functionCall.args || {}, thoughtSignature: part.thoughtSignature, part, model };
          }
        }
      }
      if (!yielded) throw new GeminiError("O Gemini terminou sem responder. Sua conexão está salva; tente iniciar novamente.", "AI_EMPTY", 502);
      return;
    } catch (error) {
      lastError = toGeminiError(error);
      // No automatic restart after a partial answer (which could repeat tools).
      if (yielded || opts.signal?.aborted || !["AI_UNAVAILABLE", "AI_MODEL", "AI_TIMEOUT"].includes(lastError.code)) throw lastError;
    }
  }
  throw lastError || new GeminiError("O Gemini não respondeu.", "AI_EMPTY", 502);
}

export async function generateGemini(opts: {
  system?: string; prompt: string; temperature?: number; json?: boolean;
  retries?: number; timeoutMs?: number; signal?: AbortSignal;
}): Promise<string> {
  const key = requireKey();
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 25_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const body = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
    generationConfig: { temperature: opts.temperature ?? 0.2, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
  };
  const attempts = Math.max(1, Math.min(opts.retries ?? 1, 2));
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${BASE}/${encodeURIComponent(geminiModel())}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body), signal, cache: "no-store",
      });
      if (!response.ok) throw providerError(response.status, await response.text());
      // The abort signal remains active through body consumption, not just headers.
      const data = await response.json() as GeminiResponse;
      assertResponse(data);
      const text = (data.candidates?.[0]?.content?.parts || []).filter(part => !part.thought).map(part => part.text || "").join("").trim();
      if (!text) throw new GeminiError("O Gemini não identificou o livro nesta tentativa. Tente novamente.", "AI_EMPTY", 502);
      return text;
    } catch (error) {
      const failure = toGeminiError(error);
      if (signal.aborted || attempt === attempts - 1 || failure.code !== "AI_UNAVAILABLE") throw failure;
    }
  }
  throw new GeminiError("O Gemini não respondeu.", "AI_EMPTY", 502);
}
