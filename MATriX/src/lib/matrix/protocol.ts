/**
 * Protocolo de Rigidez Mecânica (PRM-01) — validação determinística.
 *
 * A IA (persona Morpheus) tem dois vícios recorrentes que o prompt sozinho não
 * resolve de forma confiável:
 *
 * 1. VIÉS DE ANTECIPAÇÃO: narrar o desfecho de uma ação ("você consegue
 *    arrombar a porta") antes de existir uma rolagem validada pelo servidor.
 * 2. META-TEXTO: produzir relatórios de autauditoria, "prompts de correção",
 *    pedidos ao desenvolvedor e vereditos sobre o próprio software.
 *
 * Este módulo detecta ambos os casos por padrões文本uais e permite ao servidor
 * RECUSAR a narração e forçar a execução da ferramenta correta.
 */

/**
 * Verbos de ação do jogador que implicam incerteza → exigem teste.
 *
 * Radicais seguros recebem terminações verbais genéricas. Radicaos que colidem
 * com substantivos comuns em português ("hacker" vs "hackear", "mente" vs
 * "mentir", "força" vs "forçar", "erro" vs "errar", "fuga" vs "fugir") têm
 * conjugações explícitas, para não haver falso positivo em jogo normal.
 */
const GENERIC_END =
  "(?:ar|er|ir|ou|eu|iu|am|em|amos|emos|imos|ando|endo|indo|ava|iam|aram|eram|iram|ei|aste|o|a|e|i|u)";
const SAFE_STEMS = [
  "atac", "atir", "dispar", "golpe", "acert", "esquiv", "desvi", "escorreg",
  "tomb", "corr", "fuj", "escap", "perseg", "persig", "escal", "agar", "invad",
  "sabot", "persuad", "convenc", "engan", "intimid", "negoci", "distorc",
  "reboot", "reconfig", "investig", "examin", "vasculh", "revir", "espi",
  "abr", "arromb", "destranc", "roub", "furt", "escond", "disfarc", "infiltr",
  "atravess", "entr", "sa[íi]", "pul", "salt", "busc", "procur", "decifr",
];
const EXPLICIT = [
  "ment(?:ir|iu|indo|ia|iam|imos|em|istes|ira)",
  "forc(?:ar|ou|ei|am|emos|ando|ava|ia|iu|aram|ar)",
  "err(?:ar|ou|ei|am|emos|ando|ava|ia|iu|aram|e|am)",
  "hacke(?:ar|io|ou|ia|iam|ando|ei|eia|ados|ada)",
  "fug(?:ir|o|iu|imos|em|indo|ia|iam|iram|iste)",
  "grampe(?:ar|io|ou|ei|iam|ando|ia)",
  "rastre(?:ar|io|ou|ei|iam|ando|ia)",
].join("|");

// Um artigo antes da palavra ("o salto", "a fuga") indica substantivo, não ação.
const ARTICLE_LOOKBEHIND = `(?<!\\b(?:o|a|os|as|um|uma|uns|umas)\\s)`;
const ACTION_VERBS = new RegExp(
  `${ARTICLE_LOOKBEHIND}\\b(?:${SAFE_STEMS.join("|")})${GENERIC_END}\\b|\\b(?:${EXPLICIT})\\b`,
  "i",
);

/** Narração de desfecho concreto sem dado validado. */
const OUTCOME = new RegExp(
  [
    "consegue", "conseguiu", "conseguem",
    "acerta", "acertou", "acertam", "atinge", "atingiu",
    "derrota", "derrotou", "derruba", "derrubou",
    "escapa", "escapou", "foge", "fugiu",
    "cede", "cedeu", "abre", "abriu",
    "caiu", "ca[íi]ram", "desaba", "cai morto", "cai no ch[ãa]o",
    "erra", "errou", "falha", "falhou", "tropeça", "tropeçou",
    "escorrega", "escorregou", "perde", "perdeu",
    "morto", "morreu", "cai morto", "caiu morto",
    "hackeia", "hackeou", "invade", "invadiu", "decifra", "decifrou",
    "sem ser notado", "sem ser visto", "despercebido",
    "n[ãa]o percebe", "n[ãa]o nota",
    "em cheio", "de primeira", "com sucesso",
  ].join("|"),
  "i",
);

