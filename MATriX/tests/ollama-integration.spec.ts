import "dotenv/config";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { db } from "@/db";
import { characters, games, messages, settings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { resolveMatrixRoll } from "@/lib/matrix/mechanics";
import type { MatrixRollRequest } from "@/lib/matrix/types";

type Body = { model?: string; messages?: { role: string; content: string; tool_name?: string; tool_calls?: unknown[] }[]; options?: { num_predict?: number }; tools?: { function: { name: string } }[] };
type ResponseScript = unknown[] | ((body: Body) => unknown[]);
const say = (content: string, name?: string, args?: Record<string, unknown>) => [{ message: { role: "assistant", content, ...(name ? { tool_calls: [{ function: { name, arguments: args || {} } }] } : {}) } }, { done: true }];
const decode = (text: string) => text.split("\n\n").filter(block => block.startsWith("data:")).map(block => JSON.parse(block.slice(5)));

test.describe.serial("Matrix mechanics through Ollama tools", () => {
  test.skip(process.env.ISOLATED_TEST_SERVER !== "1", "Runs only in the isolated disposable server/database.");
  const scripts: ResponseScript[] = [];
  const calls: { path: string; body: Body; auth?: string }[] = [];
  const ids: number[] = [];
  let server: http.Server;
  let endpoint = "";
  let redId = 0;
  let blueId = 0;
  async function chat(request: APIRequestContext, body: object) {
    const result = await request.post("/api/chat", { data: { turnId: crypto.randomUUID(), ...body } });
    expect(result.status(), await result.text()).toBe(200);
    const events = decode(await result.text());
    expect(events.filter(event => event.type === "error")).toEqual([]);
    expect(events.at(-1).type).toBe("done");
    return events;
  }
  async function create(request: APIRequestContext) {
    const response = await request.post("/api/games", { data: { title: "__matrix_integration__", masterProfile: "immersive" } });
    expect(response.status()).toBe(201);
    const session = await response.json(); ids.push(session.game.id); return session;
  }
  test.beforeAll(async ({ request }) => {
    server = http.createServer(async (req, res) => {
      const parts: Buffer[] = []; for await (const part of req) parts.push(part as Buffer);
      const raw = Buffer.concat(parts).toString(); const body: Body = raw ? JSON.parse(raw) : {};
      calls.push({ path: req.url || "", body, auth: req.headers.authorization });
      if (req.url === "/api/show") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ capabilities: ["completion", "tools"] })); return; }
      if (req.url === "/api/tags") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ models: [{ name: "matrix-test" }] })); return; }
      if (req.url !== "/api/chat") { res.statusCode = 404; res.end(); return; }
      if (body.options?.num_predict === 16) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ message: { content: "OK" } })); return; }
      const script = scripts.shift();
      if (!script) { res.statusCode = 500; res.end(JSON.stringify({ error: "Missing test script" })); return; }
      const data = typeof script === "function" ? script(body) : script;
      res.setHeader("Content-Type", "application/x-ndjson"); res.end(data.map(item => JSON.stringify(item)).join("\n") + "\n");
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const connected = await request.post("/api/settings", { data: { provider: "ollama", mode: "local", baseUrl: endpoint, model: "matrix-test", numCtx: 16384 } });
    expect(connected.status(), await connected.text()).toBe(200);
  });
  test.afterAll(async ({ request }) => {
    server?.closeAllConnections(); await new Promise<void>(resolve => server?.close(() => resolve()));
    if (ids.length) await db.delete(games).where(inArray(games.id, ids));
    await request.delete("/api/settings");
  });

  test("create session with built-in rules and Morpheus introduction without invoking the model", async ({ request }) => {
    const before = calls.length;
    const session = await create(request); redId = session.game.id;
    expect(calls.length).toBe(before);
    expect(session.game.ruleset).toBe("matrix-artefato");
    expect(session.messages[0].content).toContain("Sou Morpheus");
    expect(session.game.files).toEqual([]);
    const identity = await request.post(`/api/games/${redId}/identify`);
    expect(identity.status()).toBe(200);
    expect((await identity.json()).systemName).toContain("Dan Aguiar");
    expect(calls.length).toBe(before);
  });

  test("Morpheus uses the actual Matrix rulebook and records a partial character, not D&D stats", async ({ request }) => {
    scripts.push(say("", "get_character"), say("Vou registrar suas escolhas.", "set_character", { name: "Kai", path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", complete: true, attributes: "Força 18, Destreza 12" }), say("Sua ficha está pronta para revisão. Você aprova?"));
    const events = await chat(request, { gameId: redId, message: "Sou Kai, soldado resgatado pela equipe Ordeira. Minha afinidade é Corpo." });
    const sheet = events.filter(event => event.type === "character").at(-1)!;
    expect(sheet).toMatchObject({ name: "Kai", complete: false, data: { matrix: { path: "red", health: 5, dm: 3, pd: 5, favored: "Corpo" } } });
    expect(sheet.data.attributes).toEqual({ Corpo: "Afinidade", Mente: "Sem afinidade", Social: "Sem afinidade" });
    const prompt = calls.filter(call => call.path === "/api/chat").at(-1)!.body.messages![0].content;
    expect(prompt).toContain("Você é MORPHEUS");
    expect(prompt).toContain("DM é um CONTADOR");
    expect(prompt).toContain("MENOR");
    expect(prompt).toContain("Resgatado");
  });

  test("approval is an explicit player action and persists before the adventure", async ({ request }) => {
    scripts.push(say("A ficha está aprovada. Um telefone toca no corredor vazio."));
    const events = await chat(request, { gameId: redId, action: "approve_character" });
    expect(events.filter(event => event.type === "character").at(-1)).toMatchObject({ complete: true });
    const session = await (await request.get(`/api/games/${redId}`)).json();
    expect(session.character.complete).toBe(true);
  });

  test("consult_rulebook returns the embedded Trinity section with attribution/page reference", async ({ request }) => {
    scripts.push(say("Consultando as anomalias.", "consult_rulebook", { sectionId: "trinity" }), say("Trinity compara os dois dados com o DM. O DM não é rolado."));
    const events = await chat(request, { gameId: redId, message: "O que é Trinity?" });
    expect(events.some(event => event.type === "consult")).toBe(true);
    const sent = calls.filter(call => call.path === "/api/chat").at(-1)!.body.messages!;
    const reply = sent.at(-1)!;
    expect(reply.tool_name).toBe("consult_rulebook");
    expect(JSON.parse(reply.content).results[0]).toMatchObject({ sectionId: "trinity", page: 4 });
    expect(reply.content).toContain("Firewall Desativado");
  });

  test("requested 2d6 uses the actual faces, updates DM once and survives retries", async ({ request }) => {
    scripts.push(say("", "get_character"), say("Você tenta passar pela patrulha.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Mente", reason: "Enganar o sistema" }));
    const asked = await chat(request, { gameId: redId, message: "Tento enganar o sistema de vigilância." });
    const pending = asked.find(event => event.type === "roll_request") as MatrixRollRequest;
    expect(pending).toMatchObject({ kind: "attribute", notation: "2d6", attribute: "Mente" });
    const before = await (await request.get(`/api/games/${redId}`)).json();
    expect(before.pendingRequest.id).toBe(pending.id);
    const rolled = await request.post("/api/roll", { data: { gameId: redId, notation: "2d6", requestId: pending.id } });
    expect(rolled.status()).toBe(200);
    const dice = await rolled.json();
    const expected = resolveMatrixRoll(before.character.data.matrix, dice, pending);
    const turnId = crypto.randomUUID();
    scripts.push(say("O sistema responde ao resultado que você obteve."));
    const result = await chat(request, { gameId: redId, turnId, diceResult: { rollId: dice.rollId, total: 999, rolls: [999] } });
    expect(result.find(event => event.type === "roll_resolved").resolution).toEqual(expected.resolution);
    expect(result.find(event => event.type === "character").data.matrix.dm).toBe(expected.state.dm);
    const after = await (await request.get(`/api/games/${redId}`)).json();
    expect(after.pendingRequest).toBeNull();
    const modelInput = calls.filter(call => call.path === "/api/chat").at(-1)!.body.messages!.at(-1)!.content;
    expect(modelInput).toContain("RESULTADO OFICIAL DO SISTEMA — DEFINITIVO");
    expect(modelInput).toContain("Resultado dos dados:");
    expect(modelInput).toContain(`DM antes: ${expected.resolution.dmBefore}. DM depois: ${expected.resolution.dmAfter}.`);
    expect(modelInput).toContain("Não reavalie, altere ou substitua");
    expect(modelInput).not.toContain("999");
    scripts.push(say("A consequência já foi registrada. Vamos continuar."));
    await chat(request, { gameId: redId, turnId, diceResult: { rollId: dice.rollId } });
    const again = await (await request.get(`/api/games/${redId}`)).json();
    expect(again.character.data.matrix.dm).toBe(expected.state.dm);
    const stored = await db.select().from(messages).where(eq(messages.gameId, redId));
    expect(stored.filter(row => row.meta?.sourceRollId === dice.rollId)).toHaveLength(1);
    const reused = await request.post("/api/chat", { data: { gameId: redId, turnId: crypto.randomUUID(), diceResult: { rollId: dice.rollId } } });
    expect(reused.status()).toBe(409);
    expect((await reused.json()).code).toBe("ROLL_ALREADY_USED");
  });

  test("DM crossing to 5 automatically creates an immediate Humanity request before model narration", async ({ request }) => {
    const fresh = await create(request);
    scripts.push(say("", "get_character"), say("", "set_character", { name: "Relay", path: "blue", antecedent: "Hacker", favored: "Mente", function: "Fantasma" }), say("Ficha criada."));
    await chat(request, { gameId: fresh.game.id, message: "Sou Relay, hacker, Fantasma." });
    // Set DM to 4 through an authoritative, already-saved state for this deterministic trigger check.
    await db.execute((await import("drizzle-orm")).sql`update characters set data = jsonb_set(data, '{matrix,dm}', '4') where game_id = ${fresh.game.id}`);
    scripts.push(say("", "get_character"), say("Você tenta uma ação fora da sua afinidade.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Teste de Corpo" }));
    const asked = await chat(request, { gameId: fresh.game.id, message: "Tento atravessar a barreira." });
    const pending = asked.find(event => event.type === "roll_request") as MatrixRollRequest;
    const before = await (await request.get(`/api/games/${fresh.game.id}`)).json();
    let dice: { rollId: number; rolls: number[] } | null = null;
    for (let tries = 0; tries < 30; tries++) {
      const candidate = await (await request.post("/api/roll", { data: { gameId: fresh.game.id, notation: "2d6", requestId: pending.id } })).json();
      // Blue, non-affinity Corpo: highest face is selected. Any 5/6 fails against DM4 and crosses DM5.
      if (Math.max(...candidate.rolls) >= 5) { dice = candidate; break; }
    }
    expect(dice).not.toBeNull();
    const result = await chat(request, { gameId: fresh.game.id, diceResult: { rollId: dice!.rollId } });
    expect(result.find(event => event.type === "roll_request")).toMatchObject({ kind: "humanity", notation: "2d6" });
    expect(result.find(event => event.type === "text").text).toContain("Humanidade");
    const after = await (await request.get(`/api/games/${fresh.game.id}`)).json();
    expect(after.character.data.matrix).toMatchObject({ dm: 5, humanityTestDue: true });
    expect(before.character.data.matrix.dm).toBe(4);
  });

  test("free/changed rolls preserve a pending test and do not mutate DM", async ({ request }) => {
    scripts.push(say("", "get_character"), say("Role seu teste.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Esquiva" }));
    const events = await chat(request, { gameId: redId, message: "Tento esquivar." });
    const pending = events.find(event => event.type === "roll_request");
    const before = await (await request.get(`/api/games/${redId}`)).json();
    const dice = await (await request.post("/api/roll", { data: { gameId: redId, notation: "1d6+2", requestId: pending.id } })).json();
    expect(dice.matchedRequest).toBe(false);
    scripts.push(say("Você rolou um dado diferente. O teste de esquiva continua pendente."));
    await chat(request, { gameId: redId, diceResult: { rollId: dice.rollId } });
    const after = await (await request.get(`/api/games/${redId}`)).json();
    expect(after.pendingRequest.id).toBe(pending.id);
    expect(after.character.data.matrix.dm).toBe(before.character.data.matrix.dm);
  });

  test("another campaign's roll and unsupported dice are rejected", async ({ request }) => {
    const session = await create(request);
    const dice = await (await request.post("/api/roll", { data: { gameId: session.game.id, notation: "1d6" } })).json();
    const forged = await request.post("/api/chat", { data: { gameId: redId, diceResult: { rollId: dice.rollId } } });
    expect(forged.status()).toBe(400);
    expect((await forged.json()).code).toBe("ROLL_NOT_FOUND");
    for (const notation of ["1d20", "4dF", "DM"]) expect((await request.post("/api/roll", { data: { gameId: redId, notation } })).status()).toBe(400);
  });

  test("Reconectado sheet uses Humanity and inverted checks, not Distortion", async ({ request }) => {
    blueId = (await create(request)).game.id;
    scripts.push(say("", "get_character"), say("Registrando sua reinserção.", "set_character", { name: "Echo", path: "blue", antecedent: "Hacker", favored: "Mente", function: "Fantasma" }), say("Você tem 4 de Humanidade, Saúde 5 e DM 2."));
    console.log("BLUE_SCRIPTS_BEFORE", scripts.length, "BLUE_ID", blueId, "ENDPOINT", endpoint);
    const events = await chat(request, { gameId: blueId, message: "Echo, hacker, Fantasma reconectado." });
    expect(events.filter(event => event.type === "character").at(-1)).toMatchObject({ data: { matrix: { dm: 2, ph: 4, phMax: 4, pd: 0, path: "blue" } } });
    scripts.push(say("", "get_character"), say("Faça um teste de Mente.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Mente", reason: "Controlar aparelho" }));
    const asked = await chat(request, { gameId: blueId, message: "Tento controlar o aparelho." });
    const pending = asked.find(event => event.type === "roll_request");
    const dice = await (await request.post("/api/roll", { data: { gameId: blueId, notation: "2d6", requestId: pending.id } })).json();
    scripts.push(say("Interpreto o resultado recebido."));
    const done = await chat(request, { gameId: blueId, diceResult: { rollId: dice.rollId } });
    expect(done.find(event => event.type === "roll_resolved").resolution).toMatchObject({ selection: "Menor dado", value: Math.min(...dice.rolls), target: 2 });
  });

  test("Morpheus receives tool errors rather than silently creating foreign-system requests", async ({ request }) => {
    scripts.push(say("", "get_character"), say("", "request_player_roll", { notation: "1d20", kind: "attribute", attribute: "Corpo", reason: "Teste" }), body => {
      const result = JSON.parse(body.messages!.at(-1)!.content);
      expect(result.error).toContain("apenas d6");
      return say("Usaremos somente os d6 do Matrix.");
    });
    const events = await chat(request, { gameId: blueId, message: "Como devo rolar?" });
    expect(events.some(event => event.type === "roll_request")).toBe(false);
  });

  test("a risky verb does not override Morpheus: a clear premature outcome is revised without inventing a roll", async ({ request }) => {
    const fresh = await create(request);
    await db.insert(characters).values({ gameId: fresh.game.id, name: "Kai", complete: true,
      data: { matrix: { path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", scene: "matrix",
        health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5, ph: 0, phMax: 0, motivationUnderstood: false,
        chosen: false, dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0 } } });
    scripts.push(
      say("Você consegue saltar sobre o balcão e derruba o guarda antes que ele reaja."),
      body => { expect(body.messages!.at(-1)!.content).toContain("BLOQUEIO DE RESULTADO"); return say("O guarda está logo adiante. O que deseja fazer?"); },
    );
    const events = await chat(request, { gameId: fresh.game.id, message: "Eu pulo o balcão e derrubo o guarda." });
    expect(events.some(event => event.type === "roll_request")).toBe(false); // software doesn't decide the GM's test
    const narration = events.filter(event => event.type === "text").map(event => event.text).join(" ");
    expect(narration).toContain("O guarda está logo adiante");
    expect(narration).not.toContain("derruba o guarda");
    const reopened = await (await request.get(`/api/games/${fresh.game.id}`)).json();
    expect(reopened.pendingRequest).toBeNull();
    expect(reopened.character.data.matrix.dm).toBe(3);
  });

  test("request_player_roll stops the turn, preserves safe preceding scene, and waits for the player's real roll", async ({ request }) => {
    const fresh = await create(request);
    await db.insert(characters).values({ gameId: fresh.game.id, name: "Kai", complete: true,
      data: { matrix: { path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", scene: "matrix",
        health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5, ph: 0, phMax: 0, motivationUnderstood: false,
        chosen: false, dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0 } } });
    scripts.push(
      say("", "get_character"),
      say("As balas marcam a parede atrás de você. O Agente se aproxima; o vão entre os prédios é grande. Se quiser saltar, faça um teste de Corpo.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Saltar entre prédios" }),
    );
    const events = await chat(request, { gameId: fresh.game.id, message: "Eu salto entre os prédios." });
    expect(events.find(event => event.type === "roll_request")).toMatchObject({ kind: "attribute", notation: "2d6", attribute: "Corpo" });
    const narration = events.filter(event => event.type === "text").map(event => event.text).join(" ");
    expect(narration).toContain("As balas marcam a parede");
    expect(narration).toContain("role 2d6 na bandeja");
    expect(narration).not.toContain("Você alcança o outro prédio");
    expect((await (await request.get(`/api/games/${fresh.game.id}`)).json()).pendingRequest).toBeTruthy();
    const state = (await (await request.get(`/api/games/${fresh.game.id}`)).json()).character.data.matrix;
    expect(state).toMatchObject({ dm: 3, health: 5 });
  });

  test("mixed pre-roll outcome is suppressed and later parallel tools have no side effects", async ({ request }) => {
    const fresh = await create(request);
    await db.insert(characters).values({ gameId: fresh.game.id, name: "Kai", complete: true,
      data: { matrix: { path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", scene: "matrix",
        health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5, ph: 0, phMax: 0, motivationUnderstood: false,
        chosen: false, dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0 } } });
    scripts.push(say("", "get_character"), [
      { message: { role: "assistant", content: "Faça um teste de Corpo. Você salta e consegue alcançar o outro prédio.", tool_calls: [
        { function: { name: "request_player_roll", arguments: { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Saltar entre prédios" } } },
        { function: { name: "set_character", arguments: { name: "Kai", dm: 6, health: 1 } } },
      ] } }, { done: true },
    ]);
    const events = await chat(request, { gameId: fresh.game.id, message: "Tento saltar entre os prédios." });
    expect(events.find(event => event.type === "roll_request")).toMatchObject({ notation: "2d6", kind: "attribute" });
    const narration = events.filter(event => event.type === "text").map(event => event.text).join(" ");
    expect(narration).not.toContain("Você salta");
    expect(narration).toContain("role 2d6 na bandeja");
    const reopened = await (await request.get(`/api/games/${fresh.game.id}`)).json();
    expect(reopened.pendingRequest.id).toBe(events.find(event => event.type === "roll_request").id);
    expect(reopened.character.data.matrix).toMatchObject({ dm: 3, health: 5 });
  });

  for (const scenario of [
    { label: "official FAILURE", faces: [1, 2], dm: 4, wrong: "Você consegue passar pelo guarda.", right: "O teste falhou. O guarda impede sua passagem." },
    { label: "official SUCCESS", faces: [4, 5], dm: 3, wrong: "Você falhou no teste e errou o salto.", right: "O teste foi um sucesso. Você atravessa em segurança." },
  ]) {
    test(`${scenario.label}: the structured result cannot be reversed by Morpheus`, async ({ request }) => {
      const fresh = await create(request);
      await db.insert(characters).values({ gameId: fresh.game.id, name: "Kai", complete: true,
        data: { matrix: { path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", scene: "matrix",
          health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5, ph: 0, phMax: 0, motivationUnderstood: false,
          chosen: false, dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0 } } });
      scripts.push(say("", "get_character"), say("O guarda se aproxima.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Atravessar a passarela" }));
      const asked = await chat(request, { gameId: fresh.game.id, message: "Eu tento atravessar a passarela." });
      const pending = asked.find(event => event.type === "roll_request") as MatrixRollRequest;
      expect(asked.some(event => event.type === "roll_resolved")).toBe(false); // requestCreated !== rollResolved
      const before = await (await request.get(`/api/games/${fresh.game.id}`)).json();
      expect(before.character.data.matrix.dm).toBe(3);
      const [record] = await db.insert(messages).values({ gameId: fresh.game.id, role: "tool", content: "Dado registrado", meta: {
        rollRecord: true, result: { notation: "2d6", rolls: scenario.faces, total: scenario.faces[0] + scenario.faces[1], modifier: 0,
          detail: `2d6[${scenario.faces.join(", ")}]`, reason: pending.reason, requestId: pending.id, requested: true, matchedRequest: true },
      } }).returning({ id: messages.id });
      scripts.push(say(scenario.wrong), body => {
        expect(body.messages!.at(-1)!.content).toContain("RESULTADO OFICIAL");
        return say(scenario.right);
      });
      const done = await chat(request, { gameId: fresh.game.id, diceResult: { rollId: record.id } });
      const resolution = done.find(event => event.type === "roll_resolved")?.resolution;
      expect(resolution).toMatchObject({ success: scenario.dm === 3, dmAfter: scenario.dm });
      const narration = done.filter(event => event.type === "text").map(event => event.text).join(" ");
      expect(narration).toContain(scenario.right);
      expect(narration).not.toContain(scenario.wrong);
      const call = calls.filter(item => item.path === "/api/chat").at(-1)!;
      const resultInput = call.body.messages!.find(item => item.role === "user" && item.content.includes("RESULTADO OFICIAL DO SISTEMA"))!;
      expect(resultInput.content).toContain(scenario.dm === 3 ? "Resultado: SUCESSO" : "Resultado: FALHA");
      expect(resultInput.content).toContain(`DM antes: 3. DM depois: ${scenario.dm}.`);
      expect(resultInput.content).toContain("definitivo");
      expect((await (await request.get(`/api/games/${fresh.game.id}`)).json()).character.data.matrix.dm).toBe(scenario.dm);
    });
  }

  test("missed attack cannot create a damage roll or overwrite the official DM", async ({ request }) => {
    const fresh = await create(request);
    await db.insert(characters).values({ gameId: fresh.game.id, name: "Kai", complete: true,
      data: { matrix: { path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", scene: "matrix",
        health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5, ph: 0, phMax: 0, motivationUnderstood: false,
        chosen: false, dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0 } } });
    scripts.push(say("", "get_character"), say("Ataque contra o guarda.", "request_player_roll", { notation: "2d6", kind: "attribute", attribute: "Corpo", reason: "Atacar guarda" }));
    const asked = await chat(request, { gameId: fresh.game.id, message: "Ataco o guarda." });
    const pending = asked.find(event => event.type === "roll_request");
    const [record] = await db.insert(messages).values({ gameId: fresh.game.id, role: "tool", content: "Dado", meta: { rollRecord: true,
      result: { notation: "2d6", rolls: [1, 2], total: 3, modifier: 0, detail: "2d6[1, 2]", reason: "Atacar guarda", requestId: pending.id, requested: true, matchedRequest: true },
    } }).returning({ id: messages.id });
    scripts.push(say("", "get_character"), say("", "request_player_roll", { notation: "1d6", kind: "damage", reason: "Dano do ataque que falhou" }),
      body => { expect(JSON.parse(body.messages!.at(-1)!.content).error).toContain("ataque falhou"); return say("O ataque falhou; o guarda ainda está de pé."); });
    const events = await chat(request, { gameId: fresh.game.id, diceResult: { rollId: record.id } });
    expect(events.some(event => event.type === "roll_request")).toBe(false);
    expect((await (await request.get(`/api/games/${fresh.game.id}`)).json()).character.data.matrix.dm).toBe(4);
  });

  test("free dice have no official verdict, no sheet changes and cannot be reused for a later action", async ({ request }) => {
    const fresh = await create(request);
    await db.insert(characters).values({ gameId: fresh.game.id, name: "Kai", complete: true,
      data: { matrix: { path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", scene: "matrix",
        health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5, ph: 0, phMax: 0, motivationUnderstood: false,
        chosen: false, dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0 } } });
    const [record] = await db.insert(messages).values({ gameId: fresh.game.id, role: "tool", content: "Livre", meta: { rollRecord: true,
      result: { notation: "2d6", rolls: [6, 6], total: 12, modifier: 0, detail: "2d6[6, 6]", reason: "livre", requested: false, matchedRequest: false },
    } }).returning({ id: messages.id });
    scripts.push(say("", "get_character"), say("", "set_character", { name: "Kai", dm: 6, pd: 0, health: 1 }), say("Para que quer usar essa rolagem livre?"));
    const events = await chat(request, { gameId: fresh.game.id, diceResult: { rollId: record.id } });
    expect(events.find(event => event.type === "roll_resolved")?.resolution).toMatchObject({ kind: "free" });
    expect(events.find(event => event.type === "roll_resolved")?.resolution).not.toHaveProperty("success");
    expect((await (await request.get(`/api/games/${fresh.game.id}`)).json()).character.data.matrix).toMatchObject({ dm: 3, pd: 5, health: 5 });
    const modelMessages = calls.filter(item => item.path === "/api/chat").at(-1)!.body.messages!;
    expect(modelMessages.filter(item => item.role === "user").some(item => item.content.includes("RESULTADO OFICIAL DO SISTEMA"))).toBe(false);
    expect(modelMessages.filter(item => item.role === "user").some(item => item.content.includes("ROLAGEM LIVRE DO JOGADOR — SEM RESULTADO MECÂNICO OFICIAL"))).toBe(true);
    const reused = await request.post("/api/chat", { data: { gameId: fresh.game.id, diceResult: { rollId: record.id }, message: "Quero usar o dado para um ataque" } });
    expect(reused.status()).toBe(409);
    expect((await reused.json()).code).toBe("ROLL_ALREADY_USED");
    expect((await (await request.get(`/api/games/${fresh.game.id}`)).json()).pendingRequest).toBeNull();
  });

  test("Chosen status is granted only after motivation and official 6d6 faces", async ({ request }) => {
    const fresh = await create(request);
    await db.insert(characters).values({ gameId: fresh.game.id, name: "Kai", complete: true,
      data: { matrix: { path: "red", antecedent: "Soldado", favored: "Corpo", team: "Ordeira", scene: "matrix",
        health: 5, maxHealth: 5, dm: 3, pd: 5, pdMax: 5, ph: 0, phMax: 0, motivation: "Salvar a verdade", motivationUnderstood: true,
        chosen: false, dejaVu: false, firewall: false, humanityTestDue: false, scrap: 0 } } });
    scripts.push(say("", "get_character"), say("", "request_player_roll", { notation: "6d6", kind: "chosen", reason: "Condição do Escolhido" }));
    const asked = await chat(request, { gameId: fresh.game.id, message: "Compreendi minha motivação. Quero testar a condição do Escolhido." });
    const pending = asked.find(event => event.type === "roll_request");
    expect(pending).toMatchObject({ kind: "chosen", notation: "6d6" });
    const [record] = await db.insert(messages).values({ gameId: fresh.game.id, role: "tool", content: "Dado", meta: { rollRecord: true,
      result: { notation: "6d6", rolls: [6, 1, 5, 2, 4, 3], total: 21, modifier: 0, detail: "6d6[6,1,5,2,4,3]", reason: pending.reason, requestId: pending.id, requested: true, matchedRequest: true },
    } }).returning({ id: messages.id });
    scripts.push(say("O resultado oficial confirma o Escolhido."));
    const events = await chat(request, { gameId: fresh.game.id, diceResult: { rollId: record.id } });
    expect(events.find(event => event.type === "roll_resolved")?.resolution).toMatchObject({ kind: "chosen", success: true });
    expect((await (await request.get(`/api/games/${fresh.game.id}`)).json()).character.data.matrix.chosen).toBe(true);
  });

  test("meta report from the persona is blocked and the game resumes", async ({ request }) => {
    scripts.push(
      say("### RELATÓRIO DE CORREÇÃO DE PERSISTÊNCIA\n\nNota Técnica para o Arquiteto: o prompt abaixo fecha a brecha da subjetividade. [SESSÃO ENCERRADA]"),
      body => {
        expect(body.messages!.at(-1)!.content).toContain("PROTOCOLO PRM-01");
        return say("Você segue pelos esgotos. Um telefone toca em algum lugar à frente. O que você faz?");
      },
    );
    const events = await chat(request, { gameId: redId, message: "continuar" });
    expect(events.filter(e => e.type === "error")).toHaveLength(0);
    const narration = events.filter(e => e.type === "text").map(e => e.text).join(" ");
    expect(narration).not.toContain("RELATÓRIO");
    expect(narration).not.toContain("Arquiteto");
    expect(narration).toContain("esgotos");
  });

  test("incomplete characters cannot be approved and rules cannot be replaced by PDF", async ({ request }) => {
    const fresh = await create(request);
    const approval = await request.post("/api/chat", { data: { gameId: fresh.game.id, action: "approve_character" } });
    expect(approval.status()).toBe(400); expect((await approval.json()).code).toBe("SHEET_INCOMPLETE");
    expect((await request.post("/api/games", { multipart: { title: "another system" } })).status()).toBe(400);
    expect((await request.delete("/api/rulebook")).status()).toBe(405);
  });
  test("a promise to request dice without a tool becomes a real request, not a technical warning", async ({ request }) => {
    const fresh = await create(request);
    scripts.push(say("Vou solicitar sua rolagem de 1d6. Aguarde o pedido do sistema."));
    const events = await chat(request, { gameId: fresh.game.id, message: "Quero sortear minha equipe." });
    expect(events.filter(e => e.type === "error")).toHaveLength(0);
    expect(events.find(e => e.type === "roll_request")).toMatchObject({ notation: "1d6", kind: "table" });
    expect(events.filter(e => e.type === "text").map(e => e.text).join(" ")).not.toContain("Protocolo de Rigidez");
  });
});
