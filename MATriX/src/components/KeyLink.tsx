"use client";

import { useRef, useState } from "react";
import TerminalIcon from "@/components/TerminalIcon";

/** Link oficial para criar a chave de API, com opção de copiar o endereço (a prévia pode bloquear novas abas). */
export default function KeyLink({ url, linkText, instructions, addressLabel, idPrefix }: {
  url: string; linkText: string; instructions: string; addressLabel: string; idPrefix: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const addressRef = useRef<HTMLInputElement>(null);

  async function copyAddress() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      // Clipboard permission is often blocked inside embedded previews.
      addressRef.current?.focus();
      addressRef.current?.select();
      setCopyStatus("manual");
    }
  }

  return (
    <section aria-label={linkText} className="border border-[var(--border)] bg-black/30 p-3 mb-4">
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--gold-soft)] underline underline-offset-4">
        {linkText}
        <TerminalIcon name="external" size={14} />
        <span className="sr-only">(abre em nova aba)</span>
      </a>
      <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">{instructions}</p>
      <label htmlFor={`${idPrefix}-page`} className="block mt-3 text-[11px] text-[var(--gold-soft)]">Endereço oficial</label>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <input id={`${idPrefix}-page`} aria-label={addressLabel} ref={addressRef} readOnly value={url} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 basis-52 bg-[var(--panel)] border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--text)] outline-none focus:border-[var(--gold)]" />
        <button type="button" onClick={() => void copyAddress()} className="border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--gold)] hover:border-[var(--gold)] transition">Copiar endereço</button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">Se a nova aba não abrir na prévia, copie o endereço e abra diretamente no navegador.</p>
      <p role="status" aria-live="polite" className="text-xs text-[var(--gold-soft)] mt-1">
        {copyStatus === "copied"
          ? "Endereço copiado. Abra uma nova aba e cole na barra de endereço."
          : copyStatus === "manual"
            ? "O navegador bloqueou a cópia automática. O endereço está selecionado; copie-o manualmente."
            : ""}
      </p>
    </section>
  );
}
