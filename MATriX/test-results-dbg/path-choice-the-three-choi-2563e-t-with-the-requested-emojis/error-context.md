# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: path-choice.spec.ts >> the three choices appear once as plain opening text with the requested emojis
- Location: tests/path-choice.spec.ts:40:5

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
Call log:
  - → POST http://127.0.0.1:3000/api/games
    - user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 66

```

# Test source

```ts
  1   | import "dotenv/config";
  2   | import { test, expect, type Page } from "@playwright/test";
  3   | import { db } from "@/db";
  4   | import { characters, games, messages } from "@/db/schema";
  5   | import { and, eq, inArray, sql } from "drizzle-orm";
  6   | import { MORPHEUS_OPENING } from "@/lib/matrix/content";
  7   | import { baseMatrixState, PATH_LABELS, type MatrixPath } from "@/lib/matrix/types";
  8   | import { buildSystemPrompt } from "@/lib/gm";
  9   | 
  10  | const ids: number[] = [];
  11  | const sse = (text: string) => `data: ${JSON.stringify({ type: "text", text })}\n\ndata: {"type":"done"}\n\n`;
  12  | 
  13  | async function createGame(page: Page) {
> 14  |   const response = await page.request.post("/api/games", { data: { title: "__path_choice_regression__", masterProfile: "immersive" } });
      |                                       ^ Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
  15  |   expect(response.status()).toBe(201);
  16  |   const session = await response.json();
  17  |   ids.push(session.game.id);
  18  |   return session;
  19  | }
  20  | 
  21  | async function openGame(page: Page, id: number) {
  22  |   await page.route("**/api/settings", route => route.fulfill({ json: { configured: true, provider: "gemini", model: "gemini-flash-lite-latest" } }));
  23  |   await page.addInitScript(gameId => sessionStorage.setItem("matrix.active-game", String(gameId)), id);
  24  |   await page.goto("/");
  25  |   await expect(page.getByLabel("Mensagem para Morpheus")).toBeVisible();
  26  | }
  27  | 
  28  | async function expectTextChoicesOnly(page: Page) {
  29  |   const opening = page.locator("main article").filter({ hasText: "Sou Morpheus." });
  30  |   await expect(opening).toHaveCount(1);
  31  |   for (const label of ["🔴 Pílula Vermelha", "🔵 Pílula Azul", "🌍 Mundo Real"]) await expect(opening).toContainText(label);
  32  |   const conversation = await page.locator("main").innerText();
  33  |   for (const emoji of ["🔴", "🔵", "🌍"]) expect(conversation.split(emoji).length - 1).toBe(1);
  34  |   await expect(page.getByLabel("Escolher caminho")).toHaveCount(0);
  35  |   await expect(page.getByRole("button", { name: /Pílula Vermelha|Pílula Azul|Mundo Real/ })).toHaveCount(0);
  36  | }
  37  | 
  38  | test.afterAll(async () => { if (ids.length) await db.delete(games).where(inArray(games.id, ids)); });
  39  | 
  40  | test("the three choices appear once as plain opening text with the requested emojis", async ({ page }) => {
  41  |   const session = await createGame(page);
  42  |   expect(session.messages[0].content).toBe(MORPHEUS_OPENING);
  43  |   await openGame(page, session.game.id);
  44  |   await expectTextChoicesOnly(page);
  45  | });
  46  | 
  47  | for (const [label, choice] of [
  48  |   ["red pill", "Escolho a pílula vermelha."],
  49  |   ["blue pill", "Escolho a pílula azul."],
  50  |   ["real world", "Quero jogar no mundo real."],
  51  | ]) {
  52  |   test(`${label}: text replies do not append cards even before the character tool records the path`, async ({ page }) => {
  53  |     const session = await createGame(page);
  54  |     const sent: string[] = [];
  55  |     await page.route("**/api/chat", route => {
  56  |       sent.push(route.request().postDataJSON().message);
  57  |       const response = sent.length === 1 ? "Entendido. Qual será seu codinome?" : "Kai, me conte sua vida antes de despertar.";
  58  |       // Deliberately omit a character event to reproduce the original repeated-card bug.
  59  |       return route.fulfill({ contentType: "text/event-stream", body: sse(response) });
  60  |     });
  61  |     await openGame(page, session.game.id);
  62  |     await page.getByLabel("Mensagem para Morpheus").fill(choice);
  63  |     await page.getByRole("button", { name: "Enviar", exact: true }).click();
  64  |     await expect(page.getByText("Entendido. Qual será seu codinome?", { exact: true })).toBeVisible();
  65  |     await expectTextChoicesOnly(page);
  66  |     await page.getByLabel("Mensagem para Morpheus").fill("Meu codinome é Kai.");
  67  |     await page.getByRole("button", { name: "Enviar", exact: true }).click();
  68  |     await expect(page.getByText("Kai, me conte sua vida antes de despertar.", { exact: true })).toBeVisible();
  69  |     await expectTextChoicesOnly(page);
  70  |     expect(sent).toEqual([choice, "Meu codinome é Kai."]);
  71  |   });
  72  | }
  73  | 
  74  | test("reopening an older session updates only the introductory presentation, preserving its sheet and history", async ({ page }) => {
  75  |   const session = await createGame(page);
  76  |   const id = session.game.id;
  77  |   const oldOpening = "Sou Morpheus. Introdução antiga. • Pílula Vermelha • Pílula Azul • Mundo Real";
  78  |   await db.update(messages).set({ content: oldOpening }).where(and(eq(messages.gameId, id), sql`${messages.meta}->>'introduction' = 'true'`));
  79  |   await db.insert(messages).values([
  80  |     { gameId: id, role: "user", content: "Escolho a pílula azul. Meu nome é Echo." },
  81  |     { gameId: id, role: "assistant", content: "Echo, vamos definir seu antecedente." },
  82  |   ]);
  83  |   await db.insert(characters).values({ gameId: id, name: "Echo", complete: false, data: { matrix: { ...baseMatrixState(), path: "blue", dm: 2, ph: 0, phMax: 0, pd: 0, pdMax: 0 } } });
  84  |   await openGame(page, id);
  85  |   await expectTextChoicesOnly(page);
  86  |   await expect(page.getByText("Echo, vamos definir seu antecedente.", { exact: true })).toBeVisible();
  87  |   await expect(page.getByRole("region", { name: "Ficha do personagem" })).toContainText("Reconectado");
  88  |   await page.reload();
  89  |   await expectTextChoicesOnly(page);
  90  |   const saved = await (await page.request.get(`/api/games/${id}`)).json();
  91  |   expect(saved.character).toMatchObject({ name: "Echo", data: { matrix: { path: "blue", dm: 2 } } });
  92  |   const stored = await db.select().from(messages).where(and(eq(messages.gameId, id), sql`${messages.meta}->>'introduction' = 'true'`));
  93  |   expect(stored[0].content).toBe(oldOpening); // Presentation compatibility does not rewrite the history.
  94  | });
  95  | 
  96  | test("Morpheus is instructed to respect the chosen path and record text choices without asking again", () => {
  97  |   const options = {
  98  |     profileId: "immersive", gameTitle: "Test", rulesText: "", systemName: "Matrix", systemSummary: "Matrix RPG",
  99  |     characterName: "Kai", hasCharacter: true, characterComplete: false,
  100 |   };
  101 |   for (const path of ["red", "blue", "real"] as MatrixPath[]) {
  102 |     const prompt = buildSystemPrompt({ ...options, characterData: { matrix: { ...baseMatrixState(), path } } });
  103 |     expect(prompt).toContain(`Caminho já definido: ${PATH_LABELS[path]} (${path})`);
  104 |     expect(prompt).toContain("Não ofereça as três opções novamente");
  105 |     expect(prompt).toContain("Só altere o caminho se o jogador pedir explicitamente");
  106 |   }
  107 |   const prompt = buildSystemPrompt({ ...options, hasCharacter: false, characterData: {} });
  108 |   expect(prompt).toContain("se o jogador já escolheu, registre imediatamente o caminho com set_character e avance");
  109 |   expect(prompt).toContain("não por botões");
  110 |   expect(prompt).toContain("Uma dúvida ou comparação não altera o caminho");
  111 | });
  112 | 
  113 | test("the plain-text path explanation remains readable on a phone", async ({ page }) => {
  114 |   await page.setViewportSize({ width: 390, height: 844 });
```