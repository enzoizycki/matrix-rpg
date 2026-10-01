"use client";

import KeyLink from "@/components/KeyLink";

// Official create/view keys link: https://ai.google.dev/gemini-api/docs/api-key
export default function GeminiKeyLink() {
  return (
    <KeyLink
      url="https://aistudio.google.com/apikey"
      linkText="Criar chave no Google AI Studio"
      instructions="Entre com sua conta Google, escolha “Criar chave de API” (Create API key) e depois cole a chave no campo acima."
      addressLabel="Endereço para criar a chave Gemini"
      idPrefix="gemini-key"
    />
  );
}
