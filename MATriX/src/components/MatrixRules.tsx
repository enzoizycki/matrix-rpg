"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TerminalIcon from "@/components/TerminalIcon";
import { MATRIX_CHAPTERS, MATRIX_RULES } from "@/lib/matrix/rulebook";

export default function MatrixRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [chapter, setChapter] = useState(-1);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus(); };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = MATRIX_RULES.filter(section => (chapter === -1 || chapter === section.chapter) && normalized(`${section.title} ${section.text}`).includes(normalized(search)));
  return createPortal(<div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="matrix-rules-title" className="term-panel w-full max-w-4xl max-h-[92dvh] flex flex-col" onClick={event => event.stopPropagation()}>
      <header className="border-b border-[var(--border)] p-4 flex items-start gap-3"><TerminalIcon name="book" size={22} /><div className="flex-1"><h2 id="matrix-rules-title" className="text-[var(--gold)] font-serif">Morpheus // regras de Matrix</h2><p className="text-xs text-[var(--muted)] mt-1">Dan Aguiar · Artefato · material fornecido pelo jogador</p></div><button type="button" className="terminal-icon-button" onClick={onClose} aria-label="Fechar regras"><TerminalIcon name="close" /></button></header>
      <div className="p-4 border-b border-[var(--border)] space-y-3">
        <input aria-label="Buscar nas regras" ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar: distorção, combate, nave, Oráculo..." className="w-full bg-black/50 border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--gold)]" />
        <div className="flex gap-1.5 flex-wrap"><button type="button" onClick={() => setChapter(-1)} aria-pressed={chapter === -1} className={`matrix-filter ${chapter === -1 ? "active" : ""}`}>Tudo</button>{MATRIX_CHAPTERS.map((label, i) => <button type="button" key={label} onClick={() => setChapter(i)} aria-pressed={chapter === i} className={`matrix-filter ${chapter === i ? "active" : ""}`}>{label}</button>)}</div>
      </div>
      <div className="overflow-y-auto parchment-scroll p-4 sm:p-6 space-y-6">
        <p className="text-xs text-[var(--muted)]">Texto organizado em seções a partir das regras enviadas. “Notas da adaptação” distingue as decisões desta versão digital das regras do autor. Morpheus consulta esta mesma base.</p>
        {!filtered.length && <p role="status" className="text-sm">Nenhuma seção encontrada. Tente outra palavra ou selecione “Tudo”.</p>}
        {filtered.map(section => <article key={section.id} id={`rule-${section.id}`} className="border-l border-[var(--border)] pl-4"><div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{MATRIX_CHAPTERS[section.chapter]}{section.page > 0 && section.page < 30 ? ` / p.${section.page}` : ""}</div><h3 className="text-[var(--gold-soft)] mt-1 mb-3 text-base">{section.title}</h3><p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text)]/90">{section.text}</p></article>)}
        <footer className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">RPG gratuito, feito de fã para fã. Homenagem à obra de Lilly e Lana Wachowski. Não é um produto oficial de Matrix.</footer>
      </div>
    </section>
  </div>, document.body);
}
