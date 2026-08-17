import * as SQLite from "expo-sqlite";

/**
 * The on-device database.
 *
 * Only chat lives here. Everything else the app caches is a whole JSON
 * response with no queries run against it, which is what
 * `utils/offlineCache.ts` is for. Messages are different: they need ordering,
 * pagination and a "what's newer than X" question, and a JSON blob answers
 * none of those without parsing the entire history on every read.
 *
 * `payload` columns hold the full server object. The typed columns beside them
 * exist only so SQLite can index and filter — reactions, replyTo, event cards
 * and order cards ride along in the JSON untouched, so a new message field
 * needs no migration here.
 */

const DB_NAME = "cityvibe.db";

const MIGRATIONS: string[] = [
  // v1 — chats, messages and the offline send queue.
  `
  CREATE TABLE IF NOT EXISTS chats (
    id        TEXT PRIMARY KEY NOT NULL,
    scope     TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    payload   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chats_scope ON chats(scope, updatedAt DESC);

  CREATE TABLE IF NOT EXISTS messages (
    id        TEXT PRIMARY KEY NOT NULL,
    chatId    TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    senderId  TEXT,
    type      TEXT,
    content   TEXT,
    imageUrl  TEXT,
    payload   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chatId, createdAt DESC);

  CREATE TABLE IF NOT EXISTS outbox (
    tempId    TEXT PRIMARY KEY NOT NULL,
    chatId    TEXT NOT NULL,
    body      TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    attempts  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_chat ON outbox(chatId, createdAt ASC);
  `,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  // WAL keeps reads from blocking on the socket writes that land constantly in
  // a busy chat.
  await db.execAsync("PRAGMA journal_mode = WAL;");
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.execAsync(MIGRATIONS[version]);
    // PRAGMA doesn't take bound parameters, and `version` is a loop counter,
    // never user input.
    await db.execAsync(`PRAGMA user_version = ${version + 1};`);
  }
}

/**
 * The shared connection. Every caller awaits the same promise, so the
 * migration runs exactly once even if three screens ask at the same moment.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await migrate(db);
      return db;
    });
    // A failed open must not be cached forever — the next caller should retry
    // rather than inherit a permanently rejected promise.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}
