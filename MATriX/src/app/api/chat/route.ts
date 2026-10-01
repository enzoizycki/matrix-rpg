import { db } from "@/db";
import { games, characters, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildSystemPrompt, getCharacterTool, rollDiceTool, requestPlayerRollTool, consultRulebookTool, setCharacterTool } from "@/lib/gm";
import { rollDice } from "@/lib/dice";
import { searchRules } from "@/lib/rules";
import { AIError, toAIError } from "@/lib/ai-errors";
import { getActiveAI } from "@/lib/ai-config";
import { aiStream, promptBudget, trimMessages } from "@/lib/ai";
import type { AICall, AIMessage, AISession, AIToolResult, ToolDeclaration } from "@/lib/ai-types";
import { MATRIX_PAGES, MATRIX_RULES, MATRIX_RULES_TEXT, MATRIX_SYSTEM_NAME, MATRIX_SUMMARY, isMatrixGame } from "@/lib/matrix/rulebook";
import { recordPlayerTurn } from "@/lib/matrix/actions";
import { MORPHEUS_OPENING } from "@/lib/matrix/content";
import { explicitlyApproves, makeMatrixRequest, matrixNotation, mergeMatrixCharacter, missingCharacterFields } from "@/lib/matrix/mechanics";
import { assertsOutcome, isMetaText, playerDemandsRoll, protocolReminder } from "@/lib/matrix/protocol";
import { contradictsOfficialResult, officialResultNotice, safeBeforeRoll } from "@/lib/matrix/turn-guard";
import { promisesPlayerRoll, recoverPlayerRollRequest } from "@/lib/matrix/roll-fallback";
import type { MatrixRollRequest } from "@/lib/matrix/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const clean = (value: unknown) => typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
const cancelRollTool: ToolDeclaration = { name: "cancel_player_roll", description: "Cancela um pedido pendente SOMENTE se o jogador desistir da ação ou optar explicitamente por distorção/sucesso automático. Explique o motivo.", parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const gameId = Number(body?.gameId);
    if (!Number.isSafeInteger(gameId) || gameId < 1) return Response.json({ error: "Conexão inválida." }, { status: 400 });
    const text = clean(body.message);
    if (text.length > 12000) return Response.json({ error: "Divida sua mensagem em partes menores." }, { status: 400 });
    const rollId = body.diceResult?.rollId !== undefined ? Number(body.diceResult.rollId) : undefined;
    if (body.diceResult && (!rollId || !Number.isSafeInteger(rollId))) return Response.json({ error: "Use o resultado registrado pela bandeja de dados." }, { status: 400 });
    const turnId = clean(body.turnId).slice(0, 100) || crypto.randomUUID();
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    if (!game || !isMatrixGame(game)) return Response.json({ error: "Inicie uma nova mesa da edição Matrix. Os dados antigos não foram apagados.", code: "MATRIX_SESSION_REQUIRED" }, { status: 409 });
    const ai = await getActiveAI();
    if (!ai.configured) return Response.json({ error: "As regras de Matrix já estão carregadas. Conecte Gemini ou Ollama para conversar com Morpheus.", code: "AI_NOT_CONFIGURED" }, { status: 428 });
    const budget = promptBudget(ai);
    const approve = body.action === "approve_character";
    const recorded = await recordPlayerTurn({ gameId, turnId, text, rollId, approve });
    const character = recorded.character;
    const base: AIMessage[] = recorded.history.filter(row => ["user", "assistant"].includes(row.role)).map(row => row.role === "assistant" ? { role: "assistant", text: row.meta?.introduction === true ? MORPHEUS_OPENING : row.content } : { role: "user", text: row.content });
    if (!base.length || base[0].role !== "user") base.unshift({ role: "user", text: "Morpheus, vamos jogar Matrix com as regras incorporadas." });
    if (base.at(-1)?.role === "assistant") base.push({ role: "user", text: "Continue a conversa a partir daqui. As regras de Matrix já estão carregadas; ajude-me com a próxima escolha da ficha ou cena." });
    const conversation = trimMessages(base, budget.historyChars);
    const system = buildSystemPrompt({ profileId: game.masterProfile, rulesText: MATRIX_RULES_TEXT, gameTitle: game.title,
      systemName: MATRIX_SYSTEM_NAME, systemSummary: MATRIX_SUMMARY, characterName: character?.name || "", characterData: character?.data || {},
      hasCharacter: Boolean(character), characterComplete: Boolean(character?.complete), rulesChars: budget.rulesChars,
      pendingRoll: recorded.pending ? JSON.stringify(recorded.pending) : undefined });
    let working = character ? { name: character.name, data: character.data, complete: character.complete } : null;
    let pending: MatrixRollRequest | null = recorded.pending;
    const consent = approve || explicitlyApproves(text);
    const cancel = new AbortController();
    const signal = AbortSignal.any([req.signal, cancel.signal, AbortSignal.timeout(budget.turnTimeoutMs)]);
    const session: AISession = {};
    // A model must read the authoritative sheet before asking for a roll or changing it.
    let authoritativeRead = false;
    // A structured, matched request is the ONLY source of an official verdict.
    // Creating a request never sets rollResolvedThisCycle.
    const officialResolution = recorded.resolved?.resolution.kind !== "free" ? recorded.resolved?.resolution : undefined;
    const freeRollThisCycle = recorded.resolved?.resolution.kind === "free";
    const rollResolvedThisCycle = Boolean(officialResolution);
    const riskyAction = Boolean(character?.complete && playerDemandsRoll(text));
    let requestCreatedThisCycle = false;
    let protocolStrikes = 0;
    let preRollBuffer = "";
    let open = true;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => { if (open) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); };
        const heartbeat = setInterval(() => { if (open) controller.enqueue(encoder.encode(": keep-alive\n\n")); }, 10000);
        let finalText = "";
        let persisted = false;
        send({ type: "status", text: "Morpheus está preparando sua resposta..." });
        if (working) send({ type: "character", ...working });
        if (recorded.resolved) send({ type: "roll_resolved", ...recorded.resolved });
        if (recorded.autoRequest) {
          // This is a hard rule trigger, not a model suggestion: send it before narration.
          pending = recorded.autoRequest;
          send({ type: "pending", request: pending });
          send({ type: "roll_request", ...pending });
          const forced = `A pressão atravessa o código: o Dado da Matrix chegou a 5. O sistema exige um Teste de Humanidade imediato. Role ${pending.notation} e use o maior resultado; o alvo é o DM atual.`;
          send({ type: "text", text: forced });
          await db.insert(messages).values({ gameId, role: "assistant", content: forced, meta: { system: true, forcedHumanity: true, turnId } });
          send({ type: "done" });
          clearInterval(heartbeat); open = false; controller.close();
          return;
        }
        send({ type: "pending", request: pending });
        try {
          for (let iteration = 0; iteration < 9; iteration++) {
            signal.throwIfAborted();
            const calls: AICall[] = [];
            const raw: unknown[] = [];
            let turnText = "";
            for await (const event of aiStream(ai, { system, messages: conversation, tools: [getCharacterTool, requestPlayerRollTool, rollDiceTool, consultRulebookTool, setCharacterTool, cancelRollTool], signal, session })) {
              if (event.type === "raw") raw.push(event.raw);
              else if (event.type === "text") { turnText += event.text; }
              else calls.push(event.call);
            }
            if (!calls.length) {
              const draft = [preRollBuffer, turnText].filter(Boolean).join("\n\n").trim();
              if (isMetaText(draft)) {
                if (protocolStrikes++ === 0) {
                  conversation.push({ role: "user", text: protocolReminder("meta", { demandsRoll: riskyAction }) });
                  preRollBuffer = "";
                  continue;
                }
                finalText = "A transmissão sofreu uma interferência. Estou aqui. O que você faz?";
                send({ type: "text", text: finalText });
                break;
              }
              if (officialResolution && contradictsOfficialResult(draft, officialResolution)) {
                if (protocolStrikes++ === 0) {
                  conversation.push({ role: "user", text: `[RESULTADO OFICIAL — IMUTÁVEL] ${officialResultNotice(officialResolution)} Sua resposta anterior contrariou o veredito. Narre a consequência coerentemente, sem recalcular os dados.` });
                  preRollBuffer = "";
                  continue;
                }
                finalText = officialResultNotice(officialResolution);
                send({ type: "text", text: finalText });
                break;
              }
              // Text-only fallback is allowed ONLY for an explicit promise to
              // request dice. Never infer a roll merely from action verbs.
              if (promisesPlayerRoll(draft)) {
                const recovered = recoverPlayerRollRequest(text, draft, working?.data.matrix, pending);
                if (recovered) {
                  const fresh = !pending;
                  pending = recovered;
                  if (fresh) {
                    await db.insert(messages).values({ gameId, role: "user",
                      content: `[SISTEMA] Morpheus solicitou ${pending.notation} para ${pending.reason}. Aguarde o jogador.`,
                      meta: { system: true, matrixRequest: pending, requestRecovered: true } });
                  }
                  requestCreatedThisCycle = true;
                  send({ type: "roll_request", ...pending, recovered: fresh });
                  const safe = safeBeforeRoll(preRollBuffer);
                  if (safe) { finalText += safe + "\n\n"; send({ type: "text", text: safe + "\n\n" }); }
                  const notice = `${pending.reason}: role ${pending.notation} na bandeja. Eu aguardarei seu resultado.`;
                  finalText += notice;
                  send({ type: "text", text: notice });
                  break;
                }
              }
              // A very clear unrolled outcome after a risky player action is
              // defense-in-depth, not the rule engine. Morpheus still decides
              // whether an actual test is required.
              if (!rollResolvedThisCycle && !requestCreatedThisCycle && (riskyAction || freeRollThisCycle) && assertsOutcome(draft)) {
                if (protocolStrikes++ === 0) {
                  conversation.push({ role: "user", text: freeRollThisCycle
                    ? "[SISTEMA] O dado enviado foi LIVRE, sem pedido oficial. Não há SUCESSO/FALHA nem mudança de recursos. Pergunte para que serve ou conduza a cena sem atribuir resultado mecânico; se precisar de um teste, peça uma NOVA rolagem vinculada."
                    : protocolReminder("outcome", { demandsRoll: true }) });
                  preRollBuffer = "";
                  continue;
                }
                finalText = freeRollThisCycle ? "Essa foi uma rolagem livre; para que deseja usá-la?" : "Ainda não sabemos o resultado. Como você pretende agir diante desse risco?";
                send({ type: "text", text: finalText });
                break;
              }
              if (draft) { finalText += draft; send({ type: "text", text: draft }); }
              protocolStrikes = 0;
              break;
            }
            conversation.push({ role: "assistant", text: turnText, calls, raw });
            const results: AIToolResult[] = [];
            let stopForRoll = false;
            let successfulTool = false;
            for (const call of calls) {
              if (stopForRoll) {
                // Parallel calls after a request have no effects in this turn.
                results.push({ name: call.name, id: call.id, response: { error: "Aguardando a rolagem do jogador; esta ferramenta não foi executada." } });
                continue;
              }
              let response: Record<string, unknown>;
              try {
                if (call.name === "get_character") {
                  const [fresh] = await db.select().from(characters).where(eq(characters.gameId, gameId));
                  working = fresh ? { name: fresh.name, data: fresh.data, complete: fresh.complete } : null;
                  authoritativeRead = true;
                  successfulTool = true;
                  response = { name: working?.name || "Identidade em criação", data: working?.data || {}, complete: Boolean(working?.complete), source: "ficha autoritativa do servidor" };
                } else if (call.name === "roll_dice") {
                  const parsed = matrixNotation(call.args.notation);
                  const reason = clean(call.args.reason).slice(0, 500) || "Rolagem de Morpheus";
                  if (/^(dm|dado da matrix|rolar (o )?dm)$/i.test(reason)) throw new Error("O DM é um contador. Nunca role o Dado da Matrix.");
                  const result = rollDice(parsed.notation);
                  response = { ...result, reason };
                  successfulTool = true;
                  send({ type: "dice", ...result, reason, by: "gm" });
                  await db.insert(messages).values({ gameId, role: "user", content: `[ROLAGEM DE MORPHEUS] ${reason}: ${result.notation} = ${result.total}; faces [${result.rolls.join(", ")}].`, meta: { dice: true, by: "gm", ...result, reason } });
                } else if (call.name === "request_player_roll") {
                  if (officialResolution?.kind === "attribute" && officialResolution.success === false && call.args.kind === "damage") {
                    response = { error: "O ataque falhou segundo o resultado oficial. Não há rolagem de dano por esse ataque." };
                  } else if (!authoritativeRead) {
                    response = { error: "Protocolo: chame get_character primeiro para ler a ficha autoritativa; só então solicite a rolagem." };
                  } else if (pending) {
                    send({ type: "roll_request", ...pending }); stopForRoll = true;
                    requestCreatedThisCycle = true;
                    response = { error: "Já há uma rolagem pendente. Aguarde o jogador ou cancele explicitamente se ele mudou de ação.", pending };
                  } else {
                    pending = makeMatrixRequest(call.args, working?.data.matrix);
                    await db.insert(messages).values({ gameId, role: "user", content: `[SISTEMA] Morpheus solicitou ${pending.notation} para ${pending.reason}, tipo ${pending.kind}. Aguarde o jogador.`, meta: { system: true, matrixRequest: pending } });
                    requestCreatedThisCycle = true;
                    successfulTool = true;
                    send({ type: "roll_request", ...pending }); stopForRoll = true;
                    response = { ok: true, request: pending };
                  }
                } else if (call.name === "cancel_player_roll") {
                  if (pending) {
                    await db.insert(messages).values({ gameId, role: "user", content: `[SISTEMA] Rolagem cancelada: ${clean(call.args.reason).slice(0, 500)}`, meta: { system: true, answeredRequestId: pending.id } });
                    pending = null; send({ type: "pending", request: null });
                  }
                  response = { ok: true };
                } else if (call.name === "consult_rulebook") {
                  const section = MATRIX_RULES.find(item => item.id === call.args.sectionId);
                  const query = clean(call.args.query);
                  successfulTool = true;
                  send({ type: "consult", query: section?.title || query || "índice das regras" });
                  response = section ? { results: [{ sectionId: section.id, title: section.title, page: section.page, excerpt: section.text }] }
                    : query ? { results: searchRules(MATRIX_PAGES, query, budget.maxHits, budget.excerptChars) }
                    : { sections: MATRIX_RULES.map(item => ({ id: item.id, title: item.title })) };
                } else if (call.name === "set_character") {
                  if (!authoritativeRead) {
                    response = { error: "Protocolo: chame get_character primeiro para ler o estado atual antes de alterá-lo." };
                    results.push({ name: call.name, id: call.id, response });
                    continue;
                  }
                  const name = clean(call.args.name).slice(0, 100) || working?.name || "Identidade em criação";
                  const characterArgs = { ...call.args };
                  if (officialResolution) {
                    // Mechanical effects from this roll were committed by recordPlayerTurn.
                    // The model may describe them, but cannot overwrite or reapply them.
                    delete characterArgs.dm;
                    delete characterArgs.ph;
                    delete characterArgs.phMax;
                  }
                  if (freeRollThisCycle) {
                    // A free roll is not an official check and cannot retroactively
                    // change the sheet's numeric mechanical resources.
                    for (const key of ["dm", "ph", "phMax", "pd", "pdMax", "health", "shipHealth", "scrap"]) delete characterArgs[key];
                  }
                  const data = mergeMatrixCharacter(working?.data || {}, characterArgs);
                  const missing = missingCharacterFields(name, data.matrix);
                  const keepApproval = working?.complete && working.data.matrix?.path === data.matrix?.path;
                  const complete = (keepApproval || (consent && call.args.complete === true)) && missing.length === 0;
                  working = { name, data, complete };
                  const [exists] = await db.select({ id: characters.id }).from(characters).where(eq(characters.gameId, gameId));
                  if (exists) await db.update(characters).set(working).where(eq(characters.id, exists.id));
                  else await db.insert(characters).values({ gameId, ...working });
                  successfulTool = true;
                  send({ type: "character", ...working });
                  response = { ok: true, character: working, missing,
                    ...(!consent && call.args.complete === true ? { note: "Dados salvos, mas ficha ainda em criação: peça aprovação ao jogador." } : {}) };
                } else response = { error: "Ferramenta desconhecida." };
              } catch (error) {
                response = { error: error instanceof Error ? error.message.slice(0, 350) : "Não foi possível executar a ferramenta." };
              }
              results.push({ name: call.name, id: call.id, response });
            }
            conversation.push({ role: "tool", results });
            if (stopForRoll && pending) {
              // Only scene-setting known to be safe is retained. A sentence that
              // includes an outcome suppresses this entire segment.
              const safe = safeBeforeRoll([preRollBuffer, turnText].filter(Boolean).join("\n\n"));
              if (safe) { finalText += safe + "\n\n"; send({ type: "text", text: safe + "\n\n" }); }
              const notice = `${pending.reason}: role ${pending.notation} na bandeja. Eu aguardarei seu resultado.`;
              finalText += notice;
              send({ type: "text", text: notice });
              break; // requestCreatedThisCycle !== rollResolvedThisCycle
            }
            preRollBuffer += (preRollBuffer && turnText ? "\n\n" : "") + turnText;
            if (successfulTool) protocolStrikes = 0; // only an executed tool resets corrective attempts
          }
          if (!finalText.trim()) {
            const leftover = preRollBuffer.trim();
            finalText = leftover && !isMetaText(leftover) && !contradictsOfficialResult(leftover, officialResolution)
              && (rollResolvedThisCycle || (!riskyAction && !freeRollThisCycle) || !assertsOutcome(leftover))
              ? leftover
              : officialResolution ? officialResultNotice(officialResolution) : "Ainda estou com você. Como deseja continuar?";
            send({ type: "text", text: finalText });
          }
          await db.insert(messages).values({ gameId, role: "assistant", content: finalText, meta: { turnId } }); persisted = true;
          send({ type: "done" });
        } catch (error) {
          if (finalText.trim() && !persisted) await db.insert(messages).values({ gameId, role: "assistant", content: finalText, meta: { turnId, partial: true } }).catch(() => {});
          const failure = toAIError(error); send({ type: "error", text: failure.message, code: failure.code });
        } finally { clearInterval(heartbeat); if (open) { open = false; controller.close(); } }
      },
      cancel() { open = false; cancel.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    const failure = error instanceof AIError ? error : new AIError("Não foi possível responder nesta tentativa. Sua conexão permanece salva.", "SESSION_START_FAILED", 503);
    return Response.json({ error: failure.message, code: failure.code }, { status: failure.status });
  }
}
