// Sem dependências de servidor: usado pelo navegador (ao colar) e pelo servidor (ao salvar).
export type ParsedKey = { key: string; problem?: "placeholder" };

// Textos de exemplo das documentações; nunca são uma chave de verdade.
const PLACEHOLDERS = [
  /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/,                                                    // $OLLAMA_API_KEY
  /^<[^>]*>$/, /^\[[^\]]*\]$/,                                                           // <sua-chave>
  /^(?:your|sua|seu|minha|my)[-_ ]?(?:ollama|gemini|google)?[-_ ]?(?:api)?[-_ ]?(?:key|chave|token)$/i, // YOUR_API_KEY
  /^(?:api[-_ ]?key|chave|token|key)$/i,
  /^(?:x{3,}|\*{3,}|\.{3,})$/i,
];

// O nome da variável precisa ser do tipo FOO_API_KEY (maiúsculas): chaves reais são misturadas
// e podem terminar em "=", então "abcDEF==" nunca é tratado como atribuição.
const ASSIGNMENT = /^\s*(?:export\s+|set\s+|\$env:)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN)[A-Z0-9_]*\s*=\s*(.+)$/m;
const BEARER = /Bearer\s+(\S+)/i;
const QUOTES = /^["'`“”‘’]+|["'`“”‘’]+$/g;

/**
 * Aceita a chave pura ou colada junto com o comando da documentação
 * (`export OLLAMA_API_KEY="..."`, `OLLAMA_API_KEY=...`, `Authorization: Bearer ...`),
 * remove aspas e espaços e recusa textos de exemplo como YOUR_API_KEY.
 */
export function parseApiKey(raw: string): ParsedKey {
  let text = (raw ?? "").replace(/\u0000/g, "").trim();
  if (!text) return { key: "" };
  const bearer = text.match(BEARER);
  const assignment = text.match(ASSIGNMENT);
  if (bearer) text = bearer[1];
  else if (assignment) text = assignment[1];
  text = text.replace(/[\s;\\]+$/, "").replace(QUOTES, "").replace(/\s+/g, "");
  if (PLACEHOLDERS.some(pattern => pattern.test(text))) return { key: "", problem: "placeholder" };
  return { key: text };
}

export const PLACEHOLDER_MESSAGE: Record<"gemini" | "ollama", string> = {
  gemini: "Isso é só o texto de exemplo da documentação. Cole a chave real, criada em aistudio.google.com/apikey.",
  ollama: "Isso é só o texto de exemplo da documentação (“YOUR_API_KEY”). Cole a chave real, criada em ollama.com/settings/keys.",
};
