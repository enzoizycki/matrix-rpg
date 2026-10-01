// Formato neutro de conversa: cada provedor (Gemini, Ollama) converte de/para ele.
export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AICall = { name: string; args: Record<string, unknown>; id?: string };
export type AIToolResult = { name: string; id?: string; response: Record<string, unknown> };

export type AIMessage =
  | { role: "user"; text: string }
  // `raw` guarda partes próprias do provedor que precisam voltar na próxima chamada
  // (assinaturas de raciocínio do Gemini, campo "thinking" do Ollama).
  | { role: "assistant"; text: string; calls?: AICall[]; raw?: unknown[] }
  | { role: "tool"; results: AIToolResult[] };

export type AIEvent =
  | { type: "text"; text: string }
  | { type: "call"; call: AICall }
  | { type: "raw"; raw: unknown };

/** Estado mantido durante um turno (o Gemini exige o mesmo modelo entre chamadas de ferramenta). */
export type AISession = { model?: string };
