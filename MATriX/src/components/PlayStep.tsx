"use client";

import { useEffect, useRef, useState } from "react";
import { MASTER_PROFILES } from "@/lib/profiles";
import DiceRoll from "@/components/DiceRoll";
import TerminalIcon from "@/components/TerminalIcon";
import DiceTray, { type TrayResult } from "@/components/DiceTray";
import CharacterSheet, { type SheetState } from "@/components/CharacterSheet";
import { AIKeyButton, type AIStatus } from "@/components/AIKeyModal";
import { APIError, requestJSON, responseJSON } from "@/lib/http";
import { readSSE } from "@/lib/sse";
import type { ChatMessage, CharacterData, GameInfo } from "@/lib/types";
import type { MatrixResolution, MatrixRollRequest } from "@/lib/matrix/types";
import { missingCharacterFields } from "@/lib/matrix/mechanics";

const uid = () => crypto.randomUUID();
const EMPTY: ChatMessage[] = [];
type SendOptions = { text?: string; diceResult?: TrayResult; turnId?: string; retry?: boolean; action?: "approve_character" };
type ChatEvent = { type: string; text?: string; code?: string; notation?: string; total?: number; detail?: string; reason?: string; rolls?: number[]; name?: string; data?: CharacterData; complete?: boolean; query?: string; rollId?: number; resolution?: MatrixResolution; request?: MatrixRollRequest | null };

