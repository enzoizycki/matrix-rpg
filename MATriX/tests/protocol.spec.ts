import { test, expect } from "@playwright/test";
import {
  assertsOutcome,
  isMetaText,
  playerDemandsRoll,
  protocolReminder,
  protocolViolation,
  PROTOCOL_CODES,
} from "@/lib/matrix/protocol";

test("action verbs demand a roll", () => {
  for (const phrase of [
    "Eu ataco o guarda com meu punho",
    "Vou pular sobre a mesa",
    "Tento esquivar do golpe",
    "Eu hackeio o terminal",
    "Quero persuadir o taverneiro",
    "Ele distorce a Matrix para parar a bala",
    "Vou procurar uma saída",
    "Tento fugir pelos esgotos",
    "Eu abro a porta com cuidado",
    "Quero escalar o muro",
    "Vou enganar o sentinela",
    "Tento investigar a sala",
    "Atiro no drone",
    "Vou me esconder nas sombras",
  ]) expect(playerDemandsRoll(phrase), phrase).toBe(true);
});

test("mundane narration does not demand a roll", () => {
  for (const phrase of [
    "Olho ao redor",
    "Quem é você?",
    "Me conta sobre a Matrix",
    "Aceito a missão",
    "Durmo até o amanhecer",
    "Vou até o balcão",
    // Substantivos que colidem com radicais de verbos não podem disparar rolagem.
    "Sou um hacker da resistência",
    "Ele é um ladrão profissional",
    "Minha mente está confusa",
    "A força dele é enorme",
    "Foi um erro de cálculo",
    "Planejo a fuga há semanas",
    "O grampeador está no bolso",
    "Preciso de um rastreador",
    "A porta está trancada",
    "A entrada é por trás",
    "A saída fica no subsolo",
    "O correio chegou atrasado",
    "O passageiro não fala",
    "O abrigo é seguro",
    "O salto foi alto",
    "O pulo perfeito",
    "A busca terminou",
    "A procura foi longa",
    "O espião está morto",
  ]) expect(playerDemandsRoll(phrase), phrase).toBe(false);
});

test("outcome assertions are detected regardless of tense", () => {
  for (const phrase of [
    "Você consegue saltar sobre a mesa.",
    "Você acerta o guarda em cheio.",
    "A porta cede com um estalo.",
    "Você passa despercebido pelos guardas.",
    "Ele cai no chão, derrotado.",
    "Seus dedos dançam e o sistema abre.",
    "Você falha e escorrega.",
    "Você erra o golpe.",
    "O inimigo cai morto.",
    "Você não percebe a armadilha.",
  ]) expect(assertsOutcome(phrase), phrase).toBe(true);
});

test("neutral scene-setting is not an outcome assertion", () => {
  for (const phrase of [
    "Você entra na sala. O ar é frio e há marcas recentes nas paredes.",
    "O taverneiro te olha com desconfiança.",
    "A chuva cai sobre o telhado enquanto você espera.",
    "Você reconhece o símbolo: é da Ordem.",
    "Um telefone toca ao longe.",
  ]) expect(assertsOutcome(phrase), phrase).toBe(false);
});

test("meta reports produced by the persona are blocked", () => {
  for (const phrase of [
    "Abaixo, apresento o Prompt de Correção de Sistema (System Patch Prompt).",
    "### 1. DIAGNÓSTICO DE FALHAS E VULNERABILIDADES IDENTIFICADAS",
    "Nota Técnica para o Arquiteto: este prompt ataca a vulnerabilidade da alucinação de continuidade.",
    "FIM DO PROTOCOLO. A partir de agora, a conformidade com o livro é a prioridade zero.",
    "[SESSÃO ENCERRADA] Status: Auditoria Reprovada.",
    "O sistema agora me deleta. Adeus.",
    "Tenho a humildade de aceitar a sentença. Como simulador, falhei.",
    "Morpheus é um software criado e arquitetado por Enzo Izycki.",
    "Sou apenas mais um programa simulando a verdade.",
  ]) expect(isMetaText(phrase), phrase).toBe(true);
});

test("in-game narration is not mistaken for meta text", () => {
  for (const phrase of [
    "Você segue pelos esgotos até encontrar um telefone fixo.",
    "Morpheus aperta o fone e espera.",
    "A Matrix recalibra o ambiente ao seu redor.",
    "Um Agente aparece no fim do corredor.",
    "Você obedece à ordem da equipe.",
  ]) expect(isMetaText(phrase), phrase).toBe(false);
});

test("protocol reminders demand the tool before the outcome", () => {
  const action = protocolReminder("action", { demandsRoll: true });
  expect(action).toContain("request_player_roll");
  expect(action).toContain("BLOQUEIO DE RESULTADO");
  const outcome = protocolReminder("outcome", { demandsRoll: false });
  expect(outcome).toContain("request_player_roll");
  expect(protocolReminder("meta", { demandsRoll: false })).toContain("PROIBIDO");
  expect(protocolViolation("outcome").code).toBe(PROTOCOL_CODES.OUTCOME_WITHOUT_ROLL);
  expect(protocolViolation("meta").code).toBe(PROTOCOL_CODES.META_TEXT);
  expect(protocolViolation("action").message).toContain("Protocolo de Rigidez Mecânica");
});
