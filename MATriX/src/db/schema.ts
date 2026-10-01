import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// ATENÇÃO: ao alterar as tabelas deste arquivo, atualize também
// src/db/bootstrap.ts (criação automática do banco em novas instalações).

type StoredPage = { file: string; page: number; text: string };
type StoredFile = { name: string; chars: number };

// Livros de regras já lidos e indexados (pasta rulebooks/ ou salvos pelo site).
export const rulebooks = pgTable("rulebooks", {
  id: serial("id").primaryKey(),
  // Identifica o conteúdo exato dos PDFs; evita ler o mesmo livro duas vezes.
  key: text("key").notNull().unique("rulebooks_key_unique"),
  name: text("name").notNull(),
  source: text("source").notNull().default("upload"), // "folder" | "upload"
  isDefault: boolean("is_default").notNull().default(false),
  files: jsonb("files").$type<StoredFile[]>().notNull().default([]),
  pages: jsonb("pages").$type<StoredPage[]>().notNull().default([]),
  rulesText: text("rules_text").notNull().default(""),
  systemName: text("system_name").notNull().default(""),
  systemSummary: text("system_summary").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A game campaign / session container
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Nova Campanha"),
  masterProfile: text("master_profile").notNull().default("balanced"),
  // Full extracted rules text from all uploaded PDFs (concatenated).
  rulesText: text("rules_text").notNull().default(""),
  // Page-by-page text so the Master can search/consult the rulebook.
  pages: jsonb("pages").$type<StoredPage[]>().default([]),
  // Game system identified by the AI from the PDF.
  systemName: text("system_name").notNull().default(""),
  systemSummary: text("system_summary").notNull().default(""),
  files: jsonb("files").$type<StoredFile[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Livro fixo usado pela campanha (se houver).
  rulebookId: integer("rulebook_id").references(() => rulebooks.id, { onDelete: "set null" }),
});

// Character sheet linked to a game
export const characters = pgTable("characters", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Aventureiro"),
  data: jsonb("data").$type<CharacterData>().notNull(),
  complete: boolean("complete").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chat messages between the player and the AI game master
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CharacterData = {
  matrix?: import("@/lib/matrix/types").MatrixState;
  concept?: string;
  race?: string;
  class?: string;
  level?: number;
  attributes?: Record<string, string | number>;
  resources?: string;
  skills?: string;
  equipment?: string;
  background?: string;
  notes?: string;
};

// Configurações do app (ex.: chave do Gemini informada pelo site).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Game = typeof games.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Rulebook = typeof rulebooks.$inferSelect;
