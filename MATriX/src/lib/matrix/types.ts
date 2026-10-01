export const ATTRIBUTES = ["Corpo", "Mente", "Social"] as const;
export type MatrixAttribute = typeof ATTRIBUTES[number];
export type MatrixPath = "red" | "blue" | "real";
export const TEAMS = ["Ordeira", "Caótica", "Pirata"] as const;
export type MatrixTeam = typeof TEAMS[number];
export const FUNCTIONS = ["Agente", "Fantasma", "Sabotador"] as const;
export type MatrixFunction = typeof FUNCTIONS[number];
export const CREW_ROLES = ["Operador", "Capitão", "Engenheiro", "Atirador"] as const;
export type MatrixCrewRole = typeof CREW_ROLES[number];
export const PATH_LABELS: Record<MatrixPath, string> = { red: "Resgatado", blue: "Reconectado", real: "Mundo Real" };

export type MatrixState = {
  path?: MatrixPath;
  antecedent?: string;
  favored?: MatrixAttribute;
  team?: MatrixTeam;
  function?: MatrixFunction;
  crewRole?: MatrixCrewRole;
  scene: "matrix" | "real";
  health: number;
  maxHealth: number;
  dm: number;
  pd: number;
  pdMax: number;
  ph: number;
  phMax: number;
  motivation?: string;
  motivationUnderstood: boolean;
  chosen: boolean;
  dejaVu: boolean;
  firewall: boolean;
  humanityTestDue: boolean;
  scrap: number;
  ship?: string;
  shipHealth?: number;
  shipMaxHealth?: number;
};

export const ROLL_KINDS = ["attribute", "humanity", "damage", "real", "table", "chosen", "other"] as const;
export type MatrixRollKind = typeof ROLL_KINDS[number];
export type MatrixRollRequest = {
  id: string;
  notation: string;
  reason: string;
  kind: MatrixRollKind;
  attribute?: MatrixAttribute;
  opposition?: number;
  humanityPurpose?: "pressure" | "creativity" | "lie" | "event";
  failureDmCost?: number;
  createdAt: string;
};
export type MatrixResolution = {
  kind: MatrixRollKind | "free";
  label: string;
  selection: string;
  value: number;
  target?: number;
  success?: boolean;
  dmBefore: number;
  dmAfter: number;
  event?: string;
  notes: string[];
};
export type MatrixDiceResult = {
  rollId: number;
  notation: string;
  total: number;
  rolls: number[];
  modifier: number;
  detail: string;
  reason: string;
  requestId?: string;
  requested: boolean;
  matchedRequest: boolean;
};
export const baseMatrixState = (): MatrixState => ({
  scene: "matrix", health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5,
  ph: 0, phMax: 0, motivationUnderstood: false, chosen: false,
  dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0,
});
