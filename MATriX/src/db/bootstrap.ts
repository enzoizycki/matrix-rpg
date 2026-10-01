import { db } from "@/db";
import { sql } from "drizzle-orm";

// Cria as tabelas na primeira execução, sem nenhum passo manual de instalação.
// É idempotente: pode rodar a cada inicialização sem alterar dados existentes.
// Mantenha em sincronia com src/db/schema.ts.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS rulebooks (
  id serial PRIMARY KEY NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'upload',
  is_default boolean NOT NULL DEFAULT false,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules_text text NOT NULL DEFAULT '',
  system_name text NOT NULL DEFAULT '',
  system_summary text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT rulebooks_key_unique UNIQUE (key)
);

CREATE TABLE IF NOT EXISTS games (
  id serial PRIMARY KEY NOT NULL,
  title text NOT NULL DEFAULT 'Nova Campanha',
  master_profile text NOT NULL DEFAULT 'balanced',
  rules_text text NOT NULL DEFAULT '',
  pages jsonb DEFAULT '[]'::jsonb,
  system_name text NOT NULL DEFAULT '',
  system_summary text NOT NULL DEFAULT '',
  files jsonb DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  rulebook_id integer
);

-- Bancos criados por versões anteriores podem não ter estas colunas.
ALTER TABLE games ADD COLUMN IF NOT EXISTS pages jsonb DEFAULT '[]'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS system_name text NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS system_summary text NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS rulebook_id integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_rulebook_id_rulebooks_id_fk') THEN
    ALTER TABLE games ADD CONSTRAINT games_rulebook_id_rulebooks_id_fk
      FOREIGN KEY (rulebook_id) REFERENCES rulebooks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS characters (
  id serial PRIMARY KEY NOT NULL,
  game_id integer NOT NULL,
  name text NOT NULL DEFAULT 'Aventureiro',
  data jsonb NOT NULL,
  complete boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT characters_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS complete boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY NOT NULL,
  game_id integer NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  meta jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT messages_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY NOT NULL,
  value text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
`;

const LOCK_ID = 727001; // evita corrida entre processos iniciando ao mesmo tempo
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Tenta por alguns segundos: o banco pode ainda estar iniciando (ex.: Docker). */
export async function bootstrapDatabase(attempts = 15): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_ID})`);
        await tx.execute(sql.raw(SCHEMA_SQL));
      });
      return;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(2000);
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível preparar o banco de dados.");
}
