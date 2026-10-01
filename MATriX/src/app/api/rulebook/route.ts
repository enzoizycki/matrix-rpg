import { MATRIX_CHAPTERS, MATRIX_RULES, MATRIX_SYSTEM_NAME, MATRIX_VERSION } from "@/lib/matrix/rulebook";
export async function GET() {
  return Response.json({ state: "ready", source: "builtin", name: MATRIX_SYSTEM_NAME, version: MATRIX_VERSION,
    author: "Dan Aguiar / Artefato", chapters: MATRIX_CHAPTERS, sections: MATRIX_RULES });
}
export async function DELETE() {
  return Response.json({ error: "As regras de Matrix são parte desta edição e não podem ser removidas pela interface." }, { status: 405 });
}
