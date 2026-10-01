"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJSON } from "@/lib/http";
import type { RulebookStatus } from "@/lib/types";

/** Acompanha o livro fixo. Enquanto ele está sendo indexado, consulta de tempos em tempos. */
export function useRulebook() {
  const [status, setStatus] = useState<RulebookStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await requestJSON<RulebookStatus>("/api/rulebook", { signal: AbortSignal.timeout(10_000) });
      setStatus(next);
      return next;
    } catch {
      // Sem resposta: mantém o último estado; na primeira carga, libera o envio manual.
      setStatus(previous => previous ?? { state: "none" });
      return null;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const indexing = status?.state === "indexing";
  useEffect(() => {
    if (!indexing) return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [indexing, refresh]);

  return { status, refresh };
}
