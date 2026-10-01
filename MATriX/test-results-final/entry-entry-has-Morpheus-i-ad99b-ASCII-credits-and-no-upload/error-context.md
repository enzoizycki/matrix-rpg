# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: entry.spec.ts >> entry has Morpheus introduction then ASCII, credits and no upload
- Location: tests/entry.spec.ts:15:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /MORPHEUS/ }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: /MORPHEUS/ }).first() with timeout 10000ms
  - waiting for getByRole('heading', { name: /MORPHEUS/ }).first()

```

```yaml
- text: THE CONSTRUCT // MATRIX RPG
- button "conectar IA"
- main:
  - text: Morpheus / canal privado Regras carregadas
  - region:
    - text: incoming_transmission / morpheus
    - paragraph: Uma escolha muda tudo.
    - heading "MATRIX_" [level=1]
    - text: "Você sentiu a falha antes de encontrar este terminal. Um instante repetido. Uma lembrança que não parece sua. A impressão de que o mundo espera que você pare de fazer perguntas. Meu nome é Morpheus. Não estou aqui para escolher por você. Posso acompanhar seus primeiros passos, mas cada decisão, cada risco e cada história serão seus. Do outro lado desta conexão existe uma vida que ainda não foi escrita. Antes de atravessar, precisamos descobrir quem você é. Morpheus é o software criado e arquitetado por Enzo Izycki para conduzir esta conexão com o Matrix RPG. Morpheus __ __ _ _____ ____ _____ __ | \\/ | / \\|_ _| _ \\|_ _| \\/ / | |\\/| | / _ \\ | | | |_) || | \\ / | | | |/ ___ \\| | | _ < | | / \\ |_| |_/_/ \\_\\_| |_| \\_\\___|/_/\\_\\ [ M O R P H E U S . E X E ] > sinal seguro estabelecido_ > realidade: em questionamento > regras: carregadas"
    - paragraph: Introdução original desta adaptação. Nenhum arquivo é necessário.
  - region "// antes de atravessar":
    - heading "// antes de atravessar" [level=2]
    - button "Ler as regras"
    - heading "01 / Sua identidade" [level=3]
    - paragraph: Corpo, Mente e Social. Seu antecedente define a afinidade. A ficha nasce da conversa — sem preencher formulários.
    - heading "02 / Seus dados" [level=3]
    - paragraph: Apenas d6. Na Matrix, escolha o maior ou o menor dos dois dados, conforme seu caminho e antecedente.
    - heading "03 / A pressão" [level=3]
    - paragraph: O DM é um contador fixo, nunca rolado. Suas escolhas podem estabilizar a Matrix ou atrair as máquinas.
    - paragraph: Morpheus explicará os três caminhos — Resgatado, Reconectado e Mundo Real — antes de criar seu personagem. A ficha será fixada na mesa e a aventura só começa após sua aprovação.
  - text: Nome da conexão / opcional
  - textbox "Nome da conexão / opcional":
    - /placeholder: Siga o coelho branco
  - text: Estilo de Morpheus
  - combobox "Estilo de Morpheus":
    - option "Imersivo — Atmosfera densa e sensorial" [selected]
    - option "Narrativo — História acima de tudo"
    - option "Tático — Desafio e estratégia"
    - option "Equilibrado — O melhor dos mundos"
    - option "Sombrio — Perigoso e implacável"
    - option "Descontraído — Diversão e aventura leve"
  - paragraph:
    - text: A introdução e as regras já estão disponíveis.
    - button "Conecte Gemini ou Ollama"
    - text: para conversar com Morpheus. Você também pode abrir a mesa agora e conectar depois.
  - button "Entrar na Matrix"
  - paragraph: Regras incorporadas / criação pelo chat / mesa solo
  - paragraph:
    - text: Morpheus é um software criado e arquitetado por
    - strong: Enzo Izycki
    - text: .
  - paragraph:
    - text: Matrix RPG · Dan Aguiar /
    - link "Artefato":
      - /url: https://www.artefatojogos.com
  - paragraph: Gratuito e feito de fã para fã. Homenagem à obra de Lilly e Lana Wachowski.
  - paragraph: Adaptação não oficial. O uso de IA segue os limites e custos do provedor escolhido.
