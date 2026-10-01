"use client";

import KeyLink from "@/components/KeyLink";
import { OLLAMA_KEYS_URL } from "@/lib/ai-constants";

// Documentação: https://docs.ollama.com/cloud
export default function OllamaKeyLink() {
  return (
    <KeyLink
      url={OLLAMA_KEYS_URL}
      linkText="Criar chave no Ollama"
      instructions="Entre (ou crie uma conta) em ollama.com, abra as configurações de chaves, crie uma chave de API e cole-a no campo acima."
      addressLabel="Endereço para criar a chave do Ollama"
      idPrefix="ollama-key"
    />
  );
}
