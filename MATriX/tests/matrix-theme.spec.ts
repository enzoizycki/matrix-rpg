import { test, expect, type Page } from "@playwright/test";
import { baseMatrixState } from "@/lib/matrix/types";
import { MATRIX_SYSTEM_NAME, MATRIX_SUMMARY } from "@/lib/matrix/rulebook";
const ID = 950001;
const state = { ...baseMatrixState(), path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira" };
const session = {
  game: { id: ID, ruleset: "matrix-artefato", title: "Sinal fantasma", masterProfile: "immersive", files: [], rulesChars: 30000, systemName: MATRIX_SYSTEM_NAME, systemSummary: MATRIX_SUMMARY },
  character: { name: "Kai", complete: true, data: { matrix: state, concept: "Resgatado em busca de respostas", equipment: "Casaco e telefone", background: "Liberto de uma usina." } },
  messages: [{ id: "welcome", role: "assistant", content: "A transmissão está segura. O que você faz?" }], pendingRequest: null,
};
async function open(page: Page, pending: unknown = null) {
  await page.route("**/api/settings", route => route.fulfill({ json: { configured: true, provider: "gemini", model: "gemini-flash-lite-latest" } }));
  await page.route(`**/api/games/${ID}`, route => route.fulfill({ json: { ...session, pendingRequest: pending } }));
  await page.addInitScript(id => sessionStorage.setItem("matrix.active-game", String(id)), ID);
  await page.goto("/"); await expect(page.getByRole("region", { name: "Bandeja de dados" })).toBeVisible();
}
test("Matrix shows a static DM counter, three affinities and only d6 controls", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("meter", { name: "Pressão da Matrix" })).toHaveAttribute("aria-valuenow", "3");
  await expect(page.getByLabel("Dado da Matrix")).toContainText("NÃO ROLAR");
  const tray = page.getByRole("region", { name: "Bandeja de dados" });
  for (const amount of [1, 2, 3, 6]) { await tray.getByRole("button", { name: `${amount}d6`, exact: true }).click(); await expect(tray.locator('[data-die-kind="d6"]')).toHaveCount(amount); }
  await expect(tray.getByRole("button", { name: "d20", exact: true })).toHaveCount(0);
  await expect(tray.getByRole("button", { name: "dF", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Afinidades")).toContainText("Corpo");
  expect(await page.locator("body").innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
});
test("d6 remains green/black with an animated roll and results sent by server record ID", async ({ page }) => {
  await open(page);
  let received: unknown;
  await page.route("**/api/roll", route => route.fulfill({ json: { rollId: 901, notation: "2d6", rolls: [2, 5], total: 7, modifier: 0, detail: "2d6[2, 5]", reason: "Rolagem livre", requested: false, matchedRequest: false } }));
  await page.route("**/api/chat", route => { received = route.request().postDataJSON().diceResult; return route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text","text":"Os dados chegaram."}\n\ndata: {"type":"done"}\n\n' }); });
  const tray = page.getByRole("region", { name: "Bandeja de dados" });
  const stage = tray.getByRole("group", { name: "Área de rolagem" });
  const shell = stage.locator(".matrix-die-shell").first();
  expect(await shell.evaluate(element => getComputedStyle(element).stroke)).toBe("rgb(64, 245, 138)");
  await tray.getByRole("button", { name: "Rolar 2d6", exact: true }).click();
  await expect(stage).toHaveAttribute("data-rolling", "true");
  await expect(tray.getByTestId("tray-total")).toHaveText("7");
  await tray.getByRole("button", { name: "Enviar resultado a Morpheus" }).click();
  await expect(page.getByText("Os dados chegaram.", { exact: true })).toBeVisible();
  expect(received).toEqual({ rollId: 901 });
});
test("reload keeps the same pending request and never rolls before the player's click", async ({ page }) => {
  await open(page);
  const pending = { id: "persistent-pending", notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Saltar a passarela", createdAt: new Date().toISOString() };
  let rolls = 0;
  await page.route("**/api/chat", route => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text","text":"O resultado foi registrado."}\n\ndata: {"type":"done"}\n\n' }));
  await page.route("**/api/roll", route => { rolls++; return route.fulfill({ json: { rollId: 910, notation: "2d6", rolls: [3, 5], total: 8, modifier: 0, detail: "2d6[3, 5]", reason: pending.reason, requestId: pending.id, requested: true, matchedRequest: true } }); });
  await page.route(`**/api/games/${ID}`, route => route.fulfill({ json: { ...session, pendingRequest: pending } }));
  await page.reload();
  const tray = page.getByRole("region", { name: "Bandeja de dados" });
  await expect(tray.getByText("Saltar a passarela", { exact: true })).toBeVisible();
  await expect(tray.getByRole("button", { name: "Rolar 2d6", exact: true })).toBeVisible();
  expect(rolls).toBe(0);
  await tray.getByRole("button", { name: "Rolar 2d6", exact: true }).click();
  await expect(tray.getByTestId("tray-total")).toHaveText("5");
  expect(rolls).toBe(1);
});

test("requested Matrix test previews selected face instead of sum and automatically sends", async ({ page }) => {
  const pending = { id: "req-1", notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Ataque", createdAt: new Date().toISOString() };
  await open(page, pending);
  await page.route("**/api/roll", route => route.fulfill({ json: { rollId: 902, notation: "2d6", rolls: [2, 5], total: 7, modifier: 0, detail: "2d6[2, 5]", requestId: "req-1", reason: "Ataque", requested: true, matchedRequest: true } }));
  await page.route("**/api/chat", route => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"pending","request":null}\n\ndata: {"type":"roll_resolved","rollId":902,"resolution":{"kind":"attribute","label":"Ataque","selection":"Maior dado","value":5,"success":true,"target":3,"dmBefore":3,"dmAfter":3,"notes":[]}}\n\ndata: {"type":"text","text":"Cinco supera o DM três. Você acertou."}\n\ndata: {"type":"done"}\n\n' }));
  const tray = page.getByRole("region", { name: "Bandeja de dados" });
  await tray.getByRole("button", { name: "Rolar 2d6", exact: true }).click();
  await expect(page.getByText("Cinco supera o DM três. Você acertou.", { exact: true })).toBeVisible();
  await expect(tray.getByTestId("tray-total")).toHaveText("5");
  await expect(page.getByLabel("Resultado da rolagem")).toContainText("Maior dado");
});
test("a draft Reconectado without a Function is not shown as having lost control", async ({ page }) => {
  await open(page);
  await page.route(`**/api/games/${ID}`, route => route.fulfill({ json: { ...session, character: { name: "Echo", complete: false, data: { matrix: { ...baseMatrixState(), path: "blue", dm: 2, ph: 0, phMax: 0, pd: 0, pdMax: 0 } } } } }));
  await page.reload();
  const sheet = page.getByRole("region", { name: "Ficha do personagem" });
  await expect(sheet).toContainText("Humanidade");
  await expect(sheet).not.toContainText("controle perdido");
  await expect(sheet).toContainText("Função (Agente, Fantasma ou Sabotador)");
});

test("reduced motion removes spinning while retaining the result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await open(page);
  await page.route("**/api/roll", route => route.fulfill({ json: { rollId: 903, notation: "2d6", rolls: [2, 5], total: 7, modifier: 0, detail: "2d6[2, 5]", reason: "Livre", requested: false, matchedRequest: false } }));
  const tray = page.getByRole("region", { name: "Bandeja de dados" }); await tray.getByRole("button", { name: "Rolar 2d6", exact: true }).click();
  const motion = tray.locator(".die-tumbling").first(); await expect(motion).toBeVisible();
  expect(await motion.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  await expect(tray.getByTestId("tray-total")).toHaveText("7");
});
