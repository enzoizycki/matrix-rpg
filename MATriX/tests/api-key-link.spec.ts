import { test, expect, type Page } from "@playwright/test";

const OFFICIAL_KEY_URL = "https://aistudio.google.com/apikey";

async function openConnection(page: Page) {
  await page.route("**/api/settings", route => route.fulfill({
    json: { configured: false, model: "gemini-flash-lite-latest" },
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "conectar IA", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("official Gemini key link opens in a separate tab without submitting or losing the form", async ({ page, context }) => {
  const dialog = await openConnection(page);
  let submissions = 0;
  page.on("request", request => {
    if (request.url().endsWith("/api/settings") && request.method() === "POST") submissions++;
  });
  await dialog.getByLabel("Chave da API Gemini").fill("test-placeholder-not-a-real-key");
  const link = dialog.getByRole("link", { name: /Criar chave no Google AI Studio/ });
  await expect(link).toHaveAttribute("href", OFFICIAL_KEY_URL);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(dialog.getByLabel("Endereço para criar a chave Gemini")).toHaveValue(OFFICIAL_KEY_URL);
  // Check navigation without depending on Google's login screen or contacting it.
  await context.route("https://aistudio.google.com/**", route => route.fulfill({
    contentType: "text/html", body: "<title>Official key page navigation test</title>",
  }));
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForURL(OFFICIAL_KEY_URL);
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Chave da API Gemini")).toHaveValue("test-placeholder-not-a-real-key");
  expect(submissions).toBe(0);
});

test("copy action copies only the official public URL, not the entered API key", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { (window as unknown as { copiedURL: string }).copiedURL = text; } },
    });
  });
  const dialog = await openConnection(page);
  await dialog.getByLabel("Chave da API Gemini").fill("test-placeholder-not-a-real-key");
  await dialog.getByRole("button", { name: "Copiar endereço", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Endereço copiado");
  const copied = await page.evaluate(() => (window as unknown as { copiedURL: string }).copiedURL);
  expect(copied).toBe(OFFICIAL_KEY_URL);
});

test("blocked clipboard selects the public address for manual copying", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("Clipboard blocked by embedded preview"); } },
    });
  });
  const dialog = await openConnection(page);
  await dialog.getByRole("button", { name: "Copiar endereço", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("copie-o manualmente");
  const address = dialog.getByLabel("Endereço para criar a chave Gemini");
  await expect(address).toBeFocused();
  const selection = await address.evaluate(element => {
    const input = element as HTMLInputElement;
    return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
  });
  expect(selection).toBe(OFFICIAL_KEY_URL);
});

test("key instructions and connect button remain reachable on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const dialog = await openConnection(page);
  const link = dialog.getByRole("link", { name: /Criar chave no Google AI Studio/ });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  const submit = dialog.getByRole("button", { name: /validar e conectar/i });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Fechar conexão" }).click();
  await expect(dialog).not.toBeVisible();
});
