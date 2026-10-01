import type { MatrixResolution } from "./types";
import { assertsOutcome, isMetaText } from "./protocol";

/**
 * The assistant can describe the situation before a requested roll. A whole
 * tool-call turn is released only when we can exclude a clear outcome; when in
 * doubt, suppress it and show the server's neutral request instead.
 */
export function safeBeforeRoll(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || isMetaText(trimmed)) return "";
  // Bullets striking scenery describe the threat, not whether the player's
  // intended leap/attack succeeded. Bullets striking the PLAYER are different.
  const withoutEnvironmentalHits = trimmed.replace(/\b(?:as balas|os tiros)\s+atingem?\s+(?:a |o )?(?:parede|chão|muro|fachada)\b[^.!?]*(?:[.!?]|$)/gi, " ");
  if (assertsOutcome(withoutEnvironmentalHits)) return "";
  // Avoid publishing the AI's interpretation of the dice before any dice exist.
  if (/\b(?:voc[eê]|seu personagem)\b[^.!?\n]{0,100}\b(?:alcan[cç]a|atravessa|obt[eé]m|supera|vence|[ée] derrotad[oa])\b/i.test(trimmed)) return "";
  return trimmed;
}

/**
 * Defense-in-depth, NOT a rules engine. The server-side structured resolution
 * alone decides success/failure. Reject only unequivocal opposite verdicts.
 */
export function contradictsOfficialResult(text: string, resolution?: MatrixResolution | null): boolean {
  if (!resolution || resolution.kind === "free" || resolution.success === undefined) return false;
  const result = text.toLowerCase();
  const claimsSuccess = /\b(?:teste (?:foi|[ée]|deu) (?:um )?sucesso|você (?:conseguiu|consegue|acertou|acerta)|seu (?:ataque|teste) (?:acertou|deu certo)|ultrapassou o dm)\b/i.test(result);
  const claimsFailure = /\b(?:teste (?:foi|[ée]|deu) (?:uma )?falha|você (?:falhou|falha|errou|erra|não consegue|não conseguiu)|seu (?:ataque|teste) (?:falhou|errou))\b/i.test(result);
  return resolution.success ? claimsFailure && !claimsSuccess : claimsSuccess && !claimsFailure;
}

export function officialResultNotice(resolution: MatrixResolution): string {
  const verdict = resolution.success === true ? "SUCESSO" : resolution.success === false ? "FALHA" : "RESULTADO REGISTRADO";
  const target = resolution.target !== undefined ? ` frente ao alvo ${resolution.target}` : "";
  return `${resolution.label}: ${verdict}. ${resolution.selection} ${resolution.value}${target}. DM ${resolution.dmBefore} → ${resolution.dmAfter}. O resultado oficial foi registrado na ficha.`;
}
