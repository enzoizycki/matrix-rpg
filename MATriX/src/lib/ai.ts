import type { ActiveAI } from "./ai-config";
import { AIError } from "./ai-errors";
import { generateGemini, streamGemini, type GeminiContent, type GeminiPart } from "./gemini";
import { generateOllamaJSON, streamOllama } from "./ollama";
import type { AIEvent, AIMessage, AISession, ToolDeclaration } from "./ai-types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const providerName = (ai: Pick<ActiveAI, "provider">) => (ai.provider === "ollama" ? "Ollama" : "Gemini");

const notConfigured = () => new AIError(
  "Conecte o Mestre IA para iniciar. As regras de Matrix já estão incorporadas.", "AI_NOT_CONFIGURED", 428);

// ---------- Orçamento do prompt ----------

export type PromptBudget = {
  rulesChars: number;          // trecho do livro enviado junto de cada mensagem
  historyChars: number;        // histórico recente mantido (Infinity = tudo)
  maxHits: number;             // trechos devolvidos pela busca no livro
  excerptChars: number;        // tamanho de cada trecho
  identifyChars: number;       // amostra do livro usada para identificar o jogo
  identifyTimeoutMs: number;
  turnTimeoutMs: number;
};

/**
 * O Gemini aceita contexto enorme. O Ollama usa a janela (num_ctx) configurada e descarta o
 * excedente em silêncio, então o texto enviado precisa caber: o livro completo continua
 * acessível pela ferramenta de busca, só não vai inteiro em toda mensagem.
 */
export function promptBudget(ai: ActiveAI): PromptBudget {
  if (ai.provider === "gemini") {
    return { rulesChars: 80_000, historyChars: Infinity, maxHits: 4, excerptChars: 3500, identifyChars: 40_000, identifyTimeoutMs: 20_000, turnTimeoutMs: 95_000 };
  }
  const n = ai.numCtx;
  const small = n < 12_000;
  return {
    rulesChars: clamp(Math.floor((n - 11_500) * 2.5), 3_000, 80_000),
    historyChars: Math.floor(n * 0.25 * 2.5),
    maxHits: small ? 2 : 3,
    excerptChars: small ? 1_500 : 1_800,
    identifyChars: clamp(Math.floor((n - 3_000) * 2.5), 6_000, 40_000),
    identifyTimeoutMs: 60_000,
    turnTimeoutMs: 115_000,
  };
}

function messageSize(message: AIMessage): number {
  if (message.role === "user") return message.text.length;
  if (message.role === "assistant") return message.text.length + JSON.stringify(message.calls ?? []).length;
  return JSON.stringify(message.results).length;
}

/** Mantém as mensagens mais recentes que cabem no orçamento; sempre começa por uma fala do jogador. */
export function trimMessages(messages: AIMessage[], maxChars: number): AIMessage[] {
  if (!Number.isFinite(maxChars)) return messages;
  let total = 0;
  let start = messages.length;
  for (let index = messages.length - 1; index >= 0; index--) {
    const size = messageSize(messages[index]);
    if (total + size > maxChars && start < messages.length) break;
    total += size;
    start = index;
  }
  let kept = messages.slice(start);
  while (kept.length > 1 && kept[0].role !== "user") kept = kept.slice(1);
  return kept;
}

// ---------- Gemini ----------

function toGeminiContents(messages: AIMessage[]): GeminiContent[] {
  return messages.map((message): GeminiContent => {
    if (message.role === "user") return { role: "user", parts: [{ text: message.text }] };
    if (message.role === "assistant") {
      const parts: GeminiPart[] = message.raw?.length
        ? (message.raw as GeminiPart[])
        : [
            ...(message.text ? [{ text: message.text }] : []),
            ...(message.calls ?? []).map(call => ({ functionCall: { name: call.name, args: call.args, id: call.id } })),
          ];
      return { role: "model", parts };
    }
    return { role: "user", parts: message.results.map(result => ({ functionResponse: { name: result.name, id: result.id, response: result.response } })) };
  });
}

// ---------- Fachada ----------

export async function* aiStream(ai: ActiveAI, opts: {
  system: string; messages: AIMessage[]; tools: ToolDeclaration[]; signal?: AbortSignal; session: AISession;
}): AsyncGenerator<AIEvent> {
  if (!ai.configured) throw notConfigured();
  if (ai.provider === "ollama") {
    yield* streamOllama({
      target: { baseUrl: ai.baseUrl, apiKey: ai.apiKey, model: ai.model, numCtx: ai.numCtx },
      system: opts.system, messages: opts.messages, tools: opts.tools, signal: opts.signal,
    });
    return;
  }
  for await (const event of streamGemini({
    system: opts.system, contents: toGeminiContents(opts.messages), tools: opts.tools,
    signal: opts.signal, model: opts.session.model,
  })) {
    // O Gemini assina as chamadas de ferramenta por modelo: mantém o mesmo durante o turno.
    opts.session.model = event.model;
    yield { type: "raw", raw: event.part };
    if (event.type === "text") yield { type: "text", text: event.text };
    else yield { type: "call", call: { name: event.name, args: event.args, id: event.id } };
  }
}

export async function aiGenerateJSON(ai: ActiveAI, opts: {
  system?: string; prompt: string; timeoutMs: number; signal?: AbortSignal;
}): Promise<string> {
  if (!ai.configured) throw notConfigured();
  if (ai.provider === "ollama") {
    return generateOllamaJSON({
      target: { baseUrl: ai.baseUrl, apiKey: ai.apiKey, model: ai.model, numCtx: ai.numCtx },
      system: opts.system, prompt: opts.prompt, signal: opts.signal, timeoutMs: opts.timeoutMs,
    });
  }
  return generateGemini({
    json: true, temperature: 0.1, retries: 1, timeoutMs: opts.timeoutMs,
    signal: opts.signal, system: opts.system, prompt: opts.prompt,
  });
}
