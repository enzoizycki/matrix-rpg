import type { CharacterData } from "@/db/schema";
import { ATTRIBUTES, CREW_ROLES, FUNCTIONS, TEAMS, ROLL_KINDS, baseMatrixState, type MatrixAttribute, type MatrixDiceResult, type MatrixPath, type MatrixResolution, type MatrixRollRequest, type MatrixState } from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const text = (value: unknown, length = 4000) => typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, length) : undefined;
const number = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T | undefined => typeof value === "string" && values.includes(value as T) ? value as T : undefined;
export const functionMax = (value?: string) => value === "Agente" ? 3 : value === "Fantasma" ? 4 : value === "Sabotador" ? 5 : 0;

export function matrixNotation(raw: unknown): { notation: string; count: number; modifier: number } {
  if (typeof raw !== "string") throw new Error("Informe a notação de dados d6.");
  const cleaned = raw.trim().replace(/\s+/g, "").toLowerCase().replace(/−/g, "-");
  const matched = cleaned.match(/^(\d*)d6([+-]\d+)?$/);
  if (!matched) throw new Error("Matrix usa apenas d6. Exemplos válidos: 2d6, 3d6+2 ou 1d6+1. O DM não é rolado.");
  const count = matched[1] ? Number(matched[1]) : 1;
  const modifier = Number(matched[2] || 0);
  if (!Number.isInteger(count) || count < 1 || count > 12 || Math.abs(modifier) > 100) throw new Error("Use de 1 a 12 dados d6 e um modificador entre −100 e 100.");
  return { notation: `${count}d6${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ""}`, count, modifier };
}

export function normalizedState(raw?: MatrixState): MatrixState {
  const state = { ...baseMatrixState(), ...raw };
  state.dm = clamp(number(state.dm, 3), 1, 6);
  state.maxHealth = 5;
  state.health = clamp(number(state.health, 5), -99, 5);
  state.pdMax = clamp(number(state.pdMax, 5), 0, 5);
  state.pd = clamp(number(state.pd, 5), 0, state.pdMax);
  state.phMax = clamp(number(state.phMax, functionMax(state.function)), 0, functionMax(state.function));
  state.ph = clamp(number(state.ph, state.phMax), 0, state.phMax);
  return state;
}

export function stateResources(state: MatrixState): string {
  const resources = [`Saúde ${state.health}/5`];
  if (state.scene === "matrix") resources.push(`DM ${state.dm} (contador)`);
  if (state.path === "blue") resources.push(`Humanidade ${state.ph}/${state.phMax}`);
  else if (state.path === "red") resources.push(`Distorção ${state.pd}/${state.pdMax}`);
  if (state.scene === "real") resources.push(`Sucata ${state.scrap}`);
  return resources.join(" · ");
}

