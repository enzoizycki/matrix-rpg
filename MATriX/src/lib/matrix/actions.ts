import { db } from "@/db";
import { characters, messages, type Character } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { AIError } from "@/lib/ai-errors";
import { missingCharacterFields, pendingFromMessages, resolveMatrixRoll, stateResources } from "./mechanics";
import type { MatrixDiceResult, MatrixResolution, MatrixRollRequest } from "./types";

export async function recordPlayerTurn(input: { gameId: number; turnId: string; text: string; rollId?: number; approve: boolean }) {
  return db.transaction(async tx => {
    // Serialize state changes for this table; retries never apply DM/PH twice.
    await tx.execute(sql`select pg_advisory_xact_lock(${input.gameId})`);
    const history = await tx.select().from(messages).where(eq(messages.gameId, input.gameId)).orderBy(asc(messages.id));
    let [character] = await tx.select().from(characters).where(eq(characters.gameId, input.gameId));
    let resolved: { rollId: number; resolution: MatrixResolution } | undefined;
    let autoRequest: MatrixRollRequest | undefined;
    const seenTurn = history.some(row => row.role === "user" && row.meta?.turnId === input.turnId);

    if (input.rollId) {
      const already = history.find(row => row.meta?.sourceRollId === input.rollId);
      if (already) {
        // A retry with the SAME turnId can resume narration, but an old result
        // cannot be reinterpreted for a later action or request.
        if (already.meta?.turnId !== input.turnId) throw new AIError("Este dado já foi utilizado. Para outra ação, role novamente.", "ROLL_ALREADY_USED", 409);
        resolved = { rollId: input.rollId, resolution: already.meta?.resolution as MatrixResolution };
      } else {
        const [record] = await tx.select().from(messages).where(and(eq(messages.id, input.rollId), eq(messages.gameId, input.gameId)));
        if (!record?.meta?.rollRecord) throw new AIError("Esta rolagem não pertence à sua mesa. Role novamente na bandeja.", "ROLL_NOT_FOUND", 400);
        const dice = record.meta.result as MatrixDiceResult;
        const pendingBefore = pendingFromMessages(history);
        const request = pendingBefore && dice.requestId === pendingBefore.id && dice.matchedRequest ? pendingBefore : null;
        const beforeState = character?.data.matrix;
        const evaluated = resolveMatrixRoll(beforeState, dice, request);
        resolved = { rollId: input.rollId, resolution: evaluated.resolution };
        if (character && request) {
          const data = { ...character.data, matrix: evaluated.state, resources: stateResources(evaluated.state) };
          [character] = await tx.update(characters).set({ data }).where(eq(characters.id, character.id)).returning();
        }
        const official = Boolean(request && evaluated.resolution.kind !== "free");
        const r = evaluated.resolution;
        const content = official
          ? `[RESULTADO OFICIAL DO SISTEMA — DEFINITIVO]\nTeste: ${request!.reason} (${r.kind}${request!.attribute ? ` / ${request!.attribute}` : ""})\nResultado: ${r.success === true ? "SUCESSO" : r.success === false ? "FALHA" : "RESULTADO SEM COMPARAÇÃO DEFINIDA PELA REGRA"}\nResultado dos dados: [${dice.rolls.join(", ")}]. ${r.selection}: ${r.value}${r.target !== undefined ? `; alvo: ${r.target}` : ""}.\nDM antes: ${r.dmBefore}. DM depois: ${r.dmAfter}.${r.event ? `\nEvento: ${r.event}.` : ""}${r.notes.length ? `\nNotas: ${r.notes.join(" ")}` : ""}\nEste resultado já foi calculado pelo software e é definitivo. Narre as consequências do resultado. Não reavalie, altere ou substitua o resultado mecânico. As alterações da ficha JÁ foram persistidas; não as aplique outra vez.`
          : `[ROLAGEM LIVRE DO JOGADOR — SEM RESULTADO MECÂNICO OFICIAL]\nDados: ${dice.notation}, faces [${dice.rolls.join(", ")}], total ${dice.total}. Não atribua SUCESSO ou FALHA, não mude DM/PH/PD e não utilize este resultado retroativamente para uma ação. Se o jogador não explicou sua finalidade, pergunte a ele. Para um teste oficial, crie request_player_roll e aguarde uma NOVA rolagem vinculada ao pedido.`;
        const [row] = await tx.insert(messages).values({ gameId: input.gameId, role: "user",
          content,
          meta: { dice: true, ...dice, by: "player", sourceRollId: input.rollId, turnId: input.turnId,
            official, resolution: evaluated.resolution, ...(request ? { answeredRequestId: request.id } : {}) },
        }).returning();
        history.push(row);

        // Gatilho determinístico: DM 5 em Reconectado exige TH imediatamente.
        const crossedHumanityTrigger = request?.kind === "attribute"
          && evaluated.state.path === "blue"
          && !beforeState?.humanityTestDue
          && evaluated.state.humanityTestDue;
        if (crossedHumanityTrigger && !pendingFromMessages(history)) {
          autoRequest = {
            id: crypto.randomUUID(), notation: "2d6", kind: "humanity",
            reason: "Teste de Humanidade: o Dado da Matrix atingiu 5",
            humanityPurpose: "pressure", failureDmCost: 1, createdAt: new Date().toISOString(),
          };
          const [systemRow] = await tx.insert(messages).values({
            gameId: input.gameId, role: "user",
            content: `[SISTEMA] Gatilho obrigatório: DM atingiu 5 em Reconectado. Solicite imediatamente um Teste de Humanidade com 2d6, maior resultado ≥ DM.`,
            meta: { system: true, matrixRequest: autoRequest },
          }).returning();
          history.push(systemRow);
        }
      }
    }

    if (input.approve && !seenTurn) {
      const missing = missingCharacterFields(character?.name || "", character?.data.matrix);
      if (!character || missing.length) throw new AIError(`Antes de aprovar, falta definir: ${missing.join(", ")}. Continue a criação com Morpheus.`, "SHEET_INCOMPLETE", 400);
      [character] = await tx.update(characters).set({ complete: true }).where(eq(characters.id, character.id)).returning();
    }
    if ((input.text || input.approve) && !seenTurn) {
      const [row] = await tx.insert(messages).values({ gameId: input.gameId, role: "user",
        content: input.approve ? "Aprovo a ficha apresentada. Morpheus, vamos iniciar a aventura." : input.text,
        meta: { turnId: input.turnId, ...(input.approve ? { approvedSheet: true } : {}) },
      }).returning();
      history.push(row);
    }
    return { history, character: character as Character | undefined, pending: pendingFromMessages(history), resolved, autoRequest };
  });
}

export function requestFromMeta(value: unknown): MatrixRollRequest | undefined {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") return undefined;
  return value as MatrixRollRequest;
}
