import { reusableOllamaKey } from "@/lib/ai-config";
import { AIError, toAIError } from "@/lib/ai-errors";
import { OLLAMA_CLOUD_URL, OLLAMA_LOCAL_URL } from "@/lib/ai-constants";
import { isCloudUrl, listOllamaModels, normalizeBaseUrl } from "@/lib/ollama";
import { parseApiKey } from "@/lib/api-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Lista os modelos disponíveis: os instalados no servidor local ou a lista pública da nuvem.
// Devolve apenas nomes; a chave nunca volta ao navegador.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const cloud = body?.mode !== "local";
    const baseUrl = cloud ? OLLAMA_CLOUD_URL : normalizeBaseUrl(typeof body?.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl : OLLAMA_LOCAL_URL);
    const typed = parseApiKey(typeof body?.apiKey === "string" ? body.apiKey : "").key;
    // Só reutiliza a chave salva para o mesmo servidor.
    const apiKey = typed || await reusableOllamaKey(baseUrl);
    const models = await listOllamaModels({ baseUrl, apiKey }, req.signal);
    return Response.json({ models, cloud: isCloudUrl(baseUrl) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = error instanceof AIError ? error : toAIError(error);
    const status = failure.code === "AI_TIMEOUT" ? 504 : failure.status >= 500 ? 503 : 400;
    return Response.json({ error: failure.message, code: failure.code }, { status });
  }
}
