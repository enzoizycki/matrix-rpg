import { test, expect, type Page } from "@playwright/test";

type Status = Record<string, unknown>;
const offline: Status = {
  configured: false, provider: "gemini", model: "gemini-flash-lite-latest", source: "none",
  gemini: { hasKey: false, model: "gemini-flash-lite-latest" },
  ollama: { mode: "cloud", baseUrl: "https://ollama.com", hasKey: false, model: "gpt-oss:120b", numCtx: 32768 },
};
const savedOllama: Status = {
  configured: true, provider: "ollama", model: "gemma4:31b", source: "saved",
  gemini: { hasKey: false, model: "gemini-flash-lite-latest" },
  ollama: { mode: "cloud", baseUrl: "https://ollama.com", hasKey: true, model: "gemma4:31b", numCtx: 32768 },
};

/** Simula /api/settings com estado: registra POST/DELETE e devolve o status resultante. */
async function mockSettings(page: Page, initial: Status) {
  const state = { status: initial, posts: [] as Record<string, unknown>[], deletes: 0, failNext: null as null | { status: number; json: unknown } };
  await page.route("**/api/settings", route => {
    const method = route.request().method();
    if (method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.posts.push(body);
      if (state.failNext) { const failure = state.failNext; state.failNext = null; return route.fulfill({ status: failure.status, json: failure.json }); }
      const previous = (state.status.ollama ?? {}) as Record<string, unknown>;
      state.status = body.provider === "ollama"
        ? { ...offline, configured: true, provider: "ollama", model: body.model, source: "saved", ollama: { mode: body.mode, baseUrl: body.baseUrl ?? "https://ollama.com", hasKey: Boolean(body.apiKey) || Boolean(previous.hasKey), model: body.model, numCtx: body.numCtx } }
        : { ...offline, configured: true, provider: "gemini", model: body.model, source: "saved", gemini: { hasKey: true, model: body.model } };
      return route.fulfill({ json: state.status });
    }
    if (method === "DELETE") { state.deletes++; state.status = offline; return route.fulfill({ json: state.status }); }
    return route.fulfill({ json: state.status });
  });
  return state;
}
async function mockModels(page: Page, models: string[]) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/settings/ollama-models", route => { requests.push(route.request().postDataJSON() as Record<string, unknown>); return route.fulfill({ json: { models, cloud: true } }); });
  return requests;
}
async function openDialog(page: Page, buttonName: string | RegExp = "conectar IA") {
  await page.goto("/");
  await page.getByRole("button", { name: buttonName, exact: typeof buttonName === "string" && buttonName === "conectar IA" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}
const goOllama = (dialog: ReturnType<Page["getByRole"]>) => dialog.getByRole("tab", { name: "Ollama", exact: true }).click();

test("Gemini segue como padrão e as abas alternam os campos de cada provedor", async ({ page }) => {
  await mockSettings(page, offline);
  await mockModels(page, []);
  const dialog = await openDialog(page);
  await expect(dialog.getByRole("tab", { name: "Google Gemini" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByLabel("Chave da API Gemini")).toBeVisible();
  await goOllama(dialog);
  await expect(dialog.getByRole("tab", { name: "Ollama", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("radio", { name: "Ollama Cloud (chave de API)" })).toBeChecked();
  await expect(dialog.getByLabel("Chave de API do Ollama")).toBeVisible();
  await expect(dialog.getByLabel("Chave da API Gemini")).toHaveCount(0);
  const link = dialog.getByRole("link", { name: /Criar chave no Ollama/ });
  await expect(link).toHaveAttribute("href", "https://ollama.com/settings/keys");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await dialog.getByRole("tab", { name: "Google Gemini" }).click();
  await expect(dialog.getByLabel("Chave da API Gemini")).toBeVisible();
});

/** Simula o usuário colando texto no campo (o navegador dispara o evento "paste"). */
async function pasteInto(page: Page, label: string | RegExp, text: string) {
  const field = page.getByRole("dialog").getByLabel(label);
  await field.focus();
  await field.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test("colar o comando 'export OLLAMA_API_KEY' da documentação deixa só a chave e conecta", async ({ page }) => {
  const settings = await mockSettings(page, offline);
  await mockModels(page, ["gemma4:31b", "gpt-oss:120b"]);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await pasteInto(page, "Chave de API do Ollama", 'export OLLAMA_API_KEY="chave-real-de-teste.abc_123"\n');
  await expect(dialog.getByLabel("Chave de API do Ollama")).toHaveValue("chave-real-de-teste.abc_123");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByLabel("Modelo", { exact: true }).fill("gemma4:31b");
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog).not.toBeVisible();
  expect(settings.posts).toEqual([{ provider: "ollama", mode: "cloud", apiKey: "chave-real-de-teste.abc_123", model: "gemma4:31b", numCtx: 32768 }]);
});

test("colar o texto de exemplo (YOUR_API_KEY) é recusado na hora, sem enviar nada", async ({ page }) => {
  const settings = await mockSettings(page, offline);
  await mockModels(page, []);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await pasteInto(page, "Chave de API do Ollama", 'export OLLAMA_API_KEY="YOUR_API_KEY"');
  await expect(dialog.getByRole("alert")).toContainText("texto de exemplo");
  await expect(dialog.getByLabel("Chave de API do Ollama")).toHaveValue("");
  // Digitar o exemplo à mão também é barrado ao conectar.
  await dialog.getByLabel("Chave de API do Ollama").fill("YOUR_API_KEY");
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog.getByRole("alert")).toContainText("ollama.com/settings/keys");
  expect(settings.posts).toHaveLength(0);
});

test("a chave do Gemini também é limpa ao colar", async ({ page }) => {
  await mockSettings(page, offline);
  const dialog = await openDialog(page);
  await pasteInto(page, "Chave da API Gemini", '  export GEMINI_API_KEY="chave-gemini-teste-123"  ');
  await expect(dialog.getByLabel("Chave da API Gemini")).toHaveValue("chave-gemini-teste-123");
});

test("a lista de modelos da nuvem carrega sozinha e alimenta o campo de modelo", async ({ page }) => {
  await mockSettings(page, offline);
  const requests = await mockModels(page, ["gemma4:31b", "gpt-oss:120b", "glm-5.3"]);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await expect(dialog.getByText("3 modelos disponíveis")).toBeVisible();
  await expect(page.locator("#ollama-model-list option")).toHaveCount(3);
  await expect(dialog.getByLabel("Modelo", { exact: true })).toHaveValue("gpt-oss:120b");
  expect(requests[0]).toMatchObject({ mode: "cloud" });
});

test("conecta ao Ollama Cloud: envia o pedido certo e mostra o provedor ativo", async ({ page }) => {
  const settings = await mockSettings(page, offline);
  await mockModels(page, ["gpt-oss:120b"]);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await dialog.getByLabel("Chave de API do Ollama").fill("chave-de-teste-ui");
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog).not.toBeVisible();
  expect(settings.posts).toEqual([{ provider: "ollama", mode: "cloud", apiKey: "chave-de-teste-ui", model: "gpt-oss:120b", numCtx: 32768 }]);
  await expect(page.getByRole("button", { name: /operador online \(Ollama\)/ })).toBeVisible();
});

test("servidor local: endereço, dica do Docker, busca de modelos e chave opcional", async ({ page }) => {
  const settings = await mockSettings(page, offline);
  const requests = await mockModels(page, ["llama3.1:latest", "qwen3:8b"]);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await dialog.getByRole("radio", { name: "No meu computador ou servidor" }).check();
  await expect(dialog.getByLabel("Endereço do servidor Ollama")).toHaveValue("http://localhost:11434");
  await expect(dialog.getByText("http://host.docker.internal:11434")).toBeVisible();
  await expect(dialog.getByLabel("Chave de API (opcional)")).toBeVisible();
  await expect(dialog.getByLabel("Modelo", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel(/Janela de contexto/)).toHaveValue("16384");
  await expect(dialog.getByRole("link", { name: /Criar chave no Ollama/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Buscar modelos" }).click();
  await expect(dialog.getByText("2 modelos disponíveis")).toBeVisible();
  expect(requests.at(-1)).toMatchObject({ mode: "local", baseUrl: "http://localhost:11434" });
  await dialog.getByLabel("Modelo", { exact: true }).fill("llama3.1:latest");
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog).not.toBeVisible();
  expect(settings.posts[0]).toEqual({ provider: "ollama", mode: "local", baseUrl: "http://localhost:11434", model: "llama3.1:latest", numCtx: 16384 });
  expect("apiKey" in settings.posts[0]).toBe(false);
});

test("campos obrigatórios são explicados antes de enviar", async ({ page }) => {
  const settings = await mockSettings(page, offline);
  await mockModels(page, []);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog.getByRole("alert")).toContainText("Cole a chave de API do Ollama");
  await dialog.getByLabel("Chave de API do Ollama").fill("x");
  await dialog.getByLabel("Modelo", { exact: true }).fill("");
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog.getByRole("alert")).toContainText("Informe o modelo do Ollama");
  expect(settings.posts).toHaveLength(0);
});

test("erro do servidor aparece sem fechar o painel e preserva o que foi digitado", async ({ page }) => {
  const settings = await mockSettings(page, offline);
  await mockModels(page, []);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await dialog.getByRole("radio", { name: "No meu computador ou servidor" }).check();
  await dialog.getByLabel("Modelo", { exact: true }).fill("gemma:2b");
  settings.failNext = { status: 400, json: { error: "O modelo “gemma:2b” não suporta ferramentas (tool calling), que o Mestre usa para dados e ficha. Escolha outro modelo.", code: "AI_MODEL_TOOLS" } };
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog.getByRole("alert")).toContainText("não suporta ferramentas");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Modelo", { exact: true })).toHaveValue("gemma:2b");
  await expect(dialog.getByRole("button", { name: /validar e conectar/i })).toBeEnabled();
});

test("conexão salva reabre na aba do Ollama e mantém a chave sem pedir de novo", async ({ page }) => {
  const settings = await mockSettings(page, savedOllama);
  await mockModels(page, ["gemma4:31b"]);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /operador online \(Ollama\)/ })).toBeVisible();
  await page.getByRole("button", { name: /operador online/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab", { name: "Ollama", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByLabel("Modelo", { exact: true })).toHaveValue("gemma4:31b");
  await expect(dialog.getByLabel("Chave de API do Ollama")).toHaveAttribute("placeholder", /Chave salva/);
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog).not.toBeVisible();
  expect("apiKey" in settings.posts[0]).toBe(false);
  expect(settings.posts[0]).toMatchObject({ provider: "ollama", mode: "cloud", model: "gemma4:31b" });
});

test("remover a conexão salva pede ao servidor e volta ao estado desconectado", async ({ page }) => {
  const settings = await mockSettings(page, savedOllama);
  await mockModels(page, []);
  await page.goto("/");
  await page.getByRole("button", { name: /operador online/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remover conexão salva" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(settings.deletes).toBe(1);
  await expect(page.getByRole("button", { name: "conectar IA", exact: true })).toBeVisible();
});

test("Gemini continua enviando o pedido no formato original, agora com o provedor", async ({ page }) => {
  const settings = await mockSettings(page, offline);
  const dialog = await openDialog(page);
  await dialog.getByLabel("Chave da API Gemini").fill("chave-gemini-de-teste");
  await dialog.getByRole("button", { name: /validar e conectar/i }).click();
  await expect(dialog).not.toBeVisible();
  expect(settings.posts).toEqual([{ provider: "gemini", apiKey: "chave-gemini-de-teste", model: "gemini-flash-lite-latest" }]);
  await expect(page.getByRole("button", { name: /operador online \(Gemini\)/ })).toBeVisible();
});

test("no celular o painel do Ollama cabe na tela e o botão de conectar fica alcançável", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await mockSettings(page, offline);
  await mockModels(page, []);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await dialog.getByRole("radio", { name: "No meu computador ou servidor" }).check();
  const submit = dialog.getByRole("button", { name: /validar e conectar/i });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("sem emojis: os novos ícones do provedor são vetoriais e verdes", async ({ page }) => {
  await mockSettings(page, offline);
  await mockModels(page, []);
  const dialog = await openDialog(page);
  await goOllama(dialog);
  await expect(dialog.locator('[data-terminal-icon="server"]').first()).toBeVisible();
  await expect(dialog.locator('[data-terminal-icon="cloud"]')).toBeVisible();
  expect(await dialog.innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  const colors = await dialog.locator(".terminal-icon").evaluateAll(icons => icons.map(icon => getComputedStyle(icon).color));
  expect(new Set(colors)).toEqual(new Set(["rgb(34, 255, 102)"]));
});

test("modelo sem ferramentas durante a conversa pede nova conexão em vez de falhar em silêncio", async ({ page }) => {
  await mockSettings(page, savedOllama);
  const session = {
    game: { id: 950100, ruleset: "matrix-artefato", title: "Sinal", masterProfile: "balanced", files: [{ name: "regras.pdf", chars: 500 }], rulesChars: 500, pageCount: 3, systemName: "Construct RPG", systemSummary: "Resumo." },
    character: null, messages: [],
  };
  await page.route("**/api/games/950100", route => route.fulfill({ json: session }));
  await page.route("**/api/chat", route => route.fulfill({ status: 400, json: { error: "O modelo “gemma4:31b” não suporta ferramentas (tool calling), que o Mestre usa para dados e ficha. Escolha outro modelo em Conectar IA.", code: "AI_MODEL_TOOLS" } }));
  await page.addInitScript(() => sessionStorage.setItem("matrix.active-game", "950100"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /operador online \(Ollama\)/ })).toBeVisible();
  await page.getByLabel("Mensagem para Morpheus").fill("Meu nome é Kai.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("não suporta ferramentas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar IA e continuar" })).toBeVisible();
});
