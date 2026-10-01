import { makeMatrixRequest, matrixNotation } from "./mechanics";
import type { MatrixAttribute, MatrixRollKind, MatrixRollRequest, MatrixState } from "./types";

/** Only a genuine promise to request dice, not a general explanation of rules. */
export function promisesPlayerRoll(narration: string): boolean {
  return /\b(?:vou\s+(?:solicitar|pedir)|solicit(?:o|arei|aria)|aguard(?:e|ar|aremos?)\s+(?:o\s+)?pedido\s+(?:do\s+sistema|de\s+rolagem)|role\s+(?:[1-9]|1[0-2])?d6)\b/i.test(narration);
}

/**
 * Restores a pending dice request without rolling for the player or changing
 * the sheet. The book's dice rules determine kind/notation, not model prose.
 */
export function recoverPlayerRollRequest(
  playerText: string,
  narration: string,
  state: MatrixState | undefined,
  pending: MatrixRollRequest | null,
): MatrixRollRequest | null {
  if (pending) return pending; // preserve the existing ID
  const explicitlyRequested = promisesPlayerRoll(narration);
  if (!state?.path && !explicitlyRequested) return null;

  const all = `${playerText} ${narration}`;
  const attribute = selectAttribute(playerText);
  const sort = /\b(?:sortear|sorteio|tabela|aleat[oó]ri[oa]|equipe)\b/i.test(playerText);
  const humanity = state?.path === "blue" && /(?:humanidade|\bTH\b)/i.test(all);
  const damage = state?.scene === "matrix" && /\b(?:dano|machucad|ferimento)\b/i.test(playerText) && !/\b(?:atac|golpe|acert|atir)\w*/i.test(playerText);

  let kind: MatrixRollKind;
  if (!state?.path || sort) kind = "table";
  else if (humanity) kind = "humanity";
  else if (damage) kind = "damage";
  else if (state.scene === "real") kind = "real";
  else kind = "attribute";

  const notation = kind === "real" ? "3d6" : kind === "table" || kind === "damage" ? "1d6" : "2d6";
  const mentioned = narration.match(/\b(?:[1-9]|1[0-2])?d6(?:\s*[+-]\s*\d{1,2})?\b/i)?.[0].replace(/\s+/g, "");
  let requested = notation;
  if (explicitlyRequested && mentioned && (kind === "real" || kind === "damage" || kind === "table")) {
    try { requested = matrixNotation(mentioned).notation; }
    catch { /* use rulebook default */ }
  }
  const reason = kind === "humanity" ? "Teste de Humanidade"
    : kind === "damage" ? "Dano do personagem"
      : kind === "real" ? "Ação no Mundo Real"
        : kind === "table" ? "Sorteio solicitado por Morpheus"
          : `Teste de ${attribute}`;
  try {
    return makeMatrixRequest({ kind, notation: requested, reason, ...(kind === "attribute" ? { attribute } : {}), ...(kind === "humanity" ? { humanityPurpose: "pressure" } : {}) }, state);
  } catch {
    return null; // ask for clarification; never invent a different mechanic
  }
}

function selectAttribute(text: string): MatrixAttribute {
  if (/\b(?:mente|hacke|decifr|investig|pesquis|procur|rastre|sistema|terminal|c[oó]digo|computador)\w*/i.test(text)) return "Mente";
  if (/\b(?:social|persuad|convenc|negoci|mentir|engan|intimid|convers|diplom|dialog)\w*/i.test(text)) return "Social";
  return "Corpo";
}
