// Matrix has an embedded rulebook. Startup never scans a PDF folder or calls an AI.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { bootstrapDatabase } = await import("./db/bootstrap");
    await bootstrapDatabase();
  } catch (error) {
    console.error("Não foi possível preparar o banco:", error instanceof Error ? error.name : "DatabaseError");
  }
}
