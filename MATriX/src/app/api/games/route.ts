import { db } from "@/db";
import { games, messages } from "@/db/schema";
import { getProfile } from "@/lib/profiles";
import { MATRIX_PAGES, MATRIX_RULES_TEXT, MATRIX_SUMMARY, MATRIX_SYSTEM_NAME } from "@/lib/matrix/rulebook";
import { MORPHEUS_OPENING } from "@/lib/matrix/content";
import { readMatrixSession } from "@/lib/matrix/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// This installation has one built-in game. No file, identification call or external rulebook is needed.
export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Esta edição é dedicada a Matrix. As regras já estão incorporadas; inicie uma nova conexão, sem enviar PDF.", code: "BUILT_IN_GAME" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.replace(/\u0000/g, "").trim().slice(0, 120) : "";
  const profile = getProfile(typeof body.masterProfile === "string" ? body.masterProfile : "immersive");
  try {
    const id = await db.transaction(async tx => {
      const [game] = await tx.insert(games).values({ title: title || "Siga o coelho branco", masterProfile: profile.id,
        rulesText: MATRIX_RULES_TEXT, pages: MATRIX_PAGES, files: [], systemName: MATRIX_SYSTEM_NAME,
        systemSummary: MATRIX_SUMMARY, rulebookId: null }).returning({ id: games.id });
      await tx.insert(messages).values([
        { gameId: game.id, role: "user", content: "Morpheus, apresente as regras do Matrix RPG incorporado e me ajude a criar o personagem, uma escolha por vez.", meta: { system: true, opening: true } },
        { gameId: game.id, role: "assistant", content: MORPHEUS_OPENING, meta: { introduction: true } },
      ]);
      return game.id;
    });
    return Response.json(await readMatrixSession(id), { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível salvar sua conexão. Tente novamente.", code: "SESSION_CREATE_FAILED" }, { status: 503 });
  }
}
