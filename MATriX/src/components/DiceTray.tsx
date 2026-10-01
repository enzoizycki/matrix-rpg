"use client";

import { useEffect, useRef, useState } from "react";
import { Die } from "@/components/DiceRoll";
import TerminalIcon from "@/components/TerminalIcon";
import { requestJSON } from "@/lib/http";
import { matrixNotation, resolveMatrixRoll } from "@/lib/matrix/mechanics";
import type { MatrixDiceResult, MatrixResolution, MatrixRollRequest, MatrixState } from "@/lib/matrix/types";

export type TrayResult = MatrixDiceResult;
export type RollRequest = MatrixRollRequest | null;

export default function DiceTray({ gameId, request, character, disabled, onSend }: {
  gameId: number; request: RollRequest; character?: MatrixState; disabled: boolean;
  onSend: (result: TrayResult) => Promise<boolean>;
}) {
  const [count, setCount] = useState(character?.scene === "real" ? 3 : 2);
  const [modifier, setModifier] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [result, setResult] = useState<TrayResult | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const [preview, setPreview] = useState<MatrixResolution | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const sendRef = useRef(onSend); sendRef.current = onSend;
  const notation = `${count}d6${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ""}`;
  const matched = Boolean(request && matrixNotation(request.notation).notation === notation);
  const locked = rolling || delivering;
  useEffect(() => {
    if (!request) return;
    const parts = matrixNotation(request.notation);
    setCount(parts.count); setModifier(parts.modifier); setResult(null); setPreview(null); setError("");
  }, [request?.id, request?.notation]);

  function touch() { setResult(null); setPreview(null); setError(""); }
  function restore() {
    if (!request) return;
    const parts = matrixNotation(request.notation); setCount(parts.count); setModifier(parts.modifier); touch();
  }
  async function deliver(value: TrayResult) {
    setDelivering(true);
    try { if (await sendRef.current(value)) setSentId(value.rollId); }
    finally { setDelivering(false); }
  }
  async function roll() {
    if (busy.current || disabled) return;
    busy.current = true; setRolling(true); touch();
    const start = Date.now();
    try {
      const value = await requestJSON<TrayResult>("/api/roll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId, notation, requestId: request?.id }), signal: AbortSignal.timeout(15000) });
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - start))));
      setPreview(request && value.matchedRequest ? resolveMatrixRoll(character, value, request).resolution : null);
      setResult(value); setRolling(false);
      if (value.requested && value.matchedRequest) await deliver(value);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha na rolagem. Tente novamente."); }
    finally { busy.current = false; setRolling(false); }
  }
  const evaluation = preview;
  const selection = request?.kind === "attribute" && character?.favored ? character.path === "blue" ? (request.attribute === character.favored ? "menor" : "maior") : request.attribute === character.favored ? "maior" : "menor" : request?.kind === "humanity" ? "maior" : null;
  const alreadySent = Boolean(result && result.rollId === sentId);

  return <section className="h-full flex flex-col" aria-label="Bandeja de dados">
    <header className="p-4 border-b border-[var(--border)] flex items-center gap-2"><TerminalIcon name="dice" size={20} /><h2 className="font-serif text-sm text-[var(--gold)]">// dados d6</h2></header>
    <div className="flex-1 overflow-y-auto parchment-scroll p-4 space-y-4">
      <p className="text-[11px] text-[var(--muted)] leading-5">Este Matrix usa somente d6. O DM da ficha é um contador e nunca participa da animação.</p>
      {request && <div className="border border-[var(--gold)]/60 bg-[var(--gold)]/5 p-3" aria-label="Rolagem solicitada"><p className="text-[10px] uppercase tracking-widest text-[var(--gold)]">Morpheus solicita</p><p className="text-sm mt-2">{request.reason}</p><p className="text-xs text-[var(--gold-soft)] mt-2">{request.notation}{selection ? ` · use o ${selection} dado` : " · some os resultados"}</p>{selection && <p className="text-[10px] mt-1 text-[var(--muted)]">{request.kind === "humanity" || character?.path !== "blue" ? "Sucesso ≥ DM" : "Sucesso ≤ DM"}. Não some os dois dados.</p>}{!matched && <button type="button" disabled={locked} onClick={restore} className="text-[11px] underline mt-2 text-[var(--gold)]">Restaurar pedido de Morpheus</button>}</div>}
      <div className="matrix-dice-stage" role="group" aria-label="Área de rolagem" data-rolling={rolling}>
        <div className="matrix-stage-label"><span>RNG // {notation}</span><span>{rolling ? "EXECUTANDO" : result ? "REGISTRADO" : "PRONTO"}</span></div>
        <div className="matrix-dice-display">{Array.from({ length: count }).map((_, index) => <Die key={`${count}-${index}`} sides={6} value={result?.rolls[index] ?? null} rolling={rolling} size={count <= 2 ? 76 : count <= 4 ? 56 : 42} />)}</div>
        <div className="text-center min-h-14 w-full" aria-live="polite">{result ? <><p className="text-[9px] uppercase tracking-widest text-[var(--muted)]">{evaluation?.selection || "Soma dos dados"}</p><div data-testid="tray-total" className="matrix-result font-serif text-3xl dice-pop">{evaluation?.value ?? result.total}</div><p className="text-[11px] text-[var(--muted)] mt-1 break-words">{result.detail}</p>{evaluation?.success !== undefined && <p className="text-xs text-[var(--gold-soft)] mt-1">{evaluation.success ? "Sucesso" : "Falha"}{evaluation.target !== undefined ? ` · alvo ${evaluation.target}` : ""}</p>}</> : <><p className="text-lg text-[var(--gold-soft)]">{rolling ? "[ … ]" : notation}</p><p className="text-[9px] text-[var(--muted)] uppercase tracking-widest mt-1">{rolling ? "gerando faces" : "aguardando comando"}</p></>}</div>
      </div>
      <div className="grid grid-cols-4 gap-2" aria-label="Atalhos d6">{[1, 2, 3, 6].map(amount => <button type="button" key={amount} disabled={locked} aria-pressed={amount === count} onClick={() => { setCount(amount); setModifier(0); touch(); }} className={`border py-2 text-xs ${amount === count ? "border-[var(--gold)] text-[var(--gold)] bg-[var(--gold)]/5" : "border-[var(--border)] text-[var(--muted)]"}`}>{amount}d6</button>)}</div>
      <div className="grid grid-cols-2 gap-3"><Stepper label="Quantidade" value={count} min={1} max={12} disabled={locked} onChange={value => { setCount(value); touch(); }} /><Stepper label="Modificador" value={modifier} min={-20} max={20} disabled={locked} onChange={value => { setModifier(value); touch(); }} /></div>
      {request && !matched && <p className="text-[11px] text-[var(--muted)]">Pedido alterado: esta será uma rolagem livre. Você confere e decide se envia a Morpheus.</p>}
      <button type="button" onClick={() => void roll()} disabled={disabled || locked || (matched && alreadySent)} className="w-full border border-[var(--gold)] bg-[var(--gold)]/10 hover:bg-[var(--gold)]/20 p-3 text-sm uppercase tracking-widest text-[var(--gold)] disabled:opacity-50"><TerminalIcon name="terminal" size={16} className="mr-2" />{rolling ? "rolando..." : delivering || disabled ? "aguardando Morpheus..." : `Rolar ${notation}`}</button>
      {result && !alreadySent && !locked && <button type="button" disabled={disabled} onClick={() => void deliver(result)} className="w-full border border-[var(--border)] p-3 text-xs text-[var(--gold-soft)] disabled:opacity-50"><TerminalIcon name="send" size={15} className="mr-2" />Enviar resultado a Morpheus</button>}
      {alreadySent && <p role="status" className="text-[11px] text-center text-[var(--muted)]">Resultado recebido por Morpheus.</p>}
      {error && <p role="alert" className="text-xs text-red-300 border border-red-500/30 p-3">{error}</p>}
      <p className="text-[10px] leading-5 text-[var(--muted)]">2d6: testes na Matrix / 3d6: Mundo Real / 1d6: tabelas e dano / 6d6: condição do Escolhido.</p>
    </div>
  </section>;
}
function Stepper({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; disabled: boolean }) {
  return <div><p className="text-[10px] text-[var(--gold-soft)] mb-2">{label}</p><div className="flex items-center border border-[var(--border)]"><button type="button" disabled={disabled || value <= min} aria-label={`Diminuir ${label.toLowerCase()}`} onClick={() => onChange(Math.max(min, value - 1))} className="terminal-icon-button"><TerminalIcon name="minus" size={14} /></button><span className="flex-1 text-center text-sm">{value}</span><button type="button" disabled={disabled || value >= max} aria-label={`Aumentar ${label.toLowerCase()}`} onClick={() => onChange(Math.min(max, value + 1))} className="terminal-icon-button"><TerminalIcon name="plus" size={14} /></button></div></div>;
}