export default function PlayStep({ game, initialMessages = EMPTY, initialSheet = null, initialRequest = null, aiStatus, connectionVersion = 0, onConnect, onRules, onExit }: {
  game: GameInfo; initialMessages?: ChatMessage[]; initialSheet?: SheetState; initialRequest?: MatrixRollRequest | null;
  aiStatus?: AIStatus | null; connectionVersion?: number; onConnect?: () => void; onRules?: () => void; onExit?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sheet, setSheet] = useState<SheetState>(initialSheet);
  const [error, setError] = useState<APIError | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busyText, setBusyText] = useState("Morpheus está preparando sua resposta...");
  const [profile, setProfile] = useState(game.masterProfile);
  const [request, setRequest] = useState<MatrixRollRequest | null>(initialRequest);
  const [panel, setPanel] = useState<"none" | "sheet" | "dice">("none");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const retryRef = useRef<SendOptions | null>(null);
  const version = useRef(connectionVersion);
  const resumeRef = useRef<() => void>(() => {});
  const needsConnection = (aiStatus?.configured === false && !aiStatus.unreachable) || ["AI_NOT_CONFIGURED", "AI_AUTH", "AI_MODEL", "AI_MODEL_TOOLS", "AI_ENDPOINT"].includes(error?.code || "");
  const ready = Boolean(sheet && !sheet.complete && missingCharacterFields(sheet.name, sheet.data.matrix).length === 0);

  useEffect(() => {
    if (messages.length <= initialMessages.length && !sending) return;
    const handle = requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    return () => cancelAnimationFrame(handle);
  }, [messages, initialMessages.length, sending]);
  useEffect(() => {
    if (aiStatus?.configured && version.current !== connectionVersion) {
      version.current = connectionVersion;
      resumeRef.current();
    }
  }, [aiStatus?.configured, connectionVersion]);

  async function changeProfile(id: string) {
    try { await requestJSON(`/api/games/${game.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ masterProfile: id }), signal: AbortSignal.timeout(10000) }); setProfile(id); }
    catch { setError(new APIError("Não foi possível alterar o estilo. Tente novamente.")); }
  }

  async function send(options: SendOptions, reconnected = false): Promise<boolean> {
    if (lock.current) return false;
    if ((needsConnection && !reconnected) || !aiStatus?.configured) {
      retryRef.current = options; onConnect?.(); return false;
    }
    lock.current = true;
    const opts = { ...options, turnId: options.turnId || uid() };
    retryRef.current = opts;
    setError(null); setSending(true); setBusyText("Morpheus está consultando o código da Matrix...");
    const text = (opts.text || "").trim();
    const dice = opts.diceResult;
    if (!opts.retry) {
      if (dice) setMessages(current => current.some(message => message.id === `roll-${dice.rollId}`) ? current : [...current, { id: `roll-${dice.rollId}`, role: "user", content: "", dice: { ...dice, by: "player", animate: false } }]);
      if (text || opts.action) setMessages(current => [...current, { id: uid(), role: "user", content: opts.action ? "Aprovo minha ficha. Vamos iniciar a aventura." : text }]);
    }
    setInput("");
    const assistantId = uid();
    setMessages(current => [...current, { id: assistantId, role: "assistant", content: "" }]);
    const append = (chunk: string) => setMessages(current => current.map(message => message.id === assistantId ? { ...message, content: message.content + chunk } : message));
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: game.id, message: text, diceResult: dice ? { rollId: dice.rollId } : undefined, turnId: opts.turnId, action: opts.action }), signal: AbortSignal.timeout(aiStatus.provider === "ollama" ? 125000 : 110000) });
      if (!response.ok) await responseJSON(response);
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new APIError("Morpheus não iniciou a resposta. Sua conexão está salva; tente novamente.", "CHAT_RESPONSE_INVALID");
      let complete = false;
      let received = false;
      for await (const payload of readSSE(response.body)) {
        const event = JSON.parse(payload) as ChatEvent;
        if (event.type === "error") throw new APIError(event.text || "Morpheus não respondeu nesta tentativa.", event.code || "AI_ERROR");
        if (event.type === "done") { complete = true; continue; }
        if (event.type === "status" && event.text) { setBusyText(event.text); continue; }
        if (event.type === "text" && event.text) { received = true; append(event.text); }
        else if (event.type === "dice") {
          received = true;
          const card: ChatMessage = { id: uid(), role: "assistant", content: "", dice: { notation: event.notation || "1d6", total: event.total ?? 0, detail: event.detail || "", reason: event.reason || "Rolagem de Morpheus", rolls: event.rolls, by: "gm" } };
          setMessages(current => { const copy = [...current]; const index = copy.findIndex(message => message.id === assistantId); copy.splice(index < 0 ? copy.length : index, 0, card); return copy; });
        } else if (event.type === "roll_resolved" && event.rollId && event.resolution) {
          setMessages(current => current.map(message => message.id === `roll-${event.rollId}` && message.dice ? { ...message, dice: { ...message.dice, resolution: event.resolution } } : message));
        } else if (event.type === "roll_request" && event.notation) {
          received = true; setRequest(event as unknown as MatrixRollRequest);
          if (window.innerWidth < 1280) setPanel("dice");
        } else if (event.type === "pending") setRequest(event.request || null);
        else if (event.type === "consult") setMessages(current => current.map(message => message.id === assistantId ? { ...message, note: `Regras incorporadas: ${event.query || "Matrix"}` } : message));
        else if (event.type === "character" && event.name) { received = true; setSheet({ name: event.name, data: event.data || {}, complete: Boolean(event.complete) }); }
      }
      if (!complete) throw new APIError("A transmissão foi interrompida. Tente novamente; sua ação e os dados não serão aplicados duas vezes.", "CHAT_INTERRUPTED");
      if (!received) throw new APIError("A IA terminou sem responder. Sua ficha continua salva.", "AI_EMPTY");
      retryRef.current = null;
      return true;
    } catch (failure) {
      setError(failure instanceof APIError ? failure : new APIError("A transmissão falhou ou demorou além do limite. Sua ficha e seus resultados estão salvos.", "CHAT_UNAVAILABLE"));
      setMessages(current => current.filter(message => message.id !== assistantId || Boolean(message.content)));
      return false;
    } finally { lock.current = false; setSending(false); }
  }
  resumeRef.current = () => {
    setError(null);
    const pending = retryRef.current;
    if (pending) void send({ ...pending, retry: Boolean(pending.turnId) }, true);
  };
  const approve = () => void send({ action: "approve_character" });

  return <div className="h-dvh flex flex-col overflow-hidden">
    <header className="border-b border-[var(--border)] bg-[var(--bg-soft)]/95 px-3 sm:px-4 py-2.5 flex items-center gap-2">
      <button type="button" onClick={onExit} aria-label="Voltar à entrada sem apagar a mesa" className="terminal-icon-button"><TerminalIcon name="terminal" size={20} /></button>
      <div className="min-w-0 flex-1"><h1 className="font-serif text-[var(--gold)] text-sm sm:text-base truncate">Morpheus<span className="blink text-[var(--muted)]">_</span></h1><p className="text-[10px] text-[var(--muted)] truncate">{game.title} · Matrix RPG</p></div>
      <label className="hidden md:flex items-center gap-2 text-xs text-[var(--muted)]">Tom<select aria-label="Estilo de Morpheus" value={profile} disabled={sending} onChange={event => void changeProfile(event.target.value)} className="border border-[var(--border)] bg-[var(--panel)] p-1.5 text-[var(--text)]">{MASTER_PROFILES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" onClick={onRules} aria-label="Consultar regras de Matrix" className="terminal-icon-button border border-[var(--border)]"><TerminalIcon name="book" size={18} /></button>
      <AIKeyButton status={aiStatus || null} onClick={() => onConnect?.()} />
      <button type="button" onClick={() => setPanel(panel === "sheet" ? "none" : "sheet")} aria-label="Abrir ficha" className="lg:hidden terminal-icon-button"><TerminalIcon name="user" size={18} /></button>
      <button type="button" onClick={() => setPanel(panel === "dice" ? "none" : "dice")} aria-label="Abrir dados" className="xl:hidden terminal-icon-button"><TerminalIcon name="dice" size={18} /></button>
    </header>
    <div className="flex-1 flex min-h-0">
      <aside className={`${panel === "sheet" ? "fixed inset-y-0 left-0 z-40" : "hidden"} lg:static lg:block w-72 max-w-[90vw] shrink-0 border-r border-[var(--border)] bg-[var(--bg-soft)]`}>
        {panel === "sheet" && <button type="button" aria-label="Fechar ficha" onClick={() => setPanel("none")} className="lg:hidden absolute right-1 top-1 terminal-icon-button"><TerminalIcon name="close" size={16} /></button>}
        <CharacterSheet sheet={sheet} onApprove={approve} disabled={sending} />
      </aside>
      <main className="flex-1 min-w-0 flex flex-col bg-black/35">
        <div className="matrix-terminal-bar text-[9px]"><span>morpheus.exe // transmissão segura</span><span>regras locais · sem PDF</span></div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto parchment-scroll p-4 sm:p-5"><div className="max-w-2xl mx-auto space-y-5">
          {needsConnection && <section aria-label="Conexão da IA" className="border border-[var(--border)] bg-[var(--bg-soft)] p-4 text-sm"><p className="text-[var(--gold-soft)]">{error?.message || "As regras de Matrix e a apresentação de Morpheus já estão disponíveis. Conecte uma IA para responder e criar seu personagem."}</p><button type="button" onClick={onConnect} className="border border-[var(--gold)] p-2 mt-3 text-xs text-[var(--gold)]">Conectar IA e continuar</button></section>}
          {messages.map(message => <MessageBubble key={message.id} message={message} />)}
          {ready && !sending && <div className="border border-[var(--gold)]/40 p-3 text-xs"><p className="text-[var(--muted)]">Sua ficha tem as escolhas essenciais. Revise o painel de identidade antes de começar.</p><button type="button" onClick={approve} className="border border-[var(--gold)] text-[var(--gold)] p-2 mt-2">Aprovar ficha e iniciar aventura</button></div>}
          {sending && <p role="status" className="text-xs text-[var(--muted)]">{`// ${busyText}`} <span className="typing-dot">▓</span></p>}
          {error && !needsConnection && <section role="alert" className="border border-red-500/40 bg-[var(--bg-soft)] p-4 text-sm"><p className="text-red-300">{error.message}</p><div className="flex flex-wrap gap-3 mt-3"><button type="button" disabled={sending} onClick={() => void send({ ...(retryRef.current || {}), retry: true })} className="border border-[var(--gold)] px-3 py-2 text-[var(--gold)]">Tentar novamente</button><button type="button" onClick={onConnect} className="underline text-xs text-[var(--muted)]">Revisar conexão</button></div></section>}
        </div></div>
        <form onSubmit={event => { event.preventDefault(); if (input.trim() && !sending) void send({ text: input }); }} className="border-t border-[var(--border)] bg-[var(--bg-soft)] p-3 sm:p-4"><div className="max-w-2xl mx-auto flex items-end gap-2"><span className="py-2 text-[var(--gold)]">{">"}</span><textarea aria-label="Mensagem para Morpheus" value={input} onChange={event => setInput(event.target.value)} disabled={sending} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (input.trim() && !sending) void send({ text: input }); } }} placeholder={request ? "Role na bandeja ou converse com Morpheus..." : "Responda a Morpheus. Quem é você?"} rows={2} className="flex-1 min-w-0 bg-black/40 border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--gold)] resize-none disabled:opacity-50" /><button type="submit" disabled={sending || !input.trim()} className="border border-[var(--gold)] px-3 py-3 text-xs uppercase text-[var(--gold)] disabled:opacity-50">Enviar</button></div><p className="text-center text-[9px] text-[var(--muted)] mt-2">Matrix · Dan Aguiar / Artefato · Morpheus é seu narrador, você decide o caminho.</p></form>
      </main>
      <aside className={`${panel === "dice" ? "fixed inset-y-0 right-0 z-40" : "hidden"} xl:static xl:block w-80 max-w-[90vw] shrink-0 border-l border-[var(--border)] bg-[var(--bg-soft)]`}>
        {panel === "dice" && <button type="button" aria-label="Fechar dados" onClick={() => setPanel("none")} className="xl:hidden absolute right-1 top-1 terminal-icon-button"><TerminalIcon name="close" size={16} /></button>}
        <DiceTray gameId={game.id} request={request} character={sheet?.data.matrix} disabled={sending} onSend={result => send({ diceResult: result })} />
      </aside>
      {panel !== "none" && <div onClick={() => setPanel("none")} className={`fixed inset-0 z-30 bg-black/65 ${panel === "sheet" ? "lg:hidden" : "xl:hidden"}`} />}
    </div>
  </div>;
}
function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.dice) return <DiceRoll dice={message.dice} />;
  if (!message.content && !message.note) return null;
  const user = message.role === "user";
  return <div className={`flex fade-up ${user ? "justify-end" : "justify-start"}`}><article className={`max-w-full sm:max-w-[95%] break-words border p-4 ${user ? "bg-[var(--purple)]/8 border-[var(--purple)]/40" : "bg-[var(--panel)]/60 border-[var(--border)]"}`}><header className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--gold)] mb-3"><TerminalIcon name={user ? "terminal" : "chip"} size={14} />{user ? "operador_local" : "Morpheus"}</header>{message.note && <p className="text-[10px] text-[var(--muted)] mb-2">{message.note}</p>}<div className="whitespace-pre-wrap text-sm leading-7">{message.content.replace(/\*\*(.+?)\*\*/g, "$1")}</div></article></div>;
}
