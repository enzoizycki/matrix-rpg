import { test, expect } from "@playwright/test";
import { baseMatrixState, type MatrixRollRequest, type MatrixState } from "@/lib/matrix/types";
import { promisesPlayerRoll, recoverPlayerRollRequest } from "@/lib/matrix/roll-fallback";

const red: MatrixState = { ...baseMatrixState(), path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira" };
const blue: MatrixState = { ...baseMatrixState(), path: "blue", dm: 2, ph: 4, phMax: 4, pd: 0, pdMax: 0, function: "Fantasma", antecedent: "Hacker", favored: "Mente" };

test("risky action with a saved character opens the right 2d6 request without rolling", () => {
  const request = recoverPlayerRollRequest("Ataco o guarda", "Você já o derrotou!", red, null);
  expect(request).toMatchObject({ kind: "attribute", notation: "2d6", attribute: "Corpo" });
  expect(request?.id).toBeTruthy();
  expect(request).not.toHaveProperty("rolls");
  expect(request).not.toHaveProperty("success");
});

test("Hacker risk is a Mente test, social persuasion is Social, and blue Humanity uses its own rule", () => {
  expect(recoverPlayerRollRequest("Hackeio o terminal", "Conseguiu", red, null)).toMatchObject({ kind: "attribute", notation: "2d6", attribute: "Mente" });
  expect(recoverPlayerRollRequest("Tento persuadir o agente", "Ele acreditou", red, null)).toMatchObject({ kind: "attribute", notation: "2d6", attribute: "Social" });
  expect(recoverPlayerRollRequest("Quero preservar minha Humanidade", "Vou solicitar o teste de Humanidade", blue, null)).toMatchObject({ kind: "humanity", notation: "2d6" });
});

test("Morpheus explicitly promises a team roll during creation: one d6 table request", () => {
  expect(promisesPlayerRoll("Vou solicitar sua rolagem de 1d6. Aguarde o pedido do sistema.")).toBe(true);
  expect(recoverPlayerRollRequest("Quero sortear minha equipe", "Vou solicitar sua rolagem de 1d6. Aguarde o pedido do sistema.", undefined, null)).toMatchObject({ kind: "table", notation: "1d6" });
  expect(recoverPlayerRollRequest("Quero sortear minha equipe", "Posso explicar as equipes, se quiser.", undefined, null)).toBeNull();
});

test("existing pending request retains its ID; ordinary rules explanation does not invent a roll", () => {
  const request: MatrixRollRequest = { id: "existing", notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Teste", createdAt: new Date().toISOString() };
  expect(recoverPlayerRollRequest("Ataco novamente", "Você acerta", red, request)).toBe(request);
  expect(promisesPlayerRoll("Os testes normalmente utilizam dois dados de seis lados.")).toBe(false);
  expect(recoverPlayerRollRequest("Como são os testes?", "Os testes normalmente utilizam dois dados de seis lados.", undefined, null)).toBeNull();
});
