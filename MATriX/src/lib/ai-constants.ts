// Valores compartilhados entre servidor e navegador (sem dependências de servidor).
export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";

export const OLLAMA_CLOUD_URL = "https://ollama.com";
export const OLLAMA_LOCAL_URL = "http://localhost:11434";
export const OLLAMA_KEYS_URL = "https://ollama.com/settings/keys";
export const DEFAULT_CLOUD_MODEL = "gpt-oss:120b";

// Janela de contexto pedida ao Ollama. O padrão do Ollama é pequeno e ele descarta o
// começo do texto em silêncio, então o sistema sempre envia um valor explícito.
export const DEFAULT_LOCAL_NUM_CTX = 16384;
export const DEFAULT_CLOUD_NUM_CTX = 32768;
export const NUM_CTX_OPTIONS = [8192, 16384, 32768, 65536];