/** Updates the stored state without allowing foreign-system stats or fabricated Chosen status. */
export function mergeMatrixCharacter(previous: CharacterData, args: Record<string, unknown>): CharacterData {
  const prev = previous.matrix;
  const path = oneOf(args.path, ["red", "blue", "real"] as const) ?? prev?.path;
  const changedPath = path !== prev?.path;
  const state = normalizedState(changedPath ? undefined : prev);
  state.path = path;
  if (changedPath) {
    state.scene = path === "real" ? "real" : "matrix";
    state.dm = path === "blue" ? 2 : 3;
    state.pd = path === "blue" ? 0 : 5;
    state.pdMax = path === "blue" ? 0 : 5;
  }
  state.antecedent = text(args.antecedent, 300) || state.antecedent;
  state.favored = oneOf(args.favored, ATTRIBUTES) || state.favored;
  state.team = oneOf(args.team, TEAMS) || state.team;
  const fn = oneOf(args.function, FUNCTIONS) || state.function;
  if (path === "blue" && fn !== state.function) { state.function = fn; state.phMax = functionMax(fn); state.ph = state.phMax; }
  state.crewRole = oneOf(args.crewRole, CREW_ROLES) || state.crewRole;
  state.scene = oneOf(args.scene, ["matrix", "real"] as const) || state.scene;
  state.health = clamp(number(args.health, state.health), -99, 5);
  const dm = clamp(number(args.dm, state.dm), 1, 6);
  if (path === "blue" && state.dm < 5 && dm >= 5) state.humanityTestDue = true;
  state.dm = dm;
  if (path !== "blue") {
    state.pdMax = clamp(number(args.pdMax, state.pdMax), 0, 5);
    state.pd = clamp(number(args.pd, state.pd), 0, state.pdMax);
  } else {
    state.phMax = clamp(number(args.phMax, state.phMax), 0, state.phMax);
    state.ph = clamp(number(args.ph, state.ph), 0, state.phMax);
  }
  // Only the actual Trinity result grants these flags. Morpheus may consume, not invent them.
  if (args.dejaVu === false) state.dejaVu = false;
  if (args.firewall === false) state.firewall = false;
  state.motivation = text(args.motivation, 1000) || state.motivation;
  if (typeof args.motivationUnderstood === "boolean" && state.motivation) state.motivationUnderstood = args.motivationUnderstood;
  state.scrap = clamp(number(args.scrap, state.scrap), 0, 100000);
  state.ship = text(args.ship, 200) || state.ship;
  if (typeof args.shipMaxHealth === "number") state.shipMaxHealth = clamp(number(args.shipMaxHealth, 0), 0, 10000);
  if (typeof args.shipHealth === "number") state.shipHealth = clamp(number(args.shipHealth, 0), 0, state.shipMaxHealth ?? 10000);
  const data: CharacterData = { ...previous, matrix: state };
  // Never retain generic D&D race/class/level values in this game's sheet.
  delete data.race; delete data.class; delete data.level;
  for (const key of ["concept", "equipment", "skills", "background", "notes"] as const) {
    const value = text(args[key]);
    if (value !== undefined) data[key] = value;
  }
  data.attributes = Object.fromEntries(ATTRIBUTES.map(attribute => [attribute, state.favored === attribute ? "Afinidade" : "Sem afinidade"]));
  data.resources = stateResources(state);
  return data;
}

export function explicitlyApproves(text: string): boolean {
  const phrase = text.trim().toLowerCase().replace(/[.!]+$/, "").replace(/^eu\s+/, "").trim();
  return ["aprovo", "aprovo a ficha", "aprovo minha ficha", "confirmo a ficha", "ficha aprovada", "pode iniciar a aventura"].includes(phrase);
}

export function missingCharacterFields(name: string, state?: MatrixState): string[] {
  const missing: string[] = [];
  if (!name || name === "Identidade em criação") missing.push("nome ou codinome");
  if (!state?.path) missing.push("caminho");
  if (!state?.antecedent) missing.push("antecedente");
  if (!state?.favored) missing.push("afinidade (Corpo, Mente ou Social)");
  if (state?.path === "blue" && !state.function) missing.push("Função (Agente, Fantasma ou Sabotador)");
  if ((state?.path === "red" || state?.path === "real") && !state.team) missing.push("equipe");
  if (state?.path === "real" && !state.crewRole) missing.push("função na tripulação");
  return missing;
}

