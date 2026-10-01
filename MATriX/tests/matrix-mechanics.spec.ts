import { test, expect } from "@playwright/test";
import { explicitlyApproves, makeMatrixRequest, matrixNotation, mergeMatrixCharacter, missingCharacterFields, pendingFromMessages, resolveMatrixRoll } from "@/lib/matrix/mechanics";
import { baseMatrixState, type MatrixRollRequest, type MatrixState } from "@/lib/matrix/types";
import { MATRIX_RULES, MATRIX_PAGES, MATRIX_RULES_TEXT } from "@/lib/matrix/rulebook";
import { searchRules } from "@/lib/rules";

const red = (): MatrixState => ({ ...baseMatrixState(), path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira" });
const blue = (): MatrixState => ({ ...baseMatrixState(), path: "blue", dm: 2, antecedent: "Hacker", favored: "Mente", function: "Agente", pd: 0, pdMax: 0, ph: 3, phMax: 3 });
const roll = (faces: number[], modifier = 0) => ({ notation: `${faces.length}d6${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ""}`, rolls: faces, modifier, total: faces.reduce((sum, item) => sum + item, modifier) });
const request = (kind: MatrixRollRequest["kind"], extra: Partial<MatrixRollRequest> = {}): MatrixRollRequest => ({ id: "test-request", kind, reason: "Teste", notation: "2d6", attribute: "Corpo", createdAt: new Date().toISOString(), ...extra });

test("Resgatado: maior na afinidade, menor fora dela; nunca usa a soma", () => {
  const good = resolveMatrixRoll(red(), roll([2, 5]), request("attribute"));
  expect(good.resolution).toMatchObject({ value: 5, selection: "Maior dado", success: true, target: 3, dmAfter: 3 });
  const bad = resolveMatrixRoll(red(), roll([2, 5]), request("attribute", { attribute: "Mente" }));
  expect(bad.resolution).toMatchObject({ value: 2, selection: "Menor dado", success: false, dmAfter: 4 });
  expect(bad.state.dm).toBe(4);
});

test("Reconectado: menor na afinidade, maior fora dela; sucesso menor ou igual DM", () => {
  const good = resolveMatrixRoll(blue(), roll([1, 6]), request("attribute", { attribute: "Mente" }));
  expect(good.resolution).toMatchObject({ value: 1, selection: "Menor dado", success: true, dmAfter: 2 });
  const bad = resolveMatrixRoll(blue(), roll([1, 6]), request("attribute"));
  expect(bad.resolution).toMatchObject({ value: 6, selection: "Maior dado", success: false, dmAfter: 3 });
});

test("pressão: falha não ultrapassa DM6 e cruzar DM5 sinaliza TH", () => {
  expect(resolveMatrixRoll({ ...red(), dm: 6 }, roll([1, 2]), request("attribute")).state.dm).toBe(6);
  const state = resolveMatrixRoll({ ...blue(), dm: 4 }, roll([5, 6]), request("attribute"));
  expect(state.state).toMatchObject({ dm: 5, ph: 3, humanityTestDue: true });
});

test("TH usa sempre o maior >= DM, recupera PH e cobra falha de pressão apenas uma vez", () => {
  const result = resolveMatrixRoll({ ...blue(), dm: 5, ph: 2, humanityTestDue: true }, roll([1, 6]), request("humanity", { humanityPurpose: "pressure" }));
  expect(result.resolution).toMatchObject({ value: 6, success: true });
  expect(result.state).toMatchObject({ ph: 3, dm: 5, humanityTestDue: false });
  const failed = resolveMatrixRoll({ ...blue(), dm: 5, humanityTestDue: true }, roll([1, 2]), request("humanity", { humanityPurpose: "pressure" }));
  expect(failed.state).toMatchObject({ ph: 2, dm: 5, humanityTestDue: false });
});

test("Trinity compara as faces com o DM anterior e preserva cada efeito", () => {
  const expected = [5, 3, 3, 4, 5, 6];
  for (let dm = 1; dm <= 6; dm++) {
    const result = resolveMatrixRoll({ ...red(), dm }, roll([dm, dm]), request("attribute"));
    expect(result.state.dm).toBe(expected[dm - 1]);
    expect(result.resolution.event).toContain(`Trinity`);
  }
  expect(resolveMatrixRoll({ ...red(), dm: 3 }, roll([3, 3]), request("attribute")).state.dejaVu).toBe(true);
  expect(resolveMatrixRoll({ ...red(), dm: 5 }, roll([5, 5]), request("attribute")).state.firewall).toBe(true);
  expect(resolveMatrixRoll({ ...red(), dm: 4 }, roll([3, 3]), request("attribute")).resolution.event).toBeUndefined();
});

test("Vet x3 usa a tabela dos Reconectados, não Trinity", () => {
  for (const [dm, after] of [[1, 2], [2, 2], [3, 3], [4, 4], [5, 4], [6, 4]]) {
    const result = resolveMatrixRoll({ ...blue(), dm }, roll([dm, dm]), request("attribute"));
    expect(result.resolution.event).toContain("Vet x3");
    expect(result.state.dm).toBe(after);
  }
});

test("Mundo Real soma 3d6 mais bônus e mostra diferença; empate é decisão de mesa", () => {
  const state = { ...red(), path: "real" as const, scene: "real" as const };
  const success = resolveMatrixRoll(state, roll([2, 4, 5]), request("real", { notation: "3d6", opposition: 9 }));
  expect(success.resolution).toMatchObject({ value: 11, success: true, target: 9, selection: "Soma" });
  expect(success.resolution.notes.join(" ")).toContain("2 de dano");
  const tie = resolveMatrixRoll(state, roll([2, 4, 5]), request("real", { notation: "3d6", opposition: 11 }));
  expect(tie.resolution.success).toBeUndefined();
  expect(tie.resolution.notes.join(" ")).toContain("Empate");
});

test("não permite d20/Fate/DM no rolador Matrix nem soma modificada em teste de atributo", () => {
  for (const invalid of ["1d20", "4dF", "DM", "2d6+3 lixo", "0d6", "100d6", "1d6+101"]) expect(() => matrixNotation(invalid)).toThrow();
  expect(matrixNotation("D6").notation).toBe("1d6");
  expect(matrixNotation("3d6 + 2")).toEqual({ count: 3, modifier: 2, notation: "3d6+2" });
  expect(() => makeMatrixRequest({ notation: "2d6+2", kind: "attribute", attribute: "Corpo", reason: "Ataque" }, red())).toThrow("sem modificador");
  expect(() => makeMatrixRequest({ notation: "1d6+1", kind: "damage", reason: "Pistola" }, blue())).toThrow("fixo");
});

test("Escolhido exige motivação compreendida e a sequência completa; não pode ser concedido pelo modelo", () => {
  expect(() => makeMatrixRequest({ notation: "6d6", kind: "chosen", reason: "Oráculo" }, red())).toThrow("motivação compreendida");
  const state = { ...red(), motivation: "A vida de quem você ama...", motivationUnderstood: true };
  const req = makeMatrixRequest({ notation: "6d6", kind: "chosen", reason: "Oráculo" }, state);
  expect(resolveMatrixRoll(state, roll([6, 1, 4, 2, 5, 3]), req).state.chosen).toBe(true);
  expect(resolveMatrixRoll(state, roll([1, 2, 3, 4, 5, 5]), req).state.chosen).toBe(false);
  expect(mergeMatrixCharacter({ matrix: red() }, { chosen: true }).matrix?.chosen).toBe(false);
});

test("ficha respeita as reservas de cada caminho, limites e perdas permanentes", () => {
  const a = mergeMatrixCharacter({}, { path: "red", antecedent: "Hacker", favored: "Mente", team: "Pirata" });
  expect(a.matrix).toMatchObject({ dm: 3, health: 5, pd: 5, pdMax: 5 });
  expect(a.attributes).toEqual({ Corpo: "Sem afinidade", Mente: "Afinidade", Social: "Sem afinidade" });
  const b = mergeMatrixCharacter({}, { path: "blue", function: "Fantasma" });
  expect(b.matrix).toMatchObject({ dm: 2, health: 5, pd: 0, ph: 4, phMax: 4 });
  const c = mergeMatrixCharacter(b, { phMax: 2, ph: 9 });
  expect(c.matrix).toMatchObject({ ph: 2, phMax: 2 });
  expect(mergeMatrixCharacter(c, { phMax: 4 }).matrix?.phMax).toBe(2);
  expect(mergeMatrixCharacter(a, { pdMax: 4, pd: 5, health: 10, dm: 10 }).matrix).toMatchObject({ pd: 4, pdMax: 4, health: 5, dm: 6 });
  expect(missingCharacterFields("Kai", a.matrix)).toEqual([]);
  expect(missingCharacterFields("Kai", b.matrix)).toContain("antecedente");
});

test("rolagem livre não muda o DM nem a reserva sem um teste identificado", () => {
  const original = blue();
  const result = resolveMatrixRoll(original, roll([6, 6]), null);
  expect(result.resolution.kind).toBe("free");
  expect(result.state).toEqual(original);
});

test("pedidos pendentes sobrevivem a leitura do histórico e somem após resposta", () => {
  const req = request("attribute");
  expect(pendingFromMessages([{ meta: { matrixRequest: req } }])).toEqual(req);
  expect(pendingFromMessages([{ meta: { matrixRequest: req } }, { meta: { answeredRequestId: req.id } }])).toBeNull();
});

test("base incorporada cobre quatro partes, créditos, tabelas e ambiguidades", () => {
  for (const chapter of [1, 2, 3, 4]) expect(MATRIX_RULES.some(section => section.chapter === chapter)).toBe(true);
  for (const term of ["Dan Aguiar", "Wachowski", "Pontos de Distorção", "Teste de Humanidade", "Trinity", "Vet x3", "Batalhóides", "Naves de Transcodificação", "Manobra evasiva", "O Escolhido"]) expect(MATRIX_RULES_TEXT).toContain(term);
  expect(MATRIX_RULES.find(section => section.id === "adaptation")?.text).toContain("decisões");
  expect(searchRules(MATRIX_PAGES, "Humanidade Reconectado").some(hit => hit.excerpt.includes("Humanidade"))).toBe(true);
  expect(MATRIX_RULES.find(section => section.id === "ship-combat")?.text).toContain("1d6+4");
});


test("negative or quoted approvals never finalize the character; temporary benefits cannot be invented", () => {
  for (const phrase of ["Aprovo!", "Eu aprovo a ficha.", "confirmo a ficha"]) expect(explicitlyApproves(phrase)).toBe(true);
  for (const phrase of ["não aprovo", "Eu não aprovo a ficha", "Você disse: aprovo", "Aprovo, mas quero mudar tudo", "talvez"]) expect(explicitlyApproves(phrase)).toBe(false);
  const supplied = mergeMatrixCharacter({ matrix: red() }, { dejaVu: true, firewall: true });
  expect(supplied.matrix).toMatchObject({ dejaVu: false, firewall: false });
  const consumed = mergeMatrixCharacter({ matrix: { ...red(), dejaVu: true, firewall: true } }, { dejaVu: false, firewall: false });
  expect(consumed.matrix).toMatchObject({ dejaVu: false, firewall: false });
});
