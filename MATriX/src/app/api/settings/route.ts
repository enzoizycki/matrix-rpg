import { clearSavedAIConfig, getAIStatus, reusableOllamaKey, saveAIConfig } from "@/lib/ai-config";
import { AIError, toAIError } from "@/lib/ai-errors";
import { DEFAULT_CLOUD_NUM_CTX, DEFAULT_GEMINI_MODEL, DEFAULT_LOCAL_NUM_CTX, OLLAMA_CLOUD_URL, OLLAMA_LOCAL_URL } from "@/lib/ai-constants";
import { isPrivateHost, normalizeBaseUrl, validateOllama } from "@/lib/ollama";
import { PLACEHOLDER_MESSAGE, parseApiKey } from "@/lib/api-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
const OLLAMA_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,150}$/;

function failure(error: unknown) {
  const e = toAIError(error);
  const status = e.code === "AI_TIMEOUT" ? 504 : e.status >= 500 ? 503 : 400;
  return Response.json({ error: e.message, code: e.code }, { status });
}

export async function GET() {
  try { return Response.json(await getAIStatus(), { headers: noStore }); }
  catch { return Response.json({ error: "Não foi possível carregar a configuração da IA. Tente novamente.", code: "SETTINGS_UNAVAILABLE" }, { status: 503 }); }
}

async function saveGemini(body: Record<string, unknown>, signal: AbortSignal) {
  const parsed = parseApiKey(typeof body.apiKey === "string" ? body.apiKey : "");
  if (parsed.problem) return Response.json({ error: PLACEHOLDER_MESSAGE.gemini, code: "KEY_PLACEHOLDER" }, { status: 400 });
  const apiKey = parsed.key;
  const model = typeof body.model === "string" ? body.model.trim() : DEFAULT_GEMINI_MODEL;
  if (apiKey.length < 10 || apiKey.length > 512) return Response.json({ error: "Informe uma chave de API válida." }, { status: 400 });
  if (!/^gemini-[a-z0-9.-]{1,90}$/.test(model)) return Response.json({ error: "Selecione um modelo Gemini válido." }, { status: 400 });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Responda apenas OK." }] }] }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), cache: "no-store",
  });
  await response.body?.cancel();
  if (!response.ok) {
    const error = [400, 401, 403].includes(response.status) ? "Chave inválida, expirada ou sem permissão para este modelo."
      : response.status === 404 ? "Este modelo não está disponível. Escolha outro."
      : response.status === 429 ? "A cota dessa chave foi atingida. Verifique os limites no Google AI Studio."
      : "O Gemini está indisponível agora. Aguarde e tente conectar novamente.";
    return Response.json({ error, code: "AI_CONNECTION_FAILED" }, { status: response.status >= 500 ? 503 : 400 });
  }
  await saveAIConfig({ provider: "gemini", apiKey, model });
  return Response.json(await getAIStatus(), { headers: noStore });
}

async function saveOllama(body: Record<string, unknown>, signal: AbortSignal) {
  const cloud = body.mode !== "local";
  const baseUrl = cloud ? OLLAMA_CLOUD_URL : normalizeBaseUrl(typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl : OLLAMA_LOCAL_URL);
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!OLLAMA_MODEL_PATTERN.test(model)) {
    return Response.json({ error: "Informe o nome do modelo do Ollama (ex.: gpt-oss:120b).", code: "INVALID_MODEL" }, { status: 400 });
  }
  const requestedCtx = Number(body.numCtx);
  const numCtx = Number.isFinite(requestedCtx)
    ? Math.min(131072, Math.max(2048, Math.round(requestedCtx)))
    : (cloud ? DEFAULT_CLOUD_NUM_CTX : DEFAULT_LOCAL_NUM_CTX);

  // A chave salva só é reutilizada para o MESMO servidor; nunca segue para outro endereço.
  // Aceita a chave pura ou colada com o "export OLLAMA_API_KEY=..." da documentação.
  const parsed = parseApiKey(typeof body.apiKey === "string" ? body.apiKey : "");
  if (parsed.problem) return Response.json({ error: PLACEHOLDER_MESSAGE.ollama, code: "KEY_PLACEHOLDER" }, { status: 400 });
  const apiKey = parsed.key || await reusableOllamaKey(baseUrl);
  if (apiKey && apiKey.length > 512) return Response.json({ error: "A chave de API é longa demais.", code: "INVALID_KEY" }, { status: 400 });
  if (cloud && !apiKey) {
    return Response.json({ error: "Cole a chave de API do Ollama. Crie uma em ollama.com/settings/keys.", code: "KEY_REQUIRED" }, { status: 400 });
  }
  if (apiKey && baseUrl.startsWith("http://") && !isPrivateHost(new URL(baseUrl).hostname)) {
    return Response.json({ error: "Para enviar a chave de API a um servidor remoto, use um endereço https://.", code: "INSECURE_URL" }, { status: 400 });
  }

  await validateOllama({ baseUrl, apiKey, model, numCtx }, signal);
  await saveAIConfig({ provider: "ollama", baseUrl, apiKey, model, numCtx });
  return Response.json(await getAIStatus(), { headers: noStore });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return Response.json({ error: "Requisição inválida." }, { status: 400 });
    // Sem "provider" = Gemini (formato usado antes do Ollama existir).
    if (body.provider === "ollama") return await saveOllama(body, req.signal);
    if (body.provider !== undefined && body.provider !== "gemini") return Response.json({ error: "Provedor de IA desconhecido." }, { status: 400 });
    return await saveGemini(body, req.signal);
  } catch (error) {
    if (error instanceof AIError) return failure(error);
    const timedOut = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    return Response.json({ error: timedOut ? "A validação demorou além do limite. Tente novamente; sua ficha continua salva." : "Não foi possível validar e salvar a conexão. Tente novamente." }, { status: timedOut ? 504 : 503 });
  }
}

// Remove a conexão salva pelo site (útil em computador compartilhado).
export async function DELETE() {
  try {
    await clearSavedAIConfig();
    return Response.json(await getAIStatus(), { headers: noStore });
  } catch { return Response.json({ error: "Não foi possível remover a conexão salva. Tente novamente." }, { status: 503 }); }
}

