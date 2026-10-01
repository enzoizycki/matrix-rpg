import { test, expect } from "@playwright/test";
import { contradictsOfficialResult, officialResultNotice, safeBeforeRoll } from "@/lib/matrix/turn-guard";
import type { MatrixResolution } from "@/lib/matrix/types";

const success: MatrixResolution = { kind: "attribute", label: "Teste de Corpo", selection: "Maior dado", value: 5, target: 3, success: true, dmBefore: 3, dmAfter: 3, notes: [] };
const failure: MatrixResolution = { ...success, value: 1, success: false, dmAfter: 4 };

test("keeps scene-setting before the request; suppresses a mixed result or meta text conservatively", () => {
  const safe = "As balas marcam a parede atrás de você. O Agente se aproxima; o vão entre os prédios é grande. Se quiser saltar, faça um teste de Corpo.";
  expect(safeBeforeRoll(safe)).toBe(safe);
  const exactExample = "As balas atingem a parede atrás de você. O Agente está se aproximando e o vão entre os prédios é grande. Se quiser saltar, faça um teste de Corpo.";
  expect(safeBeforeRoll(exactExample)).toBe(exactExample);
  expect(safeBeforeRoll("As balas atingem você no peito. Role o dado.")).toBe("");
  expect(safeBeforeRoll("Faça um teste de Corpo. Você consegue alcançar o outro prédio.")).toBe("");
  expect(safeBeforeRoll("Antes de saber o resultado, você acerta o guarda.")).toBe("");
  expect(safeBeforeRoll("[SESSÃO ENCERRADA] Relatório de auditoria.")).toBe("");
});

test("only the structured verdict is authoritative; explicit opposite verdicts are stopped", () => {
  expect(contradictsOfficialResult("Você falhou no teste e não consegue atravessar.", success)).toBe(true);
  expect(contradictsOfficialResult("Você conseguiu, o teste foi um sucesso.", failure)).toBe(true);
  expect(contradictsOfficialResult("O teste foi um sucesso; o guarda recua.", success)).toBe(false);
  expect(contradictsOfficialResult("Você erra o golpe; o guarda dispara.", failure)).toBe(false);
  expect(contradictsOfficialResult("O guarda falhou, mas seu teste foi um sucesso.", success)).toBe(false);
  expect(contradictsOfficialResult("As balas marcam a parede. O agente observa você.", failure)).toBe(false);
  expect(contradictsOfficialResult("Você consegue entrar.", null)).toBe(false);
  expect(contradictsOfficialResult("Você consegue entrar.", { ...success, kind: "free" })).toBe(false);
});

test("fallback communicates the immutable official verdict without inventing narrative", () => {
  expect(officialResultNotice(failure)).toContain("FALHA");
  expect(officialResultNotice(failure)).toContain("DM 3 → 4");
  expect(officialResultNotice(success)).toContain("SUCESSO");
  expect(officialResultNotice(success)).toContain("alvo 3");
});