export function makeMatrixRequest(args: Record<string, unknown>, state?: MatrixState): MatrixRollRequest {
  const kind = oneOf(args.kind, ROLL_KINDS);
  if (!kind) throw new Error("Informe o tipo da rolagem: attribute, humanity, damage, real, table, chosen ou other.");
  const parsed = matrixNotation(args.notation);
  const reason = text(args.reason, 500);
  if (!reason) throw new Error("Explique o motivo da rolagem.");
  const attribute = oneOf(args.attribute, ATTRIBUTES);
  if (kind === "attribute") {
    if (!state?.path || state.scene === "real") throw new Error("Defina primeiro um personagem dentro da Matrix. No Mundo Real use o tipo real e 3d6.");
    if (!attribute) throw new Error("Informe Corpo, Mente ou Social para o teste.");
    if (parsed.count !== 2 || parsed.modifier !== 0) throw new Error("Testes de atributo na Matrix são 2d6 sem modificador. Escolhe-se maior/menor, não se soma.");
  }
  if (kind === "humanity" && (state?.path !== "blue" || state.scene !== "matrix" || parsed.count !== 2 || parsed.modifier !== 0)) throw new Error("TH é exclusivo de Reconectados e usa 2d6, maior resultado ≥ DM.");
  if (kind === "damage" && state?.path === "blue" && state.scene === "matrix") throw new Error("Dano do Reconectado dentro da Matrix é fixo, baseado no DM. Consulte blue-combat; não peça dado de dano.");
  if (kind === "real" && (parsed.count !== 3 || state?.scene !== "real")) throw new Error("No Mundo Real o jogador rola 3d6, somando os bônus justificados de equipamento.");
  if (kind === "chosen" && (!state?.motivationUnderstood || parsed.count !== 6 || parsed.modifier !== 0)) throw new Error("O Escolhido exige motivação compreendida e 6d6 sem modificador. Não é opção automática de criação.");
  const opposition = typeof args.opposition === "number" && Number.isFinite(args.opposition) ? args.opposition : undefined;
  return { id: crypto.randomUUID(), notation: parsed.notation, reason, kind, attribute, opposition,
    humanityPurpose: oneOf(args.humanityPurpose, ["pressure", "creativity", "lie", "event"] as const),
    failureDmCost: clamp(number(args.failureDmCost, 1), 1, 3), createdAt: new Date().toISOString() };
}

