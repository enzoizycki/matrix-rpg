"use client";

import type { CharacterData } from "@/lib/types";
import TerminalIcon, { type TerminalIconName } from "@/components/TerminalIcon";
import { ATTRIBUTES, PATH_LABELS } from "@/lib/matrix/types";
import { missingCharacterFields } from "@/lib/matrix/mechanics";

export type SheetState = { name: string; data: CharacterData; complete: boolean } | null;
export default function CharacterSheet({ sheet, onApprove, disabled }: { sheet: SheetState; systemName?: string; onApprove?: () => void; disabled?: boolean }) {
  const state = sheet?.data.matrix;
  const ready = Boolean(sheet && !missingCharacterFields(sheet.name, state).length);
  return <section className="h-full flex flex-col" aria-label="Ficha do personagem">
    <header className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-2"><h2 className="font-serif text-sm text-[var(--gold)] inline-flex gap-2 items-center"><TerminalIcon name="user" size={18} />// identidade</h2><span className="text-[9px] uppercase tracking-widest text-[var(--muted)]">{sheet?.complete ? "fixada" : "em criação"}</span></header>
    <div className="flex-1 overflow-y-auto parchment-scroll p-4 space-y-5">
      {!sheet ? <div className="border border-dashed border-[var(--border)] p-5 text-center"><TerminalIcon name="user" size={30} /><p className="text-xs text-[var(--muted)] leading-6 mt-3">Sua identidade ainda não está escrita. Converse com Morpheus: suas escolhas aparecerão aqui, uma a uma.</p><p className="text-[10px] uppercase tracking-widest mt-4 text-[var(--gold-soft)]">Corpo / Mente / Social</p></div> : <>
        <div><p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{state?.path ? PATH_LABELS[state.path] : "Caminho a definir"}</p><h3 className="font-serif text-xl text-[var(--gold)] mt-1 break-words">{sheet.name}</h3>{sheet.data.concept && <p className="text-xs text-[var(--muted)] mt-1">{sheet.data.concept}</p>}</div>
        {state && <>
          <section className="matrix-pressure" aria-label="Dado da Matrix">
            <div className="flex items-center justify-between gap-2"><span className="text-[10px] tracking-widest uppercase text-[var(--gold-soft)]">Dado da Matrix</span><span className="text-[9px] text-[var(--muted)]">CONTADOR · NÃO ROLAR</span></div>
            <div className="flex items-baseline gap-2 mt-3"><span className="matrix-result text-4xl" role={state.path ? "meter" : undefined} aria-label="Pressão da Matrix" aria-valuemin={1} aria-valuemax={6} aria-valuenow={state.path ? state.dm : undefined}>{state.path ? state.dm : "—"}</span><span className="text-xs text-[var(--muted)]">/ 6 {state.scene === "real" ? "· suspenso no Mundo Real" : "· pressão do sistema"}</span></div>
            <div className="grid grid-cols-6 gap-1 mt-3" aria-hidden="true">{[1, 2, 3, 4, 5, 6].map(value => <span key={value} className={`h-1.5 ${state.path && value <= state.dm ? "bg-[var(--gold)]/70" : "bg-[var(--border)]/50"}`} />)}</div>
            {state.scene === "matrix" && state.dm >= 4 && <p className="text-[11px] mt-2 text-[var(--gold-soft)]">{state.dm === 4 ? "Civis, polícia e criminosos em alerta." : state.dm === 5 ? "Soldados e forças especiais." : state.path === "blue" ? "Deletadores à sua procura." : "Agentes em cena."}</p>}
          </section>
          <div className="grid grid-cols-2 gap-2"><Resource label="Saúde" value={state.health} max={5} /><Resource label={!state.path ? "Recursos" : state.path === "blue" ? "Humanidade" : state.path === "real" ? "Sucata" : "Distorção"} value={!state.path || (state.path === "blue" && !state.function) ? undefined : state.path === "blue" ? state.ph : state.path === "real" ? state.scrap : state.pd} max={!state.path || (state.path === "blue" && !state.function) ? undefined : state.path === "blue" ? state.phMax : state.path === "real" ? undefined : state.pdMax} /></div>
          {state.health <= 0 && <p role="status" className="text-xs border border-[var(--gold)]/40 p-2">{state.path === "blue" ? "Corpo perdido. Consulte o custo de upload e a Humanidade permanente." : state.health === 0 ? "Saúde zero: resgate ainda pode ser possível." : "Saúde abaixo de zero: personagem morto."}</p>}
          {state.path === "blue" && state.function && state.ph <= 0 && <p className="text-xs text-[var(--gold-soft)]">Humanidade zerada: controle perdido para a Matrix.</p>}
          <div className="grid grid-cols-3 gap-1.5" aria-label="Afinidades">{ATTRIBUTES.map(attribute => <div key={attribute} className={`p-2 text-center border ${state.favored === attribute ? "border-[var(--gold)]/70 bg-[var(--gold)]/5" : "border-[var(--border)]"}`}><div className="text-xs text-[var(--gold-soft)]">{attribute}</div><div className="mt-1 text-[8px] uppercase text-[var(--muted)]">{state.favored === attribute ? "Afinidade" : "Normal"}</div></div>)}</div>
          {state.antecedent && <Block title="Antecedente" icon="note" text={state.antecedent} />}
          {state.team && <Block title="Equipe" icon="balanced" text={state.team} />}
          {state.function && <Block title="Função na Matrix" icon="chip" text={state.function} />}
          {state.crewRole && <Block title="Tripulação" icon="server" text={state.crewRole} />}
          {state.humanityTestDue && <p className="border border-[var(--gold)]/50 p-2 text-xs text-[var(--gold-soft)]">Teste de Humanidade pendente.</p>}
          {(state.dejaVu || state.firewall || state.chosen) && <Block title="Anomalias" icon="immersive" text={[state.dejaVu && "Déjà-vu: rerrolagem do próximo teste", state.firewall && "Firewall desativado: equipamento no próximo turno", state.chosen && "O Escolhido — condição verificada"].filter(Boolean).join("\n")} />}
          {state.motivation && <Block title="Mensagem do Oráculo" icon="grim" text={`${state.motivation}${state.motivationUnderstood ? "\nMotivação compreendida." : ""}`} />}
          {state.ship && <Block title="Nave" icon="server" text={`${state.ship}${state.shipHealth !== undefined ? ` · PV ${state.shipHealth}/${state.shipMaxHealth ?? "?"}` : ""}`} />}
        </>}
        <Block title="Equipamento" icon="equipment" text={sheet.data.equipment} />
        <Block title="Habilidades e sistemas" icon="chip" text={sheet.data.skills} />
        <Block title="História" icon="book" text={sheet.data.background} />
        <Block title="Notas" icon="note" text={sheet.data.notes} />
        {!sheet.complete && <div className="border-t border-[var(--border)] pt-4 text-xs"><p className="text-[var(--muted)] leading-5">{ready ? "Revise sua identidade. Só começamos a aventura após sua aprovação." : `Ainda falta: ${missingCharacterFields(sheet.name, state).join(", ")}.`}</p>{ready && onApprove && <button type="button" disabled={disabled} onClick={onApprove} className="mt-3 w-full inline-flex items-center gap-2 justify-center border border-[var(--gold)] p-2 text-[var(--gold)] disabled:opacity-50"><TerminalIcon name="check" size={15} />Aprovar ficha</button>}</div>}
      </>}
    </div>
  </section>;
}
function Resource({ label, value, max }: { label: string; value?: number; max?: number }) {
  return <div className="border border-[var(--border)] bg-[var(--gold)]/3 p-3"><p className="text-[9px] uppercase tracking-widest text-[var(--muted)]">{label}</p><p className="text-2xl text-[var(--gold-soft)] mt-1">{value ?? "—"}{max !== undefined && <span className="text-xs text-[var(--muted)]"> / {max}</span>}</p></div>;
}
function Block({ title, text, icon }: { title: string; text?: string; icon: TerminalIconName }) {
  if (!text) return null;
  return <div><h4 className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--gold-soft)] mb-1.5"><TerminalIcon name={icon} size={13} />{title}</h4><p className="text-xs leading-6 whitespace-pre-wrap text-[var(--text)]/85">{text}</p></div>;
}
