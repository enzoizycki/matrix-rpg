# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ollama-integration.spec.ts >> Matrix mechanics through Ollama tools >> Morpheus uses the actual Matrix rulebook and records a partial character, not D&D stats
- Location: tests/ollama-integration.spec.ts:76:7

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 10
+ Received  +  2

  Object {
    "complete": false,
-   "data": Object {
-     "matrix": Object {
-       "dm": 3,
-       "favored": "Corpo",
-       "health": 5,
-       "path": "red",
-       "pd": 5,
-     },
-   },
-   "name": "Kai",
+   "data": Object {},
+   "name": "Identidade em criação",
  }
```

# Test source

```ts
  1   | import "dotenv/config";
  2   | import http from "node:http";
  3   | import type { AddressInfo } from "node:net";
  4   | import { test, expect, type APIRequestContext } from "@playwright/test";
  5   | import { db } from "@/db";
  6   | import { games, messages, settings } from "@/db/schema";
  7   | import { eq, inArray } from "drizzle-orm";
  8   | import { resolveMatrixRoll } from "@/lib/matrix/mechanics";
  9   | import type { MatrixRollRequest } from "@/lib/matrix/types";
  10  | 
  11  | type Body = { model?: string; messages?: { role: string; content: string; tool_name?: string; tool_calls?: unknown[] }[]; options?: { num_predict?: number }; tools?: { function: { name: string } }[] };
  12  | type ResponseScript = unknown[] | ((body: Body) => unknown[]);
  13  | const say = (content: string, name?: string, args?: Record<string, unknown>) => [{ message: { role: "assistant", content, ...(name ? { tool_calls: [{ function: { name, arguments: args || {} } }] } : {}) } }, { done: true }];
  14  | const decode = (text: string) => text.split("\n\n").filter(block => block.startsWith("data:")).map(block => JSON.parse(block.slice(5)));
  15  | 
  16  | test.describe.serial("Matrix mechanics through Ollama tools", () => {
  17  |   test.skip(process.env.ISOLATED_TEST_SERVER !== "1", "Runs only in the isolated disposable server/database.");
  18  |   const scripts: ResponseScript[] = [];
  19  |   const calls: { path: string; body: Body; auth?: string }[] = [];
  20  |   const ids: number[] = [];
  21  |   let server: http.Server;
  22  |   let endpoint = "";
  23  |   let redId = 0;
  24  |   let blueId = 0;
  25  |   async function chat(request: APIRequestContext, body: object) {
  26  |     const result = await request.post("/api/chat", { data: { turnId: crypto.randomUUID(), ...body } });
  27  |     expect(result.status(), await result.text()).toBe(200);
  28  |     const events = decode(await result.text());
  29  |     expect(events.filter(event => event.type === "error")).toEqual([]);
  30  |     expect(events.at(-1).type).toBe("done");
  31  |     return events;
  32  |   }
  33  |   async function create(request: APIRequestContext) {
  34  |     const response = await request.post("/api/games", { data: { title: "__matrix_integration__", masterProfile: "immersive" } });
  35  |     expect(response.status()).toBe(201);
  36  |     const session = await response.json(); ids.push(session.game.id); return session;
  37  |   }
  38  |   test.beforeAll(async ({ request }) => {
  39  |     server = http.createServer(async (req, res) => {
  40  |       const parts: Buffer[] = []; for await (const part of req) parts.push(part as Buffer);
  41  |       const raw = Buffer.concat(parts).toString(); const body: Body = raw ? JSON.parse(raw) : {};
  42  |       calls.push({ path: req.url || "", body, auth: req.headers.authorization });
  43  |       if (req.url === "/api/show") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ capabilities: ["completion", "tools"] })); return; }
  44  |       if (req.url === "/api/tags") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ models: [{ name: "matrix-test" }] })); return; }
  45  |       if (req.url !== "/api/chat") { res.statusCode = 404; res.end(); return; }
  46  |       if (body.options?.num_predict === 16) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ message: { content: "OK" } })); return; }
  47  |       const script = scripts.shift();
  48  |       if (!script) { res.statusCode = 500; res.end(JSON.stringify({ error: "Missing test script" })); return; }
  49  |       const data = typeof script === "function" ? script(body) : script;
  50  |       res.setHeader("Content-Type", "application/x-ndjson"); res.end(data.map(item => JSON.stringify(item)).join("\n") + "\n");
  51  |     });
  52  |     await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  53  |     endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  54  |     const connected = await request.post("/api/settings", { data: { provider: "ollama", mode: "local", baseUrl: endpoint, model: "matrix-test", numCtx: 16384 } });
  55  |     expect(connected.status(), await connected.text()).toBe(200);
  56  |   });
  57  |   test.afterAll(async ({ request }) => {
  58  |     server?.closeAllConnections(); await new Promise<void>(resolve => server?.close(() => resolve()));
  59  |     if (ids.length) await db.delete(games).where(inArray(games.id, ids));
  60  |     await request.delete("/api/settings");
  61  |   });
  62  | 
  63  |   test("create session with built-in rules and Morpheus introduction without invoking the model", async ({ request }) => {
  64  |     const before = calls.length;
  65  |     const session = await create(request); redId = session.game.id;
  66  |     expect(calls.length).toBe(before);
  67  |     expect(session.game.ruleset).toBe("matrix-artefato");
  68  |     expect(session.messages[0].content).toContain("Sou Morpheus");
  69  |     expect(session.game.files).toEqual([]);
  70  |     const identity = await request.post(`/api/games/${redId}/identify`);
  71  |     expect(identity.status()).toBe(200);
  72  |     expect((await identity.json()).systemName).toContain("Dan Aguiar");
  73  |     expect(calls.length).toBe(before);
  74  |   });
  75  | 
  76  |   test("Morpheus uses the actual Matrix rulebook and records a partial character, not D&D stats", async ({ request }) => {
  77  |     scripts.push(say("", "get_character"), say("Vou registrar suas escolhas.", "set_character", { name: "Kai", path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", complete: true, attributes: "Força 18, Destreza 12" }), say("Sua ficha está pronta para revisão. Você aprova?"));
  78  |     const events = await chat(request, { gameId: redId, message: "Sou Kai, soldado resgatado pela equipe Ordeira. Minha afinidade é Corpo." });
  79  |     const sheet = events.find(event => event.type === "character");
> 80  |     expect(sheet).toMatchObject({ name: "Kai", complete: false, data: { matrix: { path: "red", health: 5, dm: 3, pd: 5, favored: "Corpo" } } });
      |                   ^ Error: expect(received).toMatchObject(expected)
  81  |     expect(sheet.data.attributes).toEqual({ Corpo: "Afinidade", Mente: "Sem afinidade", Social: "Sem afinidade" });
  82  |     const prompt = calls.filter(call => call.path === "/api/chat").at(-1)!.body.messages![0].content;
  83  |     expect(prompt).toContain("Você é MORPHEUS");
  84  |     expect(prompt).toContain("DM é um CONTADOR");
  85  |     expect(prompt).toContain("MENOR");
  86  |     expect(prompt).toContain("Resgatado");
  87  |   });
  88  | 
  89  |   test("approval is an explicit player action and persists before the adventure", async ({ request }) => {
  90  |     scripts.push(say("A ficha está aprovada. Um telefone toca no corredor vazio."));
  91  |     const events = await chat(request, { gameId: redId, action: "approve_character" });
  92  |     expect(events.find(event => event.type === "character")).toMatchObject({ complete: true });
  93  |     const session = await (await request.get(`/api/games/${redId}`)).json();
  94  |     expect(session.character.complete).toBe(true);
  95  |   });
  96  | 
  97  |   test("consult_rulebook returns the embedded Trinity section with attribution/page reference", async ({ request }) => {
  98  |     scripts.push(say("Consultando as anomalias.", "consult_rulebook", { sectionId: "trinity" }), say("Trinity compara os dois dados com o DM. O DM não é rolado."));
  99  |     const events = await chat(request, { gameId: redId, message: "O que é Trinity?" });
  100 |     expect(events.some(event => event.type === "consult")).toBe(true);
  101 |     const sent = calls.filter(call => call.path === "/api/chat").at(-1)!.body.messages!;
  102 |     const reply = sent.at(-1)!;
  103 |     expect(reply.tool_name).toBe("consult_rulebook");
  104 |     expect(JSON.parse(reply.content).results[0]).toMatchObject({ sectionId: "trinity", page: 4 });
  105 |     expect(reply.content).toContain("Firewall Desativado");
  106 |   });
  107 | 
  108 |   test("requested 2d6 uses the actual faces, updates DM once and survives retries", async ({ request }) => {
  109 |     scripts.push(say("", "get_character"), say("Você tenta passar pela patrulha.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Mente", reason: "Enganar o sistema" }));
  110 |     const asked = await chat(request, { gameId: redId, message: "Tento enganar o sistema de vigilância." });
  111 |     const pending = asked.find(event => event.type === "roll_request") as MatrixRollRequest;
  112 |     expect(pending).toMatchObject({ kind: "attribute", notation: "2d6", attribute: "Mente" });
  113 |     const before = await (await request.get(`/api/games/${redId}`)).json();
  114 |     expect(before.pendingRequest.id).toBe(pending.id);
  115 |     const rolled = await request.post("/api/roll", { data: { gameId: redId, notation: "2d6", requestId: pending.id } });
  116 |     expect(rolled.status()).toBe(200);
  117 |     const dice = await rolled.json();
  118 |     const expected = resolveMatrixRoll(before.character.data.matrix, dice, pending);
  119 |     scripts.push(say("O sistema responde ao resultado que você obteve."));
  120 |     const result = await chat(request, { gameId: redId, diceResult: { rollId: dice.rollId, total: 999, rolls: [999] } });
  121 |     expect(result.find(event => event.type === "roll_resolved").resolution).toEqual(expected.resolution);
  122 |     expect(result.find(event => event.type === "character").data.matrix.dm).toBe(expected.state.dm);
  123 |     const after = await (await request.get(`/api/games/${redId}`)).json();
  124 |     expect(after.pendingRequest).toBeNull();
  125 |     const modelInput = calls.filter(call => call.path === "/api/chat").at(-1)!.body.messages!.at(-1)!.content;
  126 |     expect(modelInput).toContain("JÁ foram aplicadas");
  127 |     expect(modelInput).not.toContain("999");
  128 |     scripts.push(say("A consequência já foi registrada. Vamos continuar."));
  129 |     await chat(request, { gameId: redId, diceResult: { rollId: dice.rollId } });
  130 |     const again = await (await request.get(`/api/games/${redId}`)).json();
  131 |     expect(again.character.data.matrix.dm).toBe(expected.state.dm);
  132 |     const stored = await db.select().from(messages).where(eq(messages.gameId, redId));
  133 |     expect(stored.filter(row => row.meta?.sourceRollId === dice.rollId)).toHaveLength(1);
  134 |   });
  135 | 
  136 |   test("DM crossing to 5 automatically creates an immediate Humanity request before model narration", async ({ request }) => {
  137 |     const fresh = await create(request);
  138 |     scripts.push(say("", "get_character"), say("", "set_character", { name: "Relay", path: "blue", antecedent: "Hacker", favored: "Mente", function: "Fantasma" }), say("Ficha criada."));
  139 |     await chat(request, { gameId: fresh.game.id, message: "Sou Relay, hacker, Fantasma." });
  140 |     // Set DM to 4 through an authoritative, already-saved state for this deterministic trigger check.
  141 |     await db.execute((await import("drizzle-orm")).sql`update characters set data = jsonb_set(data, '{matrix,dm}', '4') where game_id = ${fresh.game.id}`);
  142 |     scripts.push(say("", "get_character"), say("Você tenta uma ação fora da sua afinidade.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Teste de Corpo" }));
  143 |     const asked = await chat(request, { gameId: fresh.game.id, message: "Tento atravessar a barreira." });
  144 |     const pending = asked.find(event => event.type === "roll_request") as MatrixRollRequest;
  145 |     const before = await (await request.get(`/api/games/${fresh.game.id}`)).json();
  146 |     let dice: { rollId: number; rolls: number[] } | null = null;
  147 |     for (let tries = 0; tries < 30; tries++) {
  148 |       const candidate = await (await request.post("/api/roll", { data: { gameId: fresh.game.id, notation: "2d6", requestId: pending.id } })).json();
  149 |       // Blue, non-affinity Corpo: highest face is selected. Any 5/6 fails against DM4 and crosses DM5.
  150 |       if (Math.max(...candidate.rolls) >= 5) { dice = candidate; break; }
  151 |     }
  152 |     expect(dice).not.toBeNull();
  153 |     const result = await chat(request, { gameId: fresh.game.id, diceResult: { rollId: dice!.rollId } });
  154 |     expect(result.find(event => event.type === "roll_request")).toMatchObject({ kind: "humanity", notation: "2d6" });
  155 |     expect(result.find(event => event.type === "text").text).toContain("Humanidade");
  156 |     const after = await (await request.get(`/api/games/${fresh.game.id}`)).json();
  157 |     expect(after.character.data.matrix).toMatchObject({ dm: 5, humanityTestDue: true });
  158 |     expect(before.character.data.matrix.dm).toBe(4);
  159 |   });
  160 | 
  161 |   test("free/changed rolls preserve a pending test and do not mutate DM", async ({ request }) => {
  162 |     scripts.push(say("", "get_character"), say("Role seu teste.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Esquiva" }));
  163 |     const events = await chat(request, { gameId: redId, message: "Tento esquivar." });
  164 |     const pending = events.find(event => event.type === "roll_request");
  165 |     const before = await (await request.get(`/api/games/${redId}`)).json();
  166 |     const dice = await (await request.post("/api/roll", { data: { gameId: redId, notation: "1d6+2", requestId: pending.id } })).json();
  167 |     expect(dice.matchedRequest).toBe(false);
  168 |     scripts.push(say("Você rolou um dado diferente. O teste de esquiva continua pendente."));
  169 |     await chat(request, { gameId: redId, diceResult: { rollId: dice.rollId } });
  170 |     const after = await (await request.get(`/api/games/${redId}`)).json();
  171 |     expect(after.pendingRequest.id).toBe(pending.id);
  172 |     expect(after.character.data.matrix.dm).toBe(before.character.data.matrix.dm);
  173 |   });
  174 | 
  175 |   test("another campaign's roll and unsupported dice are rejected", async ({ request }) => {
  176 |     const session = await create(request);
  177 |     const dice = await (await request.post("/api/roll", { data: { gameId: session.game.id, notation: "1d6" } })).json();
  178 |     const forged = await request.post("/api/chat", { data: { gameId: redId, diceResult: { rollId: dice.rollId } } });
  179 |     expect(forged.status()).toBe(400);
  180 |     expect((await forged.json()).code).toBe("ROLL_NOT_FOUND");
```