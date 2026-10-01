import { db } from "@/db";
import { games } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MASTER_PROFILES } from "@/lib/profiles";
import { readMatrixSession } from "@/lib/matrix/sessions";
import { isMatrixGame } from "@/lib/matrix/rulebook";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Conexão inválida." }, { status: 400 });
  try {
    const session = await readMatrixSession(id);
    if (!session) return Response.json({ error: "Esta mesa não pertence à edição Matrix. Seus dados antigos não foram apagados; inicie uma nova conexão para jogar com as regras incorporadas.", code: "MATRIX_SESSION_REQUIRED" }, { status: 404 });
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Não foi possível reabrir sua conexão. Tente novamente." }, { status: 503 }); }
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Conexão inválida." }, { status: 400 });
  try {
    const body = await req.json();
    if (!MASTER_PROFILES.some(profile => profile.id === body.masterProfile)) return Response.json({ error: "Estilo inválido." }, { status: 400 });
    const [game] = await db.select().from(games).where(eq(games.id, id));
    if (!game || !isMatrixGame(game)) return Response.json({ error: "Mesa Matrix não encontrada." }, { status: 404 });
    await db.update(games).set({ masterProfile: body.masterProfile }).where(eq(games.id, id));
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "Não foi possível alterar o estilo." }, { status: 503 }); }
}
