import { readMatrixSession } from "@/lib/matrix/sessions";
import { MATRIX_SYSTEM_NAME, MATRIX_SUMMARY } from "@/lib/matrix/rulebook";
export const dynamic = "force-dynamic";
// Compatibility for existing clients: the fixed game never needs AI identification.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Conexão inválida." }, { status: 400 });
  const session = await readMatrixSession(id);
  if (!session) return Response.json({ error: "Mesa Matrix não encontrada." }, { status: 404 });
  return Response.json({ systemName: MATRIX_SYSTEM_NAME, systemSummary: MATRIX_SUMMARY });
}
