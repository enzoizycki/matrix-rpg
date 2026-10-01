"use client";

import { useCallback, useEffect, useState } from "react";
import MatrixEntry from "@/components/MatrixEntry";
import MatrixRules from "@/components/MatrixRules";
import PlayStep from "@/components/PlayStep";
import AIKeyModal, { AIKeyButton, useAIStatus } from "@/components/AIKeyModal";
import type { GameSession } from "@/lib/types";
import { APIError, requestJSON } from "@/lib/http";

const SESSION_KEY = "matrix.active-game";

export default function Home() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const { status, setStatus } = useAIStatus();
  const closeConnection = useCallback(() => setKeyOpen(false), []);
  const closeRules = useCallback(() => setRulesOpen(false), []);

  const restore = useCallback(async () => {
    let id: string | null = null;
    try { id = sessionStorage.getItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
    if (!id || !/^\d+$/.test(id)) { setRestoring(false); return; }
    setRestoring(true); setRestoreError("");
    try {
      const saved = await requestJSON<GameSession>(`/api/games/${id}`, { signal: AbortSignal.timeout(12000) });
      if (saved.game.ruleset !== "matrix-artefato") throw new APIError("Mesa de outra edição.", "MATRIX_SESSION_REQUIRED", 404);
      setSession(saved);
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* No storage. */ }
      } else setRestoreError("Não foi possível reabrir a conexão. Sua ficha continua salva; tente novamente.");
    } finally { setRestoring(false); }
  }, []);
  useEffect(() => { void restore(); }, [restore]);

  function openSession(next: GameSession) {
    try { sessionStorage.setItem(SESSION_KEY, String(next.game.id)); } catch { /* Storage must not block play. */ }
    setSession(next);
  }
  function returnToEntry() {
    // Returning home does not delete the saved campaign.
    setSession(null);
  }
  const configured = status?.unreachable && !status.configured ? undefined : status?.configured;
  return <>
    {restoring ? <main className="mx-auto max-w-2xl px-4 py-24"><div role="status" className="term-panel p-6 text-[var(--gold)]">{"> reabrindo sua conexão..."}</div></main>
      : session ? <PlayStep key={session.game.id} game={session.game} initialMessages={session.messages} initialSheet={session.character} initialRequest={session.pendingRequest} aiStatus={status} connectionVersion={connectionVersion} onConnect={() => setKeyOpen(true)} onRules={() => setRulesOpen(true)} onExit={returnToEntry} />
      : <>
          <div className="max-w-3xl mx-auto px-4 pt-5 flex justify-between items-center gap-2"><span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">THE CONSTRUCT // MATRIX RPG</span><AIKeyButton status={status} onClick={() => setKeyOpen(true)} /></div>
          {restoreError && <div role="alert" className="max-w-3xl mx-auto p-4 text-amber-200 text-sm"><p>{restoreError}</p><button type="button" onClick={() => void restore()} className="mt-2 underline">Reabrir conexão salva</button></div>}
          <ResumeButton onResume={() => void restore()} />
          <MatrixEntry onStarted={openSession} aiConfigured={configured} onConnect={() => setKeyOpen(true)} onRules={() => setRulesOpen(true)} />
        </>}
    <MatrixRules open={rulesOpen} onClose={closeRules} />
    <AIKeyModal open={keyOpen} status={status} onClose={closeConnection} onSaved={next => { setStatus(next); setConnectionVersion(value => value + 1); }} />
  </>;
}
function ResumeButton({ onResume }: { onResume: () => void }) {
  const [hasSaved, setHasSaved] = useState(false);
  useEffect(() => { try { setHasSaved(Boolean(sessionStorage.getItem(SESSION_KEY))); } catch { /* No storage. */ } }, []);
  return hasSaved ? <div className="max-w-3xl mx-auto px-4 pt-3 text-right"><button type="button" onClick={onResume} className="text-xs text-[var(--gold-soft)] underline underline-offset-4">Retomar minha conexão salva</button></div> : null;
}