- alert
```

# Test source

```ts
  1   | import "dotenv/config";
  2   | import { test, expect, type Page } from "@playwright/test";
  3   | import { db } from "@/db";
  4   | import { games } from "@/db/schema";
  5   | import { inArray } from "drizzle-orm";
  6   | const ids: number[] = [];
  7   | const offline = { configured: false, model: "gemini-flash-lite-latest", provider: "gemini" };
  8   | const connected = { ...offline, configured: true };
  9   | const reply = (text: string) => `data: ${JSON.stringify({ type: "text", text })}\r\n\r\ndata: {"type":"done"}\r\n\r\n`;
  10  | async function status(page: Page, ready = false) { await page.route("**/api/settings", route => route.fulfill({ json: ready ? connected : offline })); }
  11  | async function enter(page: Page) { await page.goto("/"); await page.getByRole("button", { name: "Entrar na Matrix", exact: true }).click(); await expect(page.getByRole("heading", { name: /Morpheus/ }).first()).toBeVisible(); }
  12  | test.beforeEach(async ({ page }) => { page.on("response", async response => { if (response.url().endsWith("/api/games") && response.request().method() === "POST" && response.status() === 201) { const session = await response.json().catch(() => null); if (session?.game.id) ids.push(session.game.id); } }); });
  13  | test.afterAll(async () => { if (ids.length) await db.delete(games).where(inArray(games.id, ids)); });
  14  | 
  15  | test("entry has Morpheus introduction then ASCII, credits and no upload", async ({ page }) => {
  16  |   await status(page); await page.goto("/");
> 17  |   await expect(page.getByRole("heading", { name: /MORPHEUS/ }).first()).toBeVisible();
      |                                                                         ^ Error: expect(locator).toBeVisible() failed
  18  |   await expect(page.getByLabel("Introdução de Morpheus")).toContainText("Meu nome é Morpheus");
  19  |   await expect(page.getByLabel("Arte ASCII Matrix")).toContainText("M O R P H E U S");
  20  |   expect(await page.getByLabel("Introdução de Morpheus").evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('pre[aria-label="Arte ASCII Matrix"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  21  |   await expect(page.locator('input[type="file"]')).toHaveCount(0);
  22  |   await expect(page.getByText("Dan Aguiar /", { exact: false })).toBeVisible();
  23  | });
  24  | 
  25  | test("rules are locally readable and searchable without an AI key", async ({ page }) => {
  26  |   await status(page); await page.goto("/"); await page.getByRole("button", { name: "Ler as regras", exact: true }).click();
  27  |   const dialog = page.getByRole("dialog");
  28  |   await dialog.getByLabel("Buscar nas regras").fill("Trinity");
  29  |   await expect(dialog.getByRole("heading", { name: "Trinity: os dois dados e o DM", exact: true })).toBeVisible();
  30  |   await dialog.getByLabel("Buscar nas regras").fill("");
  31  |   await dialog.getByRole("button", { name: "O Oráculo", exact: true }).click();
  32  |   await expect(dialog.getByRole("heading", { name: "Motivações e O Escolhido" })).toBeVisible();
  33  |   await dialog.getByRole("button", { name: "Fechar regras" }).click();
  34  | });
  35  | 
  36  | test("one click creates Matrix with embedded rules and an opening message without calling AI", async ({ page, request }) => {
  37  |   await status(page);
  38  |   let aiRequests = 0;
  39  |   page.on("request", request => { if (request.url().endsWith("/api/chat") || request.url().endsWith("/identify")) aiRequests++; });
  40  |   await enter(page);
  41  |   await expect(page.getByText("Qual caminho você escolhe", { exact: false })).toBeVisible();
  42  |   await expect(page.getByRole("button", { name: "Conectar IA e continuar" })).toBeVisible();
  43  |   expect(aiRequests).toBe(0);
  44  |   const id = await page.evaluate(() => sessionStorage.getItem("matrix.active-game"));
  45  |   const saved = await (await request.get(`/api/games/${id}`)).json();
  46  |   expect(saved.game.ruleset).toBe("matrix-artefato");
  47  |   expect(saved.game.files).toEqual([]);
  48  |   expect(saved.game.rulesChars).toBeGreaterThan(20000);
  49  |   expect(saved.messages[0].content).toContain("Sou Morpheus");
  50  | });
  51  | 
  52  | test("refresh and returning to the entry preserve the existing connection", async ({ page }) => {
  53  |   await status(page); await enter(page);
  54  |   const id = await page.evaluate(() => sessionStorage.getItem("matrix.active-game"));
  55  |   await page.reload();
  56  |   await expect(page.getByLabel("Mensagem para Morpheus")).toBeVisible();
  57  |   expect(await page.evaluate(() => sessionStorage.getItem("matrix.active-game"))).toBe(id);
  58  |   await page.getByRole("button", { name: "Voltar à entrada sem apagar a mesa" }).click();
  59  |   await page.getByRole("button", { name: "Retomar minha conexão salva" }).click();
  60  |   await expect(page.getByLabel("Mensagem para Morpheus")).toBeVisible();
  61  | });
  62  | 
  63  | test("connecting resumes the queued choice without recreating the game", async ({ page }) => {
  64  |   let ready = false; let count = 0; const sent: string[] = [];
  65  |   await page.route("**/api/settings", route => { if (route.request().method() === "POST") ready = true; return route.fulfill({ json: ready ? connected : offline }); });
  66  |   await page.route("**/api/chat", route => { sent.push(route.request().postDataJSON().message); return route.fulfill({ contentType: "text/event-stream", body: reply("A pílula vermelha. Diga-me seu codinome.") }); });
  67  |   page.on("request", req => { if (req.url().endsWith("/api/games") && req.method() === "POST") count++; });
  68  |   await enter(page);
  69  |   await page.getByLabel("Mensagem para Morpheus").fill("Escolho a Pílula Vermelha. Quero ser um Resgatado.");
  70  |   await page.getByRole("button", { name: "Enviar", exact: true }).click();
  71  |   const dialog = page.getByRole("dialog");
  72  |   await dialog.getByLabel("Chave da API Gemini").fill("integration-test-placeholder-not-secret");
  73  |   await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  74  |   await expect(page.getByText("A pílula vermelha. Diga-me seu codinome.", { exact: true })).toBeVisible();
  75  |   expect(sent).toHaveLength(1); expect(sent[0]).toContain("Resgatado"); expect(count).toBe(1);
  76  | });
  77  | 
  78  | test("HTTP chat errors are visible and retry keeps the same turn id", async ({ page }) => {
  79  |   await status(page, true); const turns: string[] = [];
  80  |   await page.route("**/api/chat", route => { turns.push(route.request().postDataJSON().turnId); return turns.length === 1 ? route.fulfill({ status: 503, json: { error: "Transmissão indisponível.", code: "AI_UNAVAILABLE" } }) : route.fulfill({ contentType: "text/event-stream", body: reply("Conexão restabelecida. Vamos continuar.") }); });
  81  |   await enter(page); await page.getByLabel("Mensagem para Morpheus").fill("Quero ser um Resgatado."); await page.getByRole("button", { name: "Enviar", exact: true }).click();
  82  |   await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Transmissão indisponível");
  83  |   await page.getByRole("button", { name: "Tentar novamente" }).click();
  84  |   await expect(page.getByText("Conexão restabelecida. Vamos continuar.", { exact: true })).toBeVisible();
  85  |   expect(turns).toHaveLength(2); expect(turns[0]).toBe(turns[1]);
  86  | });
  87  | 
  88  | test("interrupted stream does not leave the composer locked", async ({ page }) => {
  89  |   await status(page, true);
  90  |   await page.route("**/api/chat", route => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text","text":"Sua identidade..."}\n\n' }));
  91  |   await enter(page); await page.getByLabel("Mensagem para Morpheus").fill("Meu nome é Kai."); await page.getByRole("button", { name: "Enviar", exact: true }).click();
  92  |   await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("interrompida");
  93  |   await expect(page.getByLabel("Mensagem para Morpheus")).toBeEnabled();
  94  | });
  95  | 
  96  | test("new session creation does not accept PDF imports", async ({ request }) => {
  97  |   const response = await request.post("/api/games", { multipart: { title: "PDF campaign" } });
  98  |   expect(response.status()).toBe(400); expect((await response.json()).code).toBe("BUILT_IN_GAME");
  99  | });
  100 | 
  101 | test("Matrix home, rules and mobile dice drawer fit a phone", async ({ page }) => {
  102 |   await page.setViewportSize({ width: 390, height: 844 }); await status(page); await enter(page);
  103 |   await page.getByRole("button", { name: "Abrir dados" }).click();
  104 |   await expect(page.getByRole("region", { name: "Bandeja de dados" })).toBeVisible();
  105 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  106 |   await page.getByRole("button", { name: "Fechar dados" }).click();
  107 |   await page.getByRole("button", { name: "Consultar regras de Matrix" }).click();
  108 |   await expect(page.getByRole("dialog")).toBeVisible();
  109 | });
  110 | 
```