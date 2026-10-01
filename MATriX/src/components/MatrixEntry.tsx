"use client";

import { useRef, useState } from "react";
import { MASTER_PROFILES } from "@/lib/profiles";
import { requestJSON } from "@/lib/http";
import type { GameSession } from "@/lib/types";
import { MATRIX_ASCII, MORPHEUS_INTRO } from "@/lib/matrix/content";
import TerminalIcon from "@/components/TerminalIcon";

export default function MatrixEntry({ onStarted, onRules, aiConfigured, onConnect }: {
  onStarted: (session: GameSession) => void; onRules: () => void;
  aiConfigured?: boolean; onConnect: () => void;
}) {
  const [title, setTitle] = useState("");
  const [profile, setProfile] = useState("immersive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function start() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const session = await requestJSON<GameSession>("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, masterProfile: profile }), signal: AbortSignal.timeout(20000) });
      if (!session.game?.id || session.game.ruleset !== "matrix-artefato") throw new Error("Não foi possível confirmar sua mesa Matrix.");
      onStarted(session);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "A conexão falhou. Tente novamente."); }
    finally { setBusy(false); lock.current = false; }
  }
  return <main className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:pt-10 fade-up">
    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] mb-4"><span>Morpheus / canal privado</span><span className="inline-flex items-center gap-1.5"><span className="matrix-live-dot" /> Regras carregadas</span></div>
    <section className="term-panel overflow-hidden" aria-labelledby="morpheus-title">
      <header className="matrix-terminal-bar"><div className="flex items-center gap-2"><TerminalIcon name="terminal" size={15} /><span>incoming_transmission / morpheus</span></div><span aria-hidden="true">01 : 99</span></header>
      <div className="p-5 sm:p-8">
        <p className="text-[10px] tracking-[0.32em] uppercase text-[var(--muted)]">Uma escolha muda tudo.</p>
        <h1 id="morpheus-title" className="font-serif text-4xl sm:text-6xl tracking-[0.18em] text-[var(--gold)] mt-2 mb-2">MORPHEUS<span className="blink text-[var(--muted)]">_</span></h1><p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)] mb-6">Matrix RPG // terminal narrativo</p>
        <div aria-label="Introdução de Morpheus" className="whitespace-pre-wrap leading-7 text-sm sm:text-base text-[var(--gold-soft)]/90">{MORPHEUS_INTRO}</div>
        <div className="flex items-center gap-2 mt-4 text-xs text-[var(--muted)]"><span className="inline-block h-px w-8 bg-[var(--border)]" />Morpheus</div>
        <div className="matrix-ascii-frame mt-7"><pre aria-label="Arte ASCII Matrix" className="matrix-ascii">{MATRIX_ASCII}</pre></div>
        <p className="text-[11px] text-[var(--muted)] mt-2">Introdução original desta adaptação. Nenhum arquivo é necessário.</p>
      </div>
    </section>
    <section className="mt-6 border border-[var(--border)] bg-[var(--bg-soft)]/95 p-5 sm:p-6" aria-labelledby="brief-rules-title">
      <div className="flex justify-between gap-3 items-center mb-4"><h2 id="brief-rules-title" className="font-serif text-sm text-[var(--gold)]">// antes de atravessar</h2><button type="button" onClick={onRules} className="inline-flex gap-1.5 items-center text-xs text-[var(--gold-soft)] underline underline-offset-4"><TerminalIcon name="book" size={14} />Ler as regras</button></div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Brief title="01 / Sua identidade" text="Corpo, Mente e Social. Seu antecedente define a afinidade. A ficha nasce da conversa — sem preencher formulários." />
        <Brief title="02 / Seus dados" text="Apenas d6. Na Matrix, escolha o maior ou o menor dos dois dados, conforme seu caminho e antecedente." />
        <Brief title="03 / A pressão" text="O DM é um contador fixo, nunca rolado. Suas escolhas podem estabilizar a Matrix ou atrair as máquinas." />
      </div>
      <p className="mt-4 text-xs leading-6 text-[var(--muted)]">Morpheus explicará os três caminhos — Resgatado, Reconectado e Mundo Real — antes de criar seu personagem. A ficha será fixada na mesa e a aventura só começa após sua aprovação.</p>
    </section>
    <form onSubmit={event => { event.preventDefault(); void start(); }} className="term-panel mt-6 p-5 sm:p-6 space-y-4" aria-busy={busy}>
      <label className="block text-xs text-[var(--gold-soft)]" htmlFor="matrix-campaign">Nome da conexão <span className="text-[var(--muted)]">/ opcional</span></label>
      <input id="matrix-campaign" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} disabled={busy} placeholder="Siga o coelho branco" className="w-full border border-[var(--border)] bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]" />
      <label className="block text-xs text-[var(--gold-soft)]" htmlFor="matrix-profile">Estilo de Morpheus</label>
      <select id="matrix-profile" value={profile} onChange={event => setProfile(event.target.value)} disabled={busy} className="w-full border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2.5 text-sm">
        {MASTER_PROFILES.map(item => <option key={item.id} value={item.id}>{item.name} — {item.tagline}</option>)}
      </select>
      {aiConfigured === false && <p className="text-xs leading-6 text-[var(--muted)]">A introdução e as regras já estão disponíveis. <button type="button" onClick={onConnect} className="underline text-[var(--gold-soft)]">Conecte Gemini ou Ollama</button> para conversar com Morpheus. Você também pode abrir a mesa agora e conectar depois.</p>}
      {error && <p role="alert" className="text-sm text-red-300 border border-red-500/30 p-3">{error}</p>}
      <button type="submit" disabled={busy} className="w-full border border-[var(--gold)] bg-[var(--gold)]/10 hover:bg-[var(--gold)]/20 text-[var(--gold)] uppercase tracking-widest py-3.5 inline-flex justify-center gap-3 items-center disabled:opacity-50"><TerminalIcon name="connect" size={18} />{busy ? "estabelecendo conexão..." : "Entrar na Matrix"}</button>
      <p className="text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">Regras incorporadas / criação pelo chat / mesa solo</p>
    </form>
    <footer className="mt-6 text-center text-[11px] leading-6 text-[var(--muted)]">
      <p>Morpheus é um software criado e arquitetado por <strong className="text-[var(--gold-soft)]">Enzo Izycki</strong>.</p>
      <p>Matrix RPG · Dan Aguiar / <a href="https://www.artefatojogos.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Artefato</a></p>
      <p>Gratuito e feito de fã para fã. Homenagem à obra de Lilly e Lana Wachowski.</p>
      <p>Adaptação não oficial. O uso de IA segue os limites e custos do provedor escolhido.</p>
    </footer>
  </main>;
}
function Brief({ title, text }: { title: string; text: string }) {
  return <div className="border border-[var(--border)]/70 bg-black/30 p-3"><h3 className="text-[11px] uppercase tracking-wider text-[var(--gold-soft)] mb-2">{title}</h3><p className="text-xs leading-6 text-[var(--muted)]">{text}</p></div>;
}
