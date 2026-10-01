"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { createPortal } from "react-dom";
import { requestJSON } from "@/lib/http";
import { PLACEHOLDER_MESSAGE, parseApiKey } from "@/lib/api-key";
import TerminalIcon from "@/components/TerminalIcon";
import GeminiKeyLink from "@/components/GeminiKeyLink";
import OllamaKeyLink from "@/components/OllamaKeyLink";
import {
  DEFAULT_CLOUD_MODEL, DEFAULT_CLOUD_NUM_CTX, DEFAULT_GEMINI_MODEL, DEFAULT_LOCAL_NUM_CTX,
  NUM_CTX_OPTIONS, OLLAMA_LOCAL_URL,
} from "@/lib/ai-constants";

export type AIProvider = "gemini" | "ollama";
export type AIStatus = {
  configured: boolean;
  provider?: AIProvider;
  model: string;
  source?: "saved" | "env" | "none";
  gemini?: { hasKey: boolean; model: string };
  ollama?: { mode: "cloud" | "local"; baseUrl: string; hasKey: boolean; model: string; numCtx: number };
  // A verificação falhou (rede/servidor reiniciando). Não significa "sem chave".
  unreachable?: boolean;
  error?: string;
};

const RETRY_MS = 5000;
const PROVIDER_LABEL: Record<AIProvider, string> = { gemini: "Gemini", ollama: "Ollama" };

export function useAIStatus() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await requestJSON<AIStatus>("/api/settings", { signal: AbortSignal.timeout(10_000) });
      setStatus(next);
      return next;
    } catch {
      // Uma falha passageira nunca rebaixa uma conexão conhecida para "desconectada".
      setStatus(previous => previous
        ? { ...previous, unreachable: true }
        : { configured: false, model: DEFAULT_GEMINI_MODEL, unreachable: true });
      return null;
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Enquanto o estado for desconhecido, tenta de novo sozinho até o servidor responder.
  const needsRetry = status === null || Boolean(status.unreachable);
  useEffect(() => {
    if (!needsRetry) return;
    const timer = setInterval(() => void refresh(), RETRY_MS);
    return () => clearInterval(timer);
  }, [needsRetry, refresh]);

  return { status, refresh, setStatus };
}

