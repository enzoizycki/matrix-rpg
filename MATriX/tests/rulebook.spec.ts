import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "@/db";
import { bootstrapDatabase } from "@/db/bootstrap";
import { sql } from "drizzle-orm";

test("startup remains idempotent and does not require a PDF folder", async () => {
  await bootstrapDatabase(1); await bootstrapDatabase(1);
  const result = await db.execute(sql`select to_regclass('public.games') as name`);
  expect(result.rows[0].name).toBe("games");
});
test("the built-in rules endpoint contains all chapters and cannot be removed", async ({ request }) => {
  const response = await request.get("/api/rulebook");
  expect(response.ok()).toBe(true);
  const rules = await response.json();
  expect(rules.source).toBe("builtin");
  expect(rules.author).toContain("Dan Aguiar");
  expect(rules.sections.length).toBeGreaterThan(20);
  expect(rules.sections.some((section: { id: string }) => section.id === "motivations-chosen")).toBe(true);
  expect((await request.delete("/api/rulebook")).status()).toBe(405);
});
