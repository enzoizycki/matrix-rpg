import { db } from "@/db";
import { games, messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { rollDice } from "@/lib/dice";
import { matrixNotation, pendingFromMessages } from "@/lib/matrix/mechanics";
import { isMatrixGame } from "@/lib/matrix/rulebook";
import type { MatrixDiceResult } from "@/lib/matrix/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const gameId = Number(body.gameId);
    if (!Number.isSafeInteger(gameId) || gameId < 1) return Response.json({ error: "Abra uma mesa Matrix antes de rolar os dados." }, { status: 400 });
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    if (!game || !isMatrixGame(game)) return Response.json({ error: "Mesa Matrix não encontrada." }, { status: 404 });
    const parsed = matrixNotation(body.notation);
    const history = await db.select().from(messages).where(eq(messages.gameId, gameId)).orderBy(asc(messages.id));
    const pending = pendingFromMessages(history);
    const requested = Boolean(pending && body.requestId === pending.id);
    const result = rollDice(parsed.notation);
    const data: Omit<MatrixDiceResult, "rollId"> = { ...result,
      reason: requested ? pending!.reason : "Rolagem livre do jogador",
      ...(requested ? { requestId: pending!.id } : {}), requested,
      matchedRequest: Boolean(requested && matrixNotation(pending!.notation).notation === parsed.notation),
    };
    const [record] = await db.insert(messages).values({ gameId, role: "tool", content: "Rolagem registrada na bandeja.", meta: { rollRecord: true, result: data } }).returning({ id: messages.id });
    return Response.json({ ...data, rollId: record.id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 250) : "Não foi possível rolar. Tente novamente." }, { status: 400 });
  }
}