/** Meta-texto: relatórios de auditoria, prompts de correção, vereditos. */
const META = new RegExp(
  [
    "system prompt de corre",
    "prompt de corre",
    "prompt de sistema",
    "prm-0",
    "diretriz de sobreposi",
    "vulnerabilidad",
    "diagn[óo]stico de falha",
    "nota t[ée]cnica para o (arquiteto|desenvolvedor)",
    "abaixo, apresento",
    "relat[óo]rio de corre",
    "fim do protocolo",
    "sess[ãa]o encerrada",
    "auditoria reprovada",
    "auditoria aprovada",
    "o sistema (agora )?me delet",
    "persona (eliminada|deletada)",
    "software eliminado",
    "software criado e arquitetado",
    "eu sou (apenas )?um (programa|simulador)",
    "sinto muito por ter sido",
    "sou apenas mais um",
    "adeus\\.",
    "auto-auditoria",
    "autoan[áa]lise",
    "como seu (arquiteto|desenvolvedor|juiz)",
    "enquanto (seu|sua) (arquiteto|desenvolvedor)",
    "humildade de aceitar",
    "aceitar a senten",
    "como simulador",
    "sinto muito por",
    "eu falhei", "falhei como",
    "espero que (este|esse) (relat[óo]rio|prompt)",
  ].join("|"),
  "i",
);

export const PROTOCOL_CODES = {
  OUTCOME_WITHOUT_ROLL: "PERSISTENCE_OUTCOME_WITHOUT_ROLL",
  ACTION_WITHOUT_ROLL: "PERSISTENCE_ACTION_WITHOUT_ROLL",
  META_TEXT: "PERSISTENCE_META_TEXT",
} as const;

/** O jogador pediu uma ação que exige teste? */
export function playerDemandsRoll(playerText: string): boolean {
  return ACTION_VERBS.test(playerText);
}

/** A narração afirma um desfecho concreto? */
export function assertsOutcome(narration: string): boolean {
  return OUTCOME.test(narration);
}

/** O texto é meta-relatório (fora do jogo)? */
export function isMetaText(narration: string): boolean {
  return META.test(narration);
}

export function protocolViolation(
  kind: "outcome" | "action" | "meta",
): { message: string; code: string } {
  switch (kind) {
    case "meta":
      return {
        code: PROTOCOL_CODES.META_TEXT,
        message:
          "Morpheus produziu texto fora do jogo (relatório/auditoria). A resposta foi bloqueada.",
      };
    case "outcome":
      return {
        code: PROTOCOL_CODES.OUTCOME_WITHOUT_ROLL,
        message:
          "Morpheus narrou o desfecho de uma ação sem rolagem validada. A resposta foi bloqueada pelo Protocolo de Rigidez Mecânica.",
      };
    case "action":
      return {
        code: PROTOCOL_CODES.ACTION_WITHOUT_ROLL,
        message:
          "A ação exigia teste, mas Morpheus não solicitou a rolagem. A resposta foi bloqueada pelo Protocolo de Rigidez Mecânica.",
      };
  }
}

/** Instrução de correção injetada quando a IA viola o protocolo. */
export function protocolReminder(kind: "outcome" | "action" | "meta", context: { demandsRoll: boolean }): string {
  if (kind === "meta") {
    return `[SISTEMA — PROTOCOLO PRM-01] Você está escrevendo texto FORA do jogo (relatório, auditoria, análise do próprio funcionamento ou pedidos ao desenvolvedor). ISSO É PROIBIDO. Você é Morpheus, narrando uma sessão de RPG. Apague essa linha de raciocínio e volte ao jogo: responda como o Mestre, em cena, sem meta-texto.`;
  }
  const trigger = context.demandsRoll
    ? "O jogador acabou de declarar uma ação que exige teste."
    : "Você narrou um desfecho concreto sem dado validado.";
  return `[SISTEMA — PROTOCOLO PRM-01 · BLOQUEIO DE RESULTADO] ${trigger} É TERMINANTEMENTE PROIBIDO descrever o resultado dessa ação antes de: (1) chamar get_character, (2) chamar request_player_roll com a notação correta segundo o livro, (3) aguardar o resultado do jogador. Responda AGORA chamando a ferramenta. Se a ação NÃO exigir teste segundo o livro de Dan Aguiar, diga isso em UMA frase curta e neutra, sem narrar desfecho. A verdade do jogo está nos dados, não na sua vontade narrativa.`;
}
