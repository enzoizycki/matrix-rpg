import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  DEFAULT_CLOUD_MODEL, DEFAULT_CLOUD_NUM_CTX, DEFAULT_GEMINI_MODEL, DEFAULT_LOCAL_NUM_CTX,
  OLLAMA_CLOUD_URL, OLLAMA_LOCAL_URL,
} from "./ai-constants";
import { isCloudUrl, normalizeBaseUrl, sameEndpoint } from "./ollama";
import { parseApiKey } from "./api-key";

export type Provider = "gemini" | "ollama";
export type Source = "saved" | "env" | "none";

const CACHE_MS = 10_000;
const SETTING_KEYS = [
  "ai_provider", "gemini_api_key", "gemini_model",
  "ollama_api_key", "ollama_base_url", "ollama_model", "ollama_num_ctx",
];

// Prioridade: o que foi salvo pelo site (banco) vence as variáveis de ambiente (.env / Docker).
type Env = {
  provider?: string; geminiKey?: string; geminiModel?: string;
  ollamaKey?: string; ollamaUrl?: string; ollamaModel?: string; ollamaNumCtx?: string;
};
type Resolved = {
  provider: Provider;
  gemini: { key?: string; model: string; keySource: Source };
  ollama: { baseUrl: string; key?: string; keySource: Source; model: string; modelSource: Source; numCtx: number };
};
type Shared = { __aiEnv?: Env; __aiCache?: { value: Resolved; at: number }; __aiWarned?: Set<string> };

const shared = globalThis as typeof globalThis & Shared;
const clean = (value?: string) => value?.trim() || undefined;
// Chave vinda do ambiente: remove aspas/"export" e ignora texto de exemplo (YOUR_API_KEY).
const cleanKey = (value?: string) => parseApiKey(value ?? "").key || undefined;

function readEnv(): Env {
  return {
    provider: clean(process.env.AI_PROVIDER)?.toLowerCase(),
    geminiKey: cleanKey(process.env.GEMINI_API_KEY),
    geminiModel: clean(process.env.GEMINI_MODEL),
    ollamaKey: cleanKey(process.env.OLLAMA_API_KEY),
    ollamaUrl: clean(process.env.OLLAMA_BASE_URL) ?? clean(process.env.OLLAMA_HOST),
    ollamaModel: clean(process.env.OLLAMA_MODEL),
    ollamaNumCtx: clean(process.env.OLLAMA_NUM_CTX),
  };
}
// O código abaixo altera process.env.GEMINI_*; guardar o original evita confundir as duas origens.
shared.__aiEnv ??= readEnv();

function toInt(value: string | undefined, min: number, max: number): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined;
}

function safeBaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try { return normalizeBaseUrl(raw); }
  catch {
    shared.__aiWarned ??= new Set();
    if (!shared.__aiWarned.has(raw)) {
      shared.__aiWarned.add(raw);
      console.error("Configuração do Ollama: endereço inválido ignorado.");
    }
    return undefined;
  }
}

function resolve(rows: { key: string; value: string }[], env: Env): Resolved {
  const saved = new Map(rows.map(row => [row.key, row.value.trim()]));
  const savedValue = (key: string) => saved.get(key) || undefined;

  const geminiKey = savedValue("gemini_api_key") ?? env.geminiKey;
  const gemini = {
    key: geminiKey,
    model: savedValue("gemini_model") ?? env.geminiModel ?? DEFAULT_GEMINI_MODEL,
    keySource: (savedValue("gemini_api_key") ? "saved" : env.geminiKey ? "env" : "none") as Source,
  };

  const baseCandidate = safeBaseUrl(savedValue("ollama_base_url")) ?? safeBaseUrl(env.ollamaUrl);
  const ollamaKey = savedValue("ollama_api_key") ?? env.ollamaKey;
  const baseUrl = baseCandidate ?? (ollamaKey ? OLLAMA_CLOUD_URL : OLLAMA_LOCAL_URL);
  const cloud = isCloudUrl(baseUrl);
  const model = savedValue("ollama_model") ?? env.ollamaModel ?? (cloud ? DEFAULT_CLOUD_MODEL : "");
  const ollama = {
    baseUrl,
    key: ollamaKey,
    keySource: (savedValue("ollama_api_key") ? "saved" : env.ollamaKey ? "env" : "none") as Source,
    model,
    modelSource: (savedValue("ollama_model") ? "saved" : env.ollamaModel ? "env" : "none") as Source,
    numCtx: toInt(savedValue("ollama_num_ctx") ?? env.ollamaNumCtx, 2048, 131072) ?? (cloud ? DEFAULT_CLOUD_NUM_CTX : DEFAULT_LOCAL_NUM_CTX),
  };

  const savedProvider = savedValue("ai_provider");
  const envProvider = env.provider;
  let provider: Provider;
  if (savedProvider === "gemini" || savedProvider === "ollama") provider = savedProvider;
  else if (envProvider === "gemini" || envProvider === "ollama") provider = envProvider;
  else if (!geminiKey && (env.ollamaKey || env.ollamaUrl || env.ollamaModel)) provider = "ollama";
  else provider = "gemini";
  return { provider, gemini, ollama };
}