export function AIKeyButton({ status, onClick }: { status: AIStatus | null; onClick: () => void }) {
  const state = status === null ? "checking"
    : status.configured ? "online"
    : status.unreachable ? "checking"
    : "offline";
  const provider = status?.provider ? PROVIDER_LABEL[status.provider] : "";
  return <button type="button" onClick={onClick} className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs uppercase tracking-wider transition ${state === "online" ? "border-[var(--gold)]/50 text-[var(--gold)] bg-[var(--gold)]/10" : state === "checking" ? "border-[var(--border)] text-[var(--muted)]" : "border-amber-500/50 text-amber-300 bg-amber-500/10"}`} title="Configurar conexão de Morpheus">
    <TerminalIcon name={state === "checking" ? "chip" : state === "online" ? "connect" : "disconnected"} size={15} />
    {state === "checking" ? "verificando conexão" : state === "online" ? <>operador online{provider && <span className="normal-case opacity-80"> ({provider})</span>}</> : "conectar IA"}
  </button>;
}

const fieldClass = "w-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)] disabled:opacity-60";

export default function AIKeyModal({ open, onClose, onSaved, status }: {
  open: boolean; onClose: () => void; onSaved: (status: AIStatus) => void; status?: AIStatus | null;
}) {
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL);
  const [mode, setMode] = useState<"cloud" | "local">("cloud");
  const [baseUrl, setBaseUrl] = useState(OLLAMA_LOCAL_URL);
  const [ollamaKey, setOllamaKey] = useState("");
  const [ollamaModel, setOllamaModel] = useState(DEFAULT_CLOUD_MODEL);
  const [numCtx, setNumCtx] = useState(DEFAULT_CLOUD_NUM_CTX);
  const [models, setModels] = useState<string[]>([]);
  const [modelsNote, setModelsNote] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modelsAbort = useRef<AbortController | null>(null);
  // Os campos só são preenchidos ao abrir; atualizações periódicas do status não podem apagar o que foi digitado.
  const statusRef = useRef(status);
  statusRef.current = status;
  const saved = status?.ollama;
  const hasSavedKey = Boolean(saved?.hasKey && saved.mode === mode);

  useEffect(() => {
    if (!open) return;
    const current = statusRef.current;
    const ollama = current?.ollama;
    const cloud = (ollama?.mode ?? "cloud") === "cloud";
    setProvider(current?.provider === "ollama" ? "ollama" : "gemini");
    setGeminiKey(""); setError(""); setModels([]); setModelsNote("");
    setGeminiModel(current?.gemini?.model ?? (current?.provider === "ollama" ? undefined : current?.model) ?? DEFAULT_GEMINI_MODEL);
    setMode(cloud ? "cloud" : "local");
    setBaseUrl(ollama && ollama.mode === "local" ? ollama.baseUrl : OLLAMA_LOCAL_URL);
    setOllamaKey("");
    setOllamaModel(ollama?.model || (cloud ? DEFAULT_CLOUD_MODEL : ""));
    setNumCtx(ollama?.numCtx ?? (cloud ? DEFAULT_CLOUD_NUM_CTX : DEFAULT_LOCAL_NUM_CTX));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy.current) onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus(); };
  }, [open, onClose]);

  const loadModels = useCallback(async (silent: boolean) => {
    modelsAbort.current?.abort();
    const controller = new AbortController();
    modelsAbort.current = controller;
    setLoadingModels(true);
    setModelsNote("");
    try {
      const data = await requestJSON<{ models: string[] }>("/api/settings/ollama-models", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, baseUrl: mode === "local" ? baseUrl.trim() : undefined, apiKey: parseApiKey(ollamaKey).key || undefined }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      setModels(data.models);
      setModelsNote(data.models.length ? `${data.models.length} modelos disponíveis. Escolha um da lista ou digite o nome.` : "Nenhum modelo encontrado. Digite o nome do modelo.");
    } catch (failure) {
      if (controller.signal.aborted) return;
      setModels([]);
      if (silent) setModelsNote("Não foi possível carregar a lista. Digite o nome do modelo.");
      else setError(failure instanceof Error ? failure.message : "Não foi possível listar os modelos.");
    } finally { if (modelsAbort.current === controller) setLoadingModels(false); }
  }, [mode, baseUrl, ollamaKey]);

  // A lista pública da nuvem é carregada sozinha ao abrir a aba do Ollama.
  useEffect(() => {
    if (open && provider === "ollama" && mode === "cloud") void loadModels(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider, mode]);
  useEffect(() => () => modelsAbort.current?.abort(), []);

  // Colar "export OLLAMA_API_KEY="..."" (ou a chave com aspas/espaços) deixa só a chave no campo.
  function pasteKey(event: ClipboardEvent<HTMLInputElement>, set: (value: string) => void, which: AIProvider) {
    const text = event.clipboardData.getData("text");
    const parsed = parseApiKey(text);
    if (parsed.problem) { event.preventDefault(); setError(PLACEHOLDER_MESSAGE[which]); return; }
    if (parsed.key && parsed.key !== text) { event.preventDefault(); set(parsed.key); setError(""); }
  }

  function chooseMode(next: "cloud" | "local") {
    if (next === mode || saving) return;
    setMode(next); setModels([]); setModelsNote(""); setError("");
    setOllamaModel(model => next === "cloud" ? (model || DEFAULT_CLOUD_MODEL) : (model === DEFAULT_CLOUD_MODEL ? "" : model));
    setNumCtx(value => next === "cloud" ? (value === DEFAULT_LOCAL_NUM_CTX ? DEFAULT_CLOUD_NUM_CTX : value) : (value === DEFAULT_CLOUD_NUM_CTX ? DEFAULT_LOCAL_NUM_CTX : value));
  }

  async function save() {
    if (busy.current) return;
    let request: { body: Record<string, unknown>; timeoutMs: number };
    if (provider === "gemini") {
      const typed = parseApiKey(geminiKey);
      if (typed.problem) { setError(PLACEHOLDER_MESSAGE.gemini); return; }
      if (!typed.key) { setError("Cole sua chave da API do Google Gemini."); return; }
      request = { body: { provider: "gemini", apiKey: typed.key, model: geminiModel }, timeoutMs: 25_000 };
    } else {
      if (!ollamaModel.trim()) { setError("Informe o modelo do Ollama (ex.: gpt-oss:120b)."); return; }
      const typedKey = parseApiKey(ollamaKey);
      if (typedKey.problem) { setError(PLACEHOLDER_MESSAGE.ollama); return; }
      if (mode === "cloud" && !typedKey.key && !hasSavedKey) { setError("Cole a chave de API do Ollama (crie uma no link abaixo)."); return; }
      if (mode === "local" && !baseUrl.trim()) { setError("Informe o endereço do servidor Ollama."); return; }
      request = {
        body: { provider: "ollama", mode, baseUrl: mode === "local" ? baseUrl.trim() : undefined, apiKey: typedKey.key || undefined, model: ollamaModel.trim(), numCtx },
        timeoutMs: 60_000,
      };
    }
    busy.current = true; setSaving(true); setError("");
    try {
      const next = await requestJSON<AIStatus>("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body), signal: AbortSignal.timeout(request.timeoutMs),
      });
      if (!next.configured) throw new Error("A conexão não foi confirmada. Tente novamente.");
      setGeminiKey(""); setOllamaKey("");
      onSaved(next);
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível conectar a IA."); }
    finally { busy.current = false; setSaving(false); }
  }

  async function removeSaved() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const next = await requestJSON<AIStatus>("/api/settings", { method: "DELETE", signal: AbortSignal.timeout(15_000) });
      onSaved(next);
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível remover a conexão."); }
    finally { busy.current = false; setSaving(false); }
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={() => { if (!saving) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="connection-title" aria-busy={saving} className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto parchment-scroll term-panel p-6 fade-up" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="flex items-center justify-between mb-2"><h2 id="connection-title" className="flex items-center gap-2 font-serif text-lg text-[var(--gold)]"><TerminalIcon name="chip" size={21} />// conectar Morpheus</h2><button type="button" aria-label="Fechar conexão" disabled={saving} onClick={onClose} className="terminal-icon-button"><TerminalIcon name="close" size={17} /></button></div>
      <p className="text-sm text-[var(--muted)] mb-4">Escolha a IA que dará voz a Morpheus no chat. As regras de Matrix já estão incorporadas; sua ficha e sua conexão são preservadas ao trocar de provedor.</p>

      <div role="tablist" aria-label="Provedor de IA" className="grid grid-cols-2 gap-2 mb-4">
        {(["gemini", "ollama"] as const).map(item => <button key={item} type="button" role="tab" id={`tab-${item}`} aria-selected={provider === item} aria-controls={`panel-${item}`} disabled={saving} onClick={() => { setProvider(item); setError(""); }} className={`inline-flex items-center justify-center gap-2 border px-3 py-2 text-sm transition disabled:opacity-60 ${provider === item ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)]/60"}`}>
          <TerminalIcon name={item === "gemini" ? "chip" : "server"} size={16} />{item === "gemini" ? "Google Gemini" : "Ollama"}
        </button>)}
      </div>

      {provider === "gemini" ? <div role="tabpanel" id="panel-gemini" aria-labelledby="tab-gemini">
        <label htmlFor="gemini-api-key" className="block text-xs text-[var(--gold-soft)] mb-1">Chave da API Gemini</label>
        <input id="gemini-api-key" ref={inputRef} type="password" autoComplete="off" value={geminiKey} disabled={saving} onChange={event => setGeminiKey(event.target.value)} onPaste={event => pasteKey(event, setGeminiKey, "gemini")} placeholder="Cole sua chave Gemini" className={`${fieldClass} mb-3`} />
        <label htmlFor="gemini-model" className="block text-xs text-[var(--gold-soft)] mb-1">Modelo</label>
        <select id="gemini-model" value={geminiModel} disabled={saving} onChange={event => setGeminiModel(event.target.value)} className={`${fieldClass} mb-3`}>
          <option value="gemini-flash-lite-latest">gemini-flash-lite-latest (rápido)</option><option value="gemini-flash-latest">gemini-flash-latest (equilibrado)</option>
          {!["gemini-flash-lite-latest", "gemini-flash-latest"].includes(geminiModel) && <option value={geminiModel}>{geminiModel}</option>}
        </select>
        {error && <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 mb-3">{error}</p>}
        <GeminiKeyLink />
      </div> : <div role="tabpanel" id="panel-ollama" aria-labelledby="tab-ollama">
        <fieldset disabled={saving} className="mb-3">
          <legend className="text-xs text-[var(--gold-soft)] mb-1.5">Onde o Ollama está rodando?</legend>
          <div className="grid gap-2">
            {([["cloud", "Ollama Cloud (chave de API)", "cloud"], ["local", "No meu computador ou servidor", "server"]] as const).map(([value, label, icon]) => <label key={value} className={`flex items-center gap-2 border px-3 py-2 text-sm cursor-pointer ${mode === value ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-[var(--border)]"}`}>
              <input type="radio" name="ollama-mode" value={value} checked={mode === value} onChange={() => chooseMode(value)} className="accent-[var(--gold)]" />
              <TerminalIcon name={icon} size={16} />{label}
            </label>)}
          </div>
        </fieldset>

        {mode === "local" && <div className="mb-3">
          <label htmlFor="ollama-url" className="block text-xs text-[var(--gold-soft)] mb-1">Endereço do servidor Ollama</label>
          <input id="ollama-url" value={baseUrl} disabled={saving} onChange={event => { setBaseUrl(event.target.value); setModels([]); }} placeholder={OLLAMA_LOCAL_URL} inputMode="url" autoComplete="off" className={fieldClass} />
          <p className="mt-1 text-[11px] text-[var(--muted)]">Se este sistema roda no Docker, use <code>http://host.docker.internal:11434</code>.</p>
        </div>}

        <label htmlFor="ollama-api-key" className="block text-xs text-[var(--gold-soft)] mb-1">{mode === "cloud" ? "Chave de API do Ollama" : "Chave de API (opcional)"}</label>
        <input id="ollama-api-key" ref={inputRef} type="password" autoComplete="off" value={ollamaKey} disabled={saving} onChange={event => setOllamaKey(event.target.value)} onPaste={event => pasteKey(event, setOllamaKey, "ollama")} placeholder={hasSavedKey ? "Chave salva. Deixe em branco para mantê-la." : mode === "cloud" ? "Cole sua chave do Ollama" : "Só se o servidor exigir"} className={`${fieldClass} mb-3`} />

        <label htmlFor="ollama-model" className="block text-xs text-[var(--gold-soft)] mb-1">Modelo</label>
        <div className="flex gap-2">
          <input id="ollama-model" list="ollama-model-list" value={ollamaModel} disabled={saving} onChange={event => setOllamaModel(event.target.value)} placeholder={mode === "cloud" ? DEFAULT_CLOUD_MODEL : "ex.: llama3.1"} autoComplete="off" spellCheck={false} className={fieldClass} />
          <button type="button" disabled={saving || loadingModels} onClick={() => void loadModels(false)} className="shrink-0 border border-[var(--border)] px-3 text-xs text-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-50">{loadingModels ? "buscando..." : "Buscar modelos"}</button>
        </div>
        <datalist id="ollama-model-list">{models.map(name => <option key={name} value={name} />)}</datalist>
        <p role="status" aria-live="polite" className="mt-1 min-h-4 text-[11px] text-[var(--muted)]">{modelsNote}</p>
        <p className="text-[11px] text-[var(--muted)] mb-3">O modelo precisa suportar <b>ferramentas</b> (tool calling); isso é verificado ao conectar.</p>

        <label htmlFor="ollama-ctx" className="block text-xs text-[var(--gold-soft)] mb-1">Janela de contexto (memória da conversa)</label>
        <select id="ollama-ctx" value={numCtx} disabled={saving} onChange={event => setNumCtx(Number(event.target.value))} className={`${fieldClass} mb-1`}>
          {[...new Set([...NUM_CTX_OPTIONS, numCtx])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value.toLocaleString("pt-BR")} tokens</option>)}
        </select>
        <p className="text-[11px] text-[var(--muted)] mb-3">Maior = lembra mais do livro, mas usa mais memória no servidor local. Em modelos locais pequenos, prefira 16.384.</p>

        {error && <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 mb-3">{error}</p>}
        {mode === "cloud" && <OllamaKeyLink />}
      </div>}

      <p className="mt-3 text-xs text-[var(--muted)]">As chaves são usadas somente pelo servidor e não são devolvidas ao navegador. Ficam salvas no banco de dados desta instalação, então não precisam ser informadas de novo. Para deixá-las fixas, também é possível defini-las no arquivo .env.</p>
      <button type="submit" disabled={saving} className="mt-4 w-full border border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)] uppercase tracking-widest py-3 disabled:opacity-50"><TerminalIcon name="connect" size={16} className="mr-2" />{saving ? "> validando conexão..." : "> validar e conectar"}</button>
      {status?.source === "saved" && <button type="button" disabled={saving} onClick={() => void removeSaved()} className="mt-3 w-full text-xs underline text-[var(--muted)] hover:text-[var(--gold)] disabled:opacity-50">Remover conexão salva</button>}
    </form>
  </div>, document.body);
}
