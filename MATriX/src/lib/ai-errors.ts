/** Erro de IA com código estável e mensagem já em português, segura para mostrar ao jogador. */
export class AIError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
    this.name = "AIError";
  }
}

export function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return new AIError("A IA demorou para responder. Sua conexão está salva; tente novamente.", "AI_TIMEOUT", 504);
  }
  return new AIError("Não foi possível conectar à IA. Sua conexão está salva; tente novamente.", "AI_UNAVAILABLE", 503);
}
