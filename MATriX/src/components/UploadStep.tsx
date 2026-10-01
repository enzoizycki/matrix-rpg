"use client";

import { useEffect, useRef, useState } from "react";
import { MASTER_PROFILES } from "@/lib/profiles";
import { APIError, requestJSON, uploadForm } from "@/lib/http";
import TerminalIcon from "@/components/TerminalIcon";
import type { GameInfo, RulebookStatus } from "@/lib/types";

const MAX_BYTES = 50 * 1024 * 1024;

// Frases do filme (em português) exibidas na abertura; uma é sorteada a cada visita.
const QUOTES = [
  { text: "Bem-vindo ao deserto do real.", author: "Morpheus" },
  { text: "Não existe colher.", author: "O garoto da colher" },
  { text: "Siga o coelho branco.", author: "Matrix (1999)" },
  { text: "Liberte sua mente.", author: "Morpheus" },
  { text: "Só posso lhe mostrar a porta. Você é quem deve atravessá-la.", author: "Morpheus" },
  { text: "Ninguém pode ser informado do que é a Matrix. Você precisa ver por si mesmo.", author: "Morpheus" },
];

export default function UploadStep({ onCreated, aiConfigured, onConnect, rulebook, onRulebookChanged }: {
  onCreated: (game: GameInfo) => void;
  aiConfigured?: boolean;
  onConnect?: () => void;
  rulebook?: RulebookStatus | null;
  onRulebookChanged?: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [profile, setProfile] = useState("balanced");
  const [phase, setPhase] = useState<"idle" | "uploading" | "reading">("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [usingFixed, setUsingFixed] = useState(false);
  const [quote, setQuote] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = phase !== "idle";
  const fixedReady = rulebook?.state === "ready";

  useEffect(() => { setQuote(Math.floor(Math.random() * QUOTES.length)); }, []);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }, [error]);

  function addFiles(list: FileList | null) {
    if (!list || controller.current) return;
    const picked = Array.from(list);
    const invalid = picked.find(file => !file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf");
    if (invalid) { setError(`“${invalid.name}” não é PDF. Selecione um livro no formato PDF.`); return; }
    const merged = [...files];
    for (const file of picked) {
      if (!merged.some(other => other.name === file.name && other.size === file.size)) merged.push(file);
    }
    if (merged.length > 8) { setError("Selecione até 8 PDFs por campanha."); return; }
    if (merged.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) { setError("Os arquivos somam mais de 50 MB. Reduza o tamanho do envio."); return; }
    setFiles(merged);
    setError("");
    setNotice("");
  }

  async function submit() {
    if (controller.current) return;
    // Sem PDF escolhido, a campanha usa o livro fixo do sistema.
    const useFixed = files.length === 0 && rulebook?.state === "ready";
    if (!files.length && !useFixed) {
      setError(rulebook?.state === "indexing"
        ? "O livro fixo ainda está sendo indexado. Aguarde a conclusão ou envie outro PDF."
        : "Selecione ao menos um PDF com as regras antes de entrar na simulação.");
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setError(""); setNotice(""); setPercent(0); setUsingFixed(useFixed); setPhase("uploading");
    try {
      const form = new FormData();
      if (title.trim()) form.append("title", title.trim());
      form.append("masterProfile", profile);
      if (useFixed) form.append("useDefaultRulebook", "1");
      else {
        files.forEach(file => form.append("files", file));
        if (saveAsDefault && rulebook?.source !== "folder") form.append("saveAsDefault", "1");
      }
      const game = await uploadForm<GameInfo>("/api/games", form, abort.signal, progress => {
        setPercent(progress);
        if (progress === 100) setPhase("reading");
      });
      if (!Number.isSafeInteger(game.id) || game.id < 1 || !Array.isArray(game.files) || !(game.rulesChars > 0)) {
        throw new Error("O servidor não confirmou a leitura do PDF. Tente novamente.");
      }
      if (!useFixed && saveAsDefault) onRulebookChanged?.();
      onCreated(game);
    } catch (failure) {
      if (failure instanceof APIError && failure.code === "CANCELLED") setNotice(failure.message);
      else setError(failure instanceof Error ? failure.message : "Não foi possível enviar o livro. Tente novamente.");
    } finally { controller.current = null; setPhase("idle"); }
  }

  async function removeFixed() {
    try {
      await requestJSON("/api/rulebook", { method: "DELETE", signal: AbortSignal.timeout(15_000) });
      setConfirmRemove(false);
      setNotice("Livro fixo removido. Você pode enviar outro PDF.");
      onRulebookChanged?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível remover o livro fixo.");
    }
  }

  const picker = <>
    <label htmlFor="rulebook-files" className="block text-sm text-[var(--gold-soft)] mb-2">{"> Código-fonte das regras (PDF)"}</label>
    <div onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }} className={`border border-dashed ${dragging ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-[var(--border)] bg-[var(--bg-soft)]/50"}`}>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="w-full p-6 text-center cursor-pointer hover:bg-[var(--gold)]/5 focus-visible:outline focus-visible:outline-[var(--gold)] disabled:opacity-50">
        <span className="mx-auto mb-3 grid place-items-center w-12 h-12 border border-[var(--border)] bg-[var(--gold)]/5"><TerminalIcon name="upload" size={25} /></span>
        <span className="block">Arraste os PDFs aqui ou clique para carregar</span>
        <span className="block mt-2 text-xs text-[var(--muted)]">Até 8 arquivos · 50 MB no total · texto selecionável</span>
      </button>
      <input id="rulebook-files" aria-label="Selecionar PDFs das regras" ref={inputRef} type="file" accept="application/pdf,.pdf" multiple disabled={busy} className="hidden" onChange={event => { addFiles(event.target.files); event.target.value = ""; }} />
    </div>
    {files.length > 0 && <ul className="mt-3 space-y-2" aria-label="Arquivos selecionados">
      {files.map((file, index) => <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm">
        <TerminalIcon name="file" size={20} /><span className="text-[10px] text-[var(--muted)]">PDF</span><span className="truncate flex-1">{file.name}</span>
        <span className="shrink-0 text-xs text-[var(--muted)]">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
        <button type="button" disabled={busy} onClick={() => { setFiles(current => current.filter((_, i) => i !== index)); setError(""); }} aria-label={`Remover ${file.name}`} className="terminal-icon-button"><TerminalIcon name="close" size={16} /></button>
      </li>)}
    </ul>}
    <p className="text-xs text-[var(--muted)] mt-2">PDFs escaneados precisam de OCR. Arquivos sem texto serão identificados com uma mensagem, sem abrir uma mesa vazia.</p>
    {rulebook?.source !== "folder" && files.length > 0 && <label className="mt-3 flex items-start gap-2 text-xs text-[var(--gold-soft)] cursor-pointer">
      <input type="checkbox" checked={saveAsDefault} disabled={busy} onChange={event => setSaveAsDefault(event.target.checked)} className="mt-0.5 accent-[var(--gold)]" />
      <span>Salvar como livro fixo do sistema (não precisarei enviar este PDF de novo)</span>
    </label>}
    {rulebook?.state === "none" && files.length === 0 && <p className="mt-2 text-xs text-[var(--muted)]">Dica: para não enviar o PDF toda vez, marque “Salvar como livro fixo” ao escolher o arquivo, ou coloque-o na pasta <code>rulebooks/</code> do projeto.</p>}
  </>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 fade-up">
      <div className="mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--gold)] tracking-widest text-center">MORPHEUS</h1>
        <p className="mt-1 text-xs text-[var(--muted)] tracking-[0.3em] uppercase text-center">RPG Solo // Operador IA</p>
        <div className="mt-6 term-panel p-4 text-sm leading-relaxed">
          <p className="text-[var(--gold-soft)]">{"> Inicializando o Construct..."}</p>
          <p className="text-[var(--muted)]">{fixedReady ? "O livro de regras fixo já está no sistema. Basta iniciar a simulação." : "Envie as regras em PDF. A mesa abre após a leitura; o Mestre identifica o jogo e cria a ficha com você no chat."}</p>
          <blockquote className="my-3 border-l-2 border-[var(--gold)] pl-3 text-[var(--gold)]">
            <p>“{QUOTES[quote].text}”</p>
            <footer className="mt-1 text-[11px] text-[var(--muted)]">— {QUOTES[quote].author}</footer>
          </blockquote>
          <p className="text-[var(--gold)] term-cursor">{busy ? "> recebendo código-fonte_" : fixedReady ? "> aguardando comando_" : "> aguardando upload_"}</p>
        </div>
      </div>

      {aiConfigured === false && (
        <button type="button" onClick={onConnect} className="w-full mb-4 border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-200">
          <TerminalIcon name="disconnected" size={16} className="mr-2" /><b>OPERADOR OFFLINE.</b> Você pode enviar e salvar o PDF agora. Conecte a IA para identificar o jogo e montar a ficha, sem precisar reenviar o livro.
        </button>
      )}

      {rulebook?.state === "indexing" && <section role="status" aria-label="Indexando livro fixo" className="term-panel p-4 mb-4 text-sm">
        <p className="flex items-center gap-2 text-[var(--gold)]"><TerminalIcon name="chip" size={16} />{"> indexando o livro fixo..."}</p>
        <p className="mt-1 text-xs break-words">{rulebook.name}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Isso é feito uma única vez; livros grandes podem levar alguns minutos. Aguarde aqui ou envie outro PDF abaixo.</p>
      </section>}

      {rulebook?.state === "error" && <section role="alert" aria-label="Erro no livro fixo" className="mb-4 border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
        <p className="font-semibold">Não foi possível usar o livro fixo{rulebook.name ? ` “${rulebook.name}”` : ""}.</p>
        <p className="mt-1">{rulebook.error || "Confira o arquivo na pasta rulebooks/."}</p>
        <p className="mt-1 text-xs text-red-300/80">Corrija o arquivo e recarregue a página, ou envie outro PDF abaixo.</p>
      </section>}

      {fixedReady && <section aria-label="Livro de regras fixo" className="term-panel p-4 mb-4">
        <div className="flex items-start gap-3">
          <TerminalIcon name="book" size={24} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--gold)]">{"> livro fixo carregado"}</p>
            <p className="mt-1 text-sm break-words">{rulebook?.name}</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              {rulebook?.pageCount} páginas com texto{rulebook?.systemName ? ` · ${rulebook.systemName}` : ""} · origem: {rulebook?.source === "folder" ? "pasta rulebooks/" : "salvo pelo site"}
            </p>
            {rulebook?.source === "folder"
              ? <p className="text-[11px] text-[var(--muted)] mt-2">Para trocar o livro, substitua o arquivo na pasta rulebooks/ e recarregue a página.</p>
              : confirmRemove
                ? <p className="mt-2 text-xs flex flex-wrap items-center gap-3"><span>Remover este livro fixo? As campanhas já criadas continuam funcionando.</span>
                    <button type="button" onClick={() => void removeFixed()} className="underline text-red-300">Confirmar remoção</button>
                    <button type="button" onClick={() => setConfirmRemove(false)} className="underline text-[var(--muted)]">Cancelar</button></p>
                : <button type="button" disabled={busy} onClick={() => setConfirmRemove(true)} className="mt-2 text-xs underline text-[var(--muted)] hover:text-[var(--gold)]">Remover livro fixo</button>}
          </div>
        </div>
      </section>}

      <form className="term-panel p-5 sm:p-6" onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
        <label htmlFor="campaign-title" className="block text-sm text-[var(--gold-soft)] mb-2">{"> Nome da campanha"}</label>
        <input id="campaign-title" value={title} disabled={busy} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Siga o coelho branco" className="w-full bg-[var(--bg-soft)] border border-[var(--border)] px-4 py-2.5 outline-none focus:border-[var(--gold)]" />

        <div className="mt-6">
          {fixedReady
            ? <details className="border border-[var(--border)] p-3">
                <summary className="cursor-pointer text-sm text-[var(--gold-soft)]">{"> Usar outro PDF apenas nesta campanha"}</summary>
                <p className="mt-2 mb-3 text-xs text-[var(--muted)]">Se nenhum PDF for escolhido, o livro fixo será usado.</p>
                {picker}
              </details>
            : picker}
        </div>

        <fieldset disabled={busy} className="mt-6">
          <legend className="text-sm text-[var(--gold-soft)] mb-3">{"> Protocolo do operador"}</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{MASTER_PROFILES.map(item => <button type="button" key={item.id} aria-pressed={profile === item.id} onClick={() => setProfile(item.id)} className={`text-left border p-3 transition ${profile === item.id ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-[var(--border)] bg-[var(--bg-soft)]/50 hover:border-[var(--gold)]/60"}`}>
            <span className="flex items-center gap-2 font-semibold text-sm"><TerminalIcon name={item.icon} size={18} />{item.name}</span><span className="block text-xs text-[var(--muted)] mt-1">{item.tagline}</span>
          </button>)}</div>
        </fieldset>

        {busy && <div role="status" aria-live="polite" className="mt-5 border border-[var(--border)] bg-black/40 p-3 text-sm">
          <p className="text-[var(--gold)]">{usingFixed ? "> preparando a campanha com o livro fixo..." : phase === "uploading" ? `> enviando PDF... ${percent}%` : "> lendo as páginas e salvando o livro..."}</p>
          <div role="progressbar" aria-label="Progresso do envio" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1 bg-[var(--panel)] mt-3"><div className="h-1 bg-[var(--gold)] transition-[width]" style={{ width: `${percent}%` }} /></div>
          <p className="text-xs text-[var(--muted)] mt-2">A identificação pela IA acontece dentro da mesa. Livros grandes podem levar mais tempo para serem lidos.</p>
          <button type="button" onClick={() => controller.current?.abort()} className="mt-3 underline underline-offset-4 text-[var(--gold-soft)]">Cancelar envio</button>
        </div>}
        {error && <div ref={errorRef} role="alert" tabIndex={-1} className="mt-4 text-sm text-red-300 border border-red-500/40 bg-red-500/10 px-3 py-3 outline-none">{error}</div>}
        {notice && <p role="status" className="mt-4 text-sm text-[var(--gold-soft)]">{notice}</p>}
        <button type="submit" disabled={busy} className="mt-6 w-full border border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)] font-semibold tracking-widest uppercase py-3 hover:bg-[var(--gold)]/20 transition disabled:opacity-60">
          <TerminalIcon name="terminal" size={18} className="mr-2" />{busy ? "> processando PDF..." : "> entrar na simulação"}
        </button>
      </form>
    </div>
  );
}
