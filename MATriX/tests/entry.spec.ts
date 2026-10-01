import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { db } from "@/db";
import { games } from "@/db/schema";
import { inArray } from "drizzle-orm";
const ids: number[] = [];
const offline = { configured: false, model: "gemini-flash-lite-latest", provider: "gemini" };
const connected = { ...offline, configured: true };
const reply = (text: string) => `data: ${JSON.stringify({ type: "text", text })}\r\n\r\ndata: {"type":"done"}\r\n\r\n`;
async function status(page: Page, ready = false) { await page.route("**/api/settings", route => route.fulfill({ json: ready ? connected : offline })); }
async function enter(page: Page) { await page.goto("/"); await page.getByRole("button", { name: "Entrar na Matrix", exact: true }).click(); await expect(page.getByRole("heading", { name: /Morpheus/ }).first()).toBeVisible(); }
test.beforeEach(async ({ page }) => { page.on("response", async response => { if (response.url().endsWith("/api/games") && response.request().method() === "POST" && response.status() === 201) { const session = await response.json().catch(() => null); if (session?.game.id) ids.push(session.game.id); } }); });
test.afterAll(async () => { if (ids.length) await db.delete(games).where(inArray(games.id, ids)); });

test("entry has Morpheus introduction then ASCII, credits and no upload", async ({ page }) => {
  await status(page); await page.goto("/");
  await expect(page.getByRole("heading", { name: /MORPHEUS/ }).first()).toBeVisible();
  await expect(page.getByLabel("Introdução de Morpheus")).toContainText("Meu nome é Morpheus");
  await expect(page.getByLabel("Arte ASCII Matrix")).toContainText("M O R P H E U S");
  expect(await page.getByLabel("Introdução de Morpheus").evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('pre[aria-label="Arte ASCII Matrix"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText("Dan Aguiar /", { exact: false })).toBeVisible();
});

test("rules are locally readable and searchable without an AI key", async ({ page }) => {
  await status(page); await page.goto("/"); await page.getByRole("button", { name: "Ler as regras", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Buscar nas regras").fill("Trinity");
  await expect(dialog.getByRole("heading", { name: "Trinity: os dois dados e o DM", exact: true })).toBeVisible();
  await dialog.getByLabel("Buscar nas regras").fill("");
  await dialog.getByRole("button", { name: "O Oráculo", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Motivações e O Escolhido" })).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar regras" }).click();
});

test("one click creates Matrix with embedded rules and an opening message without calling AI", async ({ page, request }) => {
  await status(page);
  let aiRequests = 0;
  page.on("request", request => { if (request.url().endsWith("/api/chat") || request.url().endsWith("/identify")) aiRequests++; });
  await enter(page);
  await expect(page.getByText("Qual caminho você escolhe", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar IA e continuar" })).toBeVisible();
  expect(aiRequests).toBe(0);
  const id = await page.evaluate(() => sessionStorage.getItem("matrix.active-game"));
  const saved = await (await request.get(`/api/games/${id}`)).json();
  expect(saved.game.ruleset).toBe("matrix-artefato");
  expect(saved.game.files).toEqual([]);
  expect(saved.game.rulesChars).toBeGreaterThan(20000);
  expect(saved.messages[0].content).toContain("Sou Morpheus");
});

test("refresh and returning to the entry preserve the existing connection", async ({ page }) => {
  await status(page); await enter(page);
  const id = await page.evaluate(() => sessionStorage.getItem("matrix.active-game"));
  await page.reload();
  await expect(page.getByLabel("Mensagem para Morpheus")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("matrix.active-game"))).toBe(id);
  await page.getByRole("button", { name: "Voltar à entrada sem apagar a mesa" }).click();
  await page.getByRole("button", { name: "Retomar minha conexão salva" }).click();
  await expect(page.getByLabel("Mensagem para Morpheus")).toBeVisible();
});

test("connecting resumes the queued choice without recreating the game", async ({ page }) => {
  let ready = false; let count = 0; const sent: string[] = [];
  await page.route("**/api/settings", route => { if (route.request().method() === "POST") ready = true; return route.fulfill({ json: ready ? connected : offline }); });
  await page.route("**/api/chat", route => { sent.push(route.request().postDataJSON().message); return route.fulfill({ contentType: "text/event-stream", body: reply("A pílula vermelha. Diga-me seu codinome.") }); });
  page.on("request", req => { if (req.url().endsWith("/api/games") && req.method() === "POST") count++; });
  await enter(page);
  await page.getByLabel("Mensagem para Morpheus").fill("Escolho a Pílula Vermelha. Quero ser um Resgatado.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Chave da API Gemini").fill("integration-test-placeholder-not-secret");
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(page.getByText("A pílula vermelha. Diga-me seu codinome.", { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1); expect(sent[0]).toContain("Resgatado"); expect(count).toBe(1);
});

test("HTTP chat errors are visible and retry keeps the same turn id", async ({ page }) => {
  await status(page, true); const turns: string[] = [];
  await page.route("**/api/chat", route => { turns.push(route.request().postDataJSON().turnId); return turns.length === 1 ? route.fulfill({ status: 503, json: { error: "Transmissão indisponível.", code: "AI_UNAVAILABLE" } }) : route.fulfill({ contentType: "text/event-stream", body: reply("Conexão restabelecida. Vamos continuar.") }); });
  await enter(page); await page.getByLabel("Mensagem para Morpheus").fill("Quero ser um Resgatado."); await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Transmissão indisponível");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Conexão restabelecida. Vamos continuar.", { exact: true })).toBeVisible();
  expect(turns).toHaveLength(2); expect(turns[0]).toBe(turns[1]);
});

test("interrupted stream does not leave the composer locked", async ({ page }) => {
  await status(page, true);
  await page.route("**/api/chat", route => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text","text":"Sua identidade..."}\n\n' }));
  await enter(page); await page.getByLabel("Mensagem para Morpheus").fill("Meu nome é Kai."); await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("interrompida");
  await expect(page.getByLabel("Mensagem para Morpheus")).toBeEnabled();
});

test("new session creation does not accept PDF imports", async ({ request }) => {
  const response = await request.post("/api/games", { multipart: { title: "PDF campaign" } });
  expect(response.status()).toBe(400); expect((await response.json()).code).toBe("BUILT_IN_GAME");
});

test("Matrix home, rules and mobile dice drawer fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await status(page); await enter(page);
  await page.getByRole("button", { name: "Abrir dados" }).click();
  await expect(page.getByRole("region", { name: "Bandeja de dados" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Fechar dados" }).click();
  await page.getByRole("button", { name: "Consultar regras de Matrix" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
