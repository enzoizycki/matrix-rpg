import type { CharacterData } from "@/db/schema";
import type { MatrixResolution, MatrixRollRequest } from "@/lib/matrix/types";

export type GameInfo = {
  id: number; title: string; masterProfile: string;
  files: { name: string; chars: number }[];
  rulesChars: number; pageCount?: number; systemName?: string; systemSummary?: string;
  ruleset?: "matrix-artefato";
};

// Kept only to type legacy modules; the active app never loads uploaded rulebooks.
export type RulebookStatus = {
  state: "none" | "indexing" | "ready" | "error";
  source?: "folder" | "upload"; id?: number; name?: string;
  files?: { name: string; chars: number }[]; pageCount?: number; systemName?: string; error?: string;
};
export type ChatMessage = {
  id: string; role: "user" | "assistant"; content: string; note?: string;
  dice?: {
    notation: string; total: number; detail: string; reason: string; rolls?: number[];
    by?: "gm" | "player"; animate?: boolean; resolution?: MatrixResolution;
  };
};
export type GameSession = {
  game: GameInfo;
  character: { name: string; data: CharacterData; complete: boolean } | null;
  messages: ChatMessage[];
  pendingRequest?: MatrixRollRequest | null;
};
export type { CharacterData };
