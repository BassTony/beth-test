import { InferModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
});

export type Todo = InferModel<typeof todos>;

export const messages = sqliteTable("messages", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  nick: text("nick").notNull(),
  message: text("message").notNull(),
  time: integer("timestamp", {mode: "timestamp_ms"}).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type Message = InferModel<typeof messages>;
