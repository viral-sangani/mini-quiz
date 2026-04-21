import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH =
  process.env.QUIZ_DB_PATH ??
  (process.env.VERCEL ? "/tmp/quiz.db" : path.join(process.cwd(), "quiz.db"));

type Globals = typeof globalThis & { __miniQuizDb?: Database.Database };
const g = globalThis as Globals;

function hasSchema(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='rooms' LIMIT 1`
    )
    .get();
  return !!row;
}

function initDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  if (!hasSchema(db)) {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "lib", "schema.sql"),
      "utf8"
    );
    db.exec(schema);
  }
  return db;
}

export function getDb(): Database.Database {
  if (!g.__miniQuizDb) g.__miniQuizDb = initDb();
  return g.__miniQuizDb;
}