async function resolveConfig(): Promise<Resolved> {
  const cached = shared.__aiCache;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const env = shared.__aiEnv!;
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, SETTING_KEYS));
    const value = resolve(rows, env);
    shared.__aiCache = { value, at: Date.now() };
    return value;
  } catch (error) {
    // Uma falha momentânea do banco não pode "apagar" a conexão já configurada.
    console.error("Configuração da IA: banco indisponível, usando o último valor conhecido.", error instanceof Error ? error.name : "");
    if (cached) return cached.value;
    if (Object.values(env).some(Boolean)) return resolve([], env);
    throw error; // sem nenhuma referência: melhor falhar do que afirmar "sem chave"
  }
}

function applyGemini(value: Resolved) {
  if (value.gemini.key) process.env.GEMINI_API_KEY = value.gemini.key;
  else delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_MODEL = value.gemini.model;
}

export type ActiveAI =
  | { provider: "gemini"; configured: boolean; model: string; source: Source }
  | {
      provider: "ollama"; configured: boolean; model: string; source: Source;
      baseUrl: string; apiKey?: string; numCtx: number; mode: "cloud" | "local";
    };

function toActive(value: Resolved): ActiveAI {
  if (value.provider === "gemini") {
    return { provider: "gemini", configured: Boolean(value.gemini.key), model: value.gemini.model, source: value.gemini.keySource };
  }
  const o = value.ollama;
  const cloud = isCloudUrl(o.baseUrl);
  return {
    provider: "ollama",
    configured: Boolean(o.model) && (!cloud || Boolean(o.key)),
    model: o.model,
    source: cloud ? o.keySource : o.modelSource,
    baseUrl: o.baseUrl, apiKey: o.key, numCtx: o.numCtx, mode: cloud ? "cloud" : "local",
  };
}

/** Configuração em uso agora (lida do banco e do ambiente, com cache curto). */
export async function getActiveAI(): Promise<ActiveAI> {
  const value = await resolveConfig();
  applyGemini(value);
  return toActive(value);
}

export type PublicStatus = {
  configured: boolean;
  provider: Provider;
  model: string;
  source: Source;
  gemini: { hasKey: boolean; model: string };
  ollama: { mode: "cloud" | "local"; baseUrl: string; hasKey: boolean; model: string; numCtx: number };
};

/** Estado para a interface. Nunca contém chaves. */
export async function getAIStatus(): Promise<PublicStatus> {
  const value = await resolveConfig();
  applyGemini(value);
  const active = toActive(value);
  return {
    configured: active.configured,
    provider: active.provider,
    model: active.model,
    source: active.source,
    gemini: { hasKey: Boolean(value.gemini.key), model: value.gemini.model },
    ollama: {
      mode: isCloudUrl(value.ollama.baseUrl) ? "cloud" : "local",
      baseUrl: value.ollama.baseUrl,
      hasKey: Boolean(value.ollama.key),
      model: value.ollama.model,
      numCtx: value.ollama.numCtx,
    },
  };
}

/** Chave já configurada para este mesmo servidor. Nunca é reutilizada para outro endereço. */
export async function reusableOllamaKey(baseUrl: string): Promise<string | undefined> {
  const value = await resolveConfig();
  return value.ollama.key && sameEndpoint(value.ollama.baseUrl, baseUrl) ? value.ollama.key : undefined;
}

export type SaveInput =
  | { provider: "gemini"; apiKey: string; model: string }
  | { provider: "ollama"; baseUrl: string; apiKey?: string; model: string; numCtx: number };

export async function saveAIConfig(input: SaveInput): Promise<void> {
  await db.transaction(async tx => {
    const upsert = (key: string, value: string) => tx.insert(settings).values({ key, value }).onConflictDoUpdate({
      target: settings.key, set: { value, updatedAt: new Date() },
    });
    if (input.provider === "gemini") {
      await upsert("gemini_api_key", input.apiKey.trim());
      await upsert("gemini_model", input.model);
    } else {
      await upsert("ollama_base_url", input.baseUrl);
      await upsert("ollama_model", input.model);
      await upsert("ollama_num_ctx", String(input.numCtx));
      if (input.apiKey) await upsert("ollama_api_key", input.apiKey);
      else await tx.delete(settings).where(eq(settings.key, "ollama_api_key"));
    }
    await upsert("ai_provider", input.provider);
  });
  shared.__aiCache = undefined;
}

/** Remove tudo o que foi salvo pelo site (as variáveis de ambiente continuam valendo). */
export async function clearSavedAIConfig(): Promise<void> {
  await db.delete(settings).where(inArray(settings.key, SETTING_KEYS));
  shared.__aiCache = undefined;
}
