import { db } from "@/db";
import { characters, games, messages, type Game } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { MATRIX_SYSTEM_ID, isMatrixGame } from "./rulebook";
import { pendingFromMessages } from "./mechanics";
import { MORPHEUS_OPENING } from "./content";
import type { ChatMessage, GameInfo, GameSession } from "@/lib/types";
import type { MatrixResolution } from "./types";

export function gameInfo(game: Game): GameInfo {
  return { id: game.id, title: game.title, masterProfile: game.masterProfile, files: [],
    ruleset: MATRIX_SYSTEM_ID, rulesChars: game.rulesText.length, systemName: game.systemName,
    systemSummary: game.systemSummary, pageCount: (game.pages || []).length };
}

export async function readMatrixSession(id: number): Promise<GameSession | null> {
  const [game] = await db.select().from(games).where(eq(games.id, id));
  if (!game || !isMatrixGame(game)) return null;
  const [character] = await db.select().from(characters).where(eq(characters.gameId, id));
  const history = await db.select().from(messages).where(eq(messages.gameId, id)).orderBy(asc(messages.id));
  const visible: ChatMessage[] = history
    .filter(row => ["user", "assistant"].includes(row.role) && !row.meta?.system)
    .map(row => {
      const meta = row.meta;
      return { id: String(row.id), role: row.role as "user" | "assistant", content: row.role === "assistant" && meta?.introduction === true ? MORPHEUS_OPENING : row.content,
        ...(meta?.dice && typeof meta.notation === "string" && typeof meta.total === "number" ? {
          dice: { notation: meta.notation, total: meta.total, detail: String(meta.detail || ""), reason: String(meta.reason || "Rolagem"),
            rolls: Array.isArray(meta.rolls) ? meta.rolls as number[] : [], by: meta.by === "gm" ? "gm" as const : "player" as const,
            animate: false, resolution: meta.resolution as MatrixResolution | undefined },
        } : {}) };
    });
  return { game: gameInfo(game), character: character ? { name: character.name, data: character.data, complete: character.complete } : null,
    messages: visible, pendingRequest: pendingFromMessages(history) };
}
