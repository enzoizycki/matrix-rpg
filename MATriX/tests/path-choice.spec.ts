import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { db } from "@/db";
import { characters, games, messages } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { MORPHEUS_OPENING } from "@/lib/matrix/content";
import { baseMatrixState, PATH_LABELS, type MatrixPath } from "@/lib/matrix/types";
import { buildSystemPrompt } from "@/lib/gm";

const ids: number[] = [];
const sse = (text: string) => `data: ${JSON.stringify({ type: "text", text })}\n\ndata: {"type":"done"}\n\n`;

async function createGame(page: Page) {
  const response = await page.request.post("/api/games", { data: { title: "__path_choice_regression__", masterProfile: "immersive" } });
  expect(response.status()).toBe(201);
  const session = await response.json();
  ids.push(session.game.id);
  return session;
}

async function openGame(page: Page, id: number) {
  await page.route("**/api/settings", route => route.fulfill({ json: { configured: true, provider: "gemini", model: "gemini-flash-lite-latest" } }));
  await page.addInitScript(gameId => sessionStorage.setItem("matrix.active-game", String(gameId)), id);
  await page.goto("/");
  await expect(page.getByLabel("Mensagem para Morpheus")).toBeVisible();
}

async function expectTextChoicesOnly(page: Page) {
  const opening = page.locator("main article").filter({ hasText: "Sou Morpheus." });
  await expect(opening).toHaveCount(1);
  for (const label of ["🔴 Pílula Vermelha", "🔵 Pílula Azul", "🌍 Mundo Real"]) await expect(opening).toContainText(label);
  const conversation = await page.locator("main").innerText();
  for (const emoji of ["🔴", "🔵", "🌍"]) expect(conversation.split(emoji).length - 1).toBe(1);
  await expect(page.getByLabel("Escolher caminho")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pílula Vermelha|Pílula Azul|Mundo Real/ })).toHaveCount(0);
}

test.afterAll(async () => { if (ids.length) await db.delete(games).where(inArray(games.id, ids)); });

test("the three choices appear once as plain opening text with the requested emojis", async ({ page }) => {
  const session = await createGame(page);
  expect(session.messages[0].content).toBe(MORPHEUS_OPENING);
  await openGame(page, session.game.id);
  await expectTextChoicesOnly(page);
});

for (const [label, choice] of [
  ["red pill", "Escolho a pílula vermelha."],
  ["blue pill", "Escolho a pílula azul."],
  ["real world", "Quero jogar no mundo real."],
]) {
  test(`${label}: text replies do not append cards even before the character tool records the path`, async ({ page }) => {
    const session = await createGame(page);
    const sent: string[] = [];
    await page.route("**/api/chat", route => {
      sent.push(route.request().postDataJSON().message);
      const response = sent.length === 1 ? "Entendido. Qual será seu codinome?" : "Kai, me conte sua vida antes de despertar.";
      // Deliberately omit a character event to reproduce the original repeated-card bug.
      return route.fulfill({ contentType: "text/event-stream", body: sse(response) });
    });
    await openGame(page, session.game.id);
    await page.getByLabel("Mensagem para Morpheus").fill(choice);
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText("Entendido. Qual será seu codinome?", { exact: true })).toBeVisible();
    await expectTextChoicesOnly(page);
    await page.getByLabel("Mensagem para Morpheus").fill("Meu codinome é Kai.");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText("Kai, me conte sua vida antes de despertar.", { exact: true })).toBeVisible();
    await expectTextChoicesOnly(page);
    expect(sent).toEqual([choice, "Meu codinome é Kai."]);
  });
}

test("reopening an older session updates only the introductory presentation, preserving its sheet and history", async ({ page }) => {
  const session = await createGame(page);
  const id = session.game.id;
  const oldOpening = "Sou Morpheus. Introdução antiga. • Pílula Vermelha • Pílula Azul • Mundo Real";
  await db.update(messages).set({ content: oldOpening }).where(and(eq(messages.gameId, id), sql`${messages.meta}->>'introduction' = 'true'`));
  await db.insert(messages).values([
    { gameId: id, role: "user", content: "Escolho a pílula azul. Meu nome é Echo." },
    { gameId: id, role: "assistant", content: "Echo, vamos definir seu antecedente." },
  ]);
  await db.insert(characters).values({ gameId: id, name: "Echo", complete: false, data: { matrix: { ...baseMatrixState(), path: "blue", dm: 2, ph: 0, phMax: 0, pd: 0, pdMax: 0 } } });
  await openGame(page, id);
  await expectTextChoicesOnly(page);
  await expect(page.getByText("Echo, vamos definir seu antecedente.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ficha do personagem" })).toContainText("Reconectado");
  await page.reload();
  await expectTextChoicesOnly(page);
  const saved = await (await page.request.get(`/api/games/${id}`)).json();
  expect(saved.character).toMatchObject({ name: "Echo", data: { matrix: { path: "blue", dm: 2 } } });
  const stored = await db.select().from(messages).where(and(eq(messages.gameId, id), sql`${messages.meta}->>'introduction' = 'true'`));
  expect(stored[0].content).toBe(oldOpening); // Presentation compatibility does not rewrite the history.
});

test("Morpheus is instructed to respect the chosen path and record text choices without asking again", () => {
  const options = {
    profileId: "immersive", gameTitle: "Test", rulesText: "", systemName: "Matrix", systemSummary: "Matrix RPG",
    characterName: "Kai", hasCharacter: true, characterComplete: false,
  };
  for (const path of ["red", "blue", "real"] as MatrixPath[]) {
    const prompt = buildSystemPrompt({ ...options, characterData: { matrix: { ...baseMatrixState(), path } } });
    expect(prompt).toContain(`Caminho já definido: ${PATH_LABELS[path]} (${path})`);
    expect(prompt).toContain("Não ofereça as três opções novamente");
    expect(prompt).toContain("Só altere o caminho se o jogador pedir explicitamente");
  }
  const prompt = buildSystemPrompt({ ...options, hasCharacter: false, characterData: {} });
  expect(prompt).toContain("se o jogador já escolheu, registre imediatamente o caminho com set_character e avance");
  expect(prompt).toContain("não por botões");
  expect(prompt).toContain("Uma dúvida ou comparação não altera o caminho");
});

test("the plain-text path explanation remains readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await createGame(page);
  await openGame(page, session.game.id);
  await expectTextChoicesOnly(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel("Mensagem para Morpheus")).toBeInViewport();
});