/** Individual faces, not their sum, are authoritative for Matrix attribute tests. */
export function resolveMatrixRoll(stateValue: MatrixState | undefined, dice: Pick<MatrixDiceResult, "notation" | "rolls" | "total" | "modifier">, request?: MatrixRollRequest | null): { state: MatrixState; resolution: MatrixResolution } {
  const state = normalizedState(stateValue);
  const before = state.dm;
  const resolution: MatrixResolution = { kind: request?.kind || "free", label: request?.reason || "Rolagem livre", selection: "Soma", value: dice.total, dmBefore: before, dmAfter: before, notes: [] };
  if (!request || matrixNotation(dice.notation).notation !== matrixNotation(request.notation).notation) {
    resolution.kind = "free";
    resolution.notes.push("Rolagem livre ou diferente do pedido. Morpheus deve confirmar sua finalidade antes de aplicar consequências.");
    return { state, resolution };
  }
  if (request.kind === "attribute" || request.kind === "humanity") {
    if (dice.rolls.length !== 2) throw new Error("O teste precisa de exatamente dois dados.");
    const isTH = request.kind === "humanity";
    const blue = state.path === "blue";
    const favored = state.favored === request.attribute;
    const useHighest = isTH || (blue ? !favored : favored);
    resolution.value = useHighest ? Math.max(...dice.rolls) : Math.min(...dice.rolls);
    resolution.selection = useHighest ? "Maior dado" : "Menor dado";
    resolution.target = before;
    resolution.success = isTH || !blue ? resolution.value >= before : resolution.value <= before;
    if (isTH) {
      if (resolution.success) state.ph = Math.min(state.phMax, state.ph + 1);
      else if (request.humanityPurpose === "pressure" || state.humanityTestDue) state.ph = Math.max(0, state.ph - 1);
      else state.dm = clamp(before + (request.failureDmCost || 1), 1, 6);
      state.humanityTestDue = false;
      resolution.notes.push(resolution.success ? "Humanidade recuperada em 1, respeitando o limite atual." : "Aplique as consequências do TH conforme seu motivo (p.8–9).");
    } else if (!resolution.success) state.dm = Math.min(6, before + 1);
    // The source says any test: TH can also trigger Vet x3. Further TH/rolls require a new request.
    if (dice.rolls[0] === before && dice.rolls[1] === before) {
      const redEvents = ["", "Falha Crítica", "Reboot", "Déjà-vu", "Debug", "Firewall Desativado", "Proteção de Sistema Ativado"];
      const blueEvents = ["", "Reboot", "Redefinição de Parâmetros", "Desfragmentação", "Admin", "Falta de RAM", "Hackers"];
      resolution.event = `${blue ? "Vet x3" : "Trinity"} · ${blue ? blueEvents[before] : redEvents[before]} [${before}–${before}–${before}]`;
      if (blue) {
        if (before === 1) state.dm = 2;
        if (before === 2) resolution.notes.push("Faça TH; com sucesso role 1d6 para recuperar PH, até o máximo atual (p.11).");
        if (before === 3) resolution.notes.push("Faça TH; na falha, DM+1 e um Deletador passa a caçá-lo (p.11).");
        if (before === 4) resolution.notes.push("Permissão Admin: o jogador escolhe o novo DM. Nesta mesa o contador permanece entre 1 e 6.");
        if (before === 5) state.dm = 4;
        if (before === 6) state.dm = 4;
      } else {
        if (before === 1) { state.dm = 5; resolution.success = false; }
        if (before === 2) state.dm = 3;
        if (before === 3) { state.dejaVu = true; resolution.notes.push("Pode rerrolar o próximo teste (p.4)."); }
        if (before === 4) resolution.notes.push("Debug: peça 1d6 PD por personagem e recupere até o teto (p.4).");
        if (before === 5) { state.firewall = true; resolution.notes.push("No próximo turno é permitido solicitar qualquer arma/equipamento ao operador (p.4)."); }
        if (before === 6) { state.dm = 6; resolution.notes.push("Um Agente aparece por personagem conectado (p.4)."); }
      }
    }
  } else if (request.kind === "damage" && state.scene === "matrix") {
    resolution.target = state.path === "blue" ? 5 : before;
    resolution.success = dice.total >= resolution.target;
    resolution.notes.push(resolution.success ? "O dano alcança o limiar para derrotar o inimigo." : "O dano não alcança o limiar para derrotar o inimigo.");
  } else if (request.kind === "real" && request.opposition !== undefined) {
    resolution.target = request.opposition;
    const difference = dice.total - request.opposition;
    if (difference) resolution.success = difference > 0;
    resolution.notes.push(difference > 0 ? `Margem ${difference}: em combate, ${difference} de dano ao oponente.` : difference < 0 ? `Margem ${difference}: falha; em combate o dano recebido deve ser aplicado à Saúde.` : "Empate: o texto não fixa a consequência. Morpheus deve anunciar uma decisão de mesa.");
  } else if (request.kind === "chosen") {
    resolution.selection = "Conjunto dos seis dados";
    resolution.success = state.motivationUnderstood && [...dice.rolls].sort((a, b) => a - b).join(",") === "1,2,3,4,5,6";
    if (resolution.success) state.chosen = true;
    resolution.notes.push(resolution.success ? "A condição do Escolhido foi cumprida. A ordem visual é irrelevante nesta adaptação." : "A condição do Escolhido não foi cumprida.");
  }
  if (state.path === "blue" && before < 5 && state.dm >= 5) { state.humanityTestDue = true; resolution.notes.push("Pressão da Matrix: um Teste de Humanidade está pendente."); }
  if (state.path === "blue" && state.ph === 0) resolution.notes.push("Humanidade zerada: o jogador perde o controle do personagem para a Matrix.");
  resolution.dmAfter = state.dm;
  return { state, resolution };
}

export function resolutionText(resolution: MatrixResolution, rolls: number[]): string {
  return [resolution.label, `Dados individuais: [${rolls.join(", ")}]. ${resolution.selection}: ${resolution.value}.`,
    resolution.target !== undefined ? `Alvo: ${resolution.target}.` : "",
    resolution.success === undefined ? "Interpretação narrativa pendente." : resolution.success ? "SUCESSO." : "FALHA.",
    `DM: ${resolution.dmBefore} → ${resolution.dmAfter}.`, resolution.event || "", ...resolution.notes].filter(Boolean).join(" ");
}

export function pendingFromMessages(rows: { meta: Record<string, unknown> | null }[]): MatrixRollRequest | null {
  const answered = new Set(rows.map(row => row.meta?.answeredRequestId).filter(Boolean));
  for (const row of [...rows].reverse()) {
    const request = row.meta?.matrixRequest as MatrixRollRequest | undefined;
    if (request?.id && !answered.has(request.id)) return request;
  }
  return null;
}
