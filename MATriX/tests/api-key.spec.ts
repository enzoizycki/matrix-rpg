import { test, expect } from "@playwright/test";
import { parseApiKey } from "@/lib/api-key";

const REAL = "3f9b2c7a1d8e4f60a5b7c9d1e2f3a4b5.Qr7Zx-Lm_9pT2vNw";

test("chave pura continua igual, inclusive com espaços, quebras de linha e caracteres comuns em chaves", () => {
  expect(parseApiKey(REAL)).toEqual({ key: REAL });
  expect(parseApiKey(`  ${REAL}\n`)).toEqual({ key: REAL });
  expect(parseApiKey("abc123\n.def456")).toEqual({ key: "abc123.def456" }); // quebra de linha ao copiar
  expect(parseApiKey("")).toEqual({ key: "" });
  expect(parseApiKey("   ")).toEqual({ key: "" });
});

test("chave terminada em '=' (base64) nunca é confundida com 'VARIAVEL=valor'", () => {
  for (const key of ["abcDEF123==", "AbC=", "Zm9vYmFy+/9a=", "MixedCase_with_underscore=="]) {
    expect(parseApiKey(key), key).toEqual({ key });
  }
});

test("extrai a chave do comando da documentação (export, .env, PowerShell, cmd, Bearer)", () => {
  const cases: [string, string][] = [
    [`export OLLAMA_API_KEY="${REAL}"`, REAL],
    [`export OLLAMA_API_KEY='${REAL}'`, REAL],
    [`export OLLAMA_API_KEY=${REAL}`, REAL],
    [`OLLAMA_API_KEY=${REAL}`, REAL],
    [`  OLLAMA_API_KEY = "${REAL}"  `, REAL],
    [`export GEMINI_API_KEY="${REAL}";`, REAL],
    [`$env:OLLAMA_API_KEY="${REAL}"`, REAL],
    [`set OLLAMA_API_KEY=${REAL}`, REAL],
    [`Authorization: Bearer ${REAL}`, REAL],
    [`-H "Authorization: Bearer ${REAL}" \\`, REAL],
    [`“${REAL}”`, REAL],                                   // aspas tipográficas
    [`export OLLAMA_API_KEY="${REAL}"\n\ncurl https://ollama.com/api/chat`, REAL], // comando + curl
  ];
  for (const [input, expected] of cases) expect(parseApiKey(input), input).toEqual({ key: expected });
});

test("textos de exemplo da documentação são recusados, nunca tratados como chave", () => {
  const examples = [
    'export OLLAMA_API_KEY="YOUR_API_KEY"', "YOUR_API_KEY", "your_api_key", "YOUR-API-KEY", "Your API Key",
    "YOUR_OLLAMA_API_KEY", "sua chave", "SUA_CHAVE", "<sua-chave>", "[API_KEY]", "API_KEY", "xxxxxxxx", "...", "***",
    "$OLLAMA_API_KEY", "${OLLAMA_API_KEY}", 'Authorization: Bearer $OLLAMA_API_KEY', '-H "Authorization: Bearer $OLLAMA_API_KEY"',
  ];
  for (const example of examples) expect(parseApiKey(example), example).toEqual({ key: "", problem: "placeholder" });
});
