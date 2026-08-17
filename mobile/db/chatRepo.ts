import { getDb } from "@/db";
import type { Chat, ChatScope, Message } from "@/services/chat.service";

/**
 * The local chat store — reads and writes against SQLite.
 *
 * Everything here is best-effort: a failed local write must never break a
 * network path that already succeeded, and a failed local read just means the
 * screen paints from the network like it always used to. That is why almost
 * every function swallows its errors rather than throwing at the caller.
 */

/** Newest-per-chat retention. Roughly a year of a busy group chat. */
const MAX_MESSAGES_PER_CHAT = 2000;
/** Chats untouched for this long are dropped wholesale on the next launch. */
const CHAT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

interface MessageRow {
  payload: string;
}

const toEpoch = (iso?: string): number => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : Date.now();
};

/** Optimistic messages carry a client-side id and are replaced by the real one. */
const isTemp = (id: string) => id.startsWith("temp_");

function parseRows(rows: MessageRow[]): Message[] {
  const out: Message[] = [];
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.payload) as Message);
    } catch {
      // One unparseable row shouldn't sink the page.
    }
  }
  return out;
}

export async function upsertMessages(messages: Message[]): Promise<void> {
  const real = messages.filter((m) => m?._id && !isTemp(m._id));
  if (real.length === 0) return;
  try {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const m of real) {
        await db.runAsync(
          `INSERT INTO messages (id, chatId, createdAt, senderId, type, content, imageUrl, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             createdAt = excluded.createdAt,
             senderId  = excluded.senderId,
             type      = excluded.type,
             content   = excluded.content,
             imageUrl  = excluded.imageUrl,
             payload   = excluded.payload`,
          [
            m._id,
            typeof m.chat === "string" ? m.chat : (m.chat as any)?._id ?? "",
            toEpoch(m.createdAt),
            m.sender?._id ?? null,
            m.type ?? null,
            m.content ?? null,
            m.imageUrl ?? null,
            JSON.stringify(m),
          ]
        );
      }
    });
  } catch {
    // Local persistence is an optimization, not a requirement.
  }
}

/**
 * One page of history, oldest-first to match how the chat screen holds its
 * list. Pass `before` (epoch ms) to walk backwards through older pages.
 */
export async function getMessagesPage(
  chatId: string,
  { before, limit = 50 }: { before?: number; limit?: number } = {}
): Promise<Message[]> {
  try {
    const db = await getDb();
    const rows = before
      ? await db.getAllAsync<MessageRow>(
          `SELECT payload FROM messages
           WHERE chatId = ? AND createdAt < ?
           ORDER BY createdAt DESC LIMIT ?`,
          [chatId, before, limit]
        )
      : await db.getAllAsync<MessageRow>(
          `SELECT payload FROM messages
           WHERE chatId = ?
           ORDER BY createdAt DESC LIMIT ?`,
          [chatId, limit]
        );
    // Query is newest-first so LIMIT takes the right end; the screen wants
    // oldest-first.
    return parseRows(rows).reverse();
  } catch {
    return [];
  }
}

/**
 * Timestamp of the newest message we already hold, which is what the delta
 * sync sends as `?since=`.
 */
export async function newestCreatedAt(chatId: string): Promise<number | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ newest: number | null }>(
      "SELECT MAX(createdAt) AS newest FROM messages WHERE chatId = ?",
      [chatId]
    );
    return row?.newest ?? null;
  } catch {
    return null;
  }
}

export async function removeMessage(messageId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM messages WHERE id = ?", [messageId]);
  } catch {
    // ignore
  }
}

export async function upsertChats(chats: Chat[], scope: ChatScope): Promise<void> {
  if (!chats?.length) return;
  try {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const c of chats) {
        if (!c?._id) continue;
        await db.runAsync(
          `INSERT INTO chats (id, scope, updatedAt, payload)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             scope     = excluded.scope,
             updatedAt = excluded.updatedAt,
             payload   = excluded.payload`,
          [c._id, scope, toEpoch(c.updatedAt), JSON.stringify(c)]
        );
      }
    });
  } catch {
    // ignore
  }
}

export async function getChats(scope: ChatScope): Promise<Chat[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM chats WHERE scope = ? ORDER BY updatedAt DESC",
      [scope]
    );
    const out: Chat[] = [];
    for (const row of rows) {
      try {
        out.push(JSON.parse(row.payload) as Chat);
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ── Outbox ──────────────────────────────────────────────────────────────────
// Messages composed with no connection. They render optimistically in the
// chat with status "sending" and are flushed once the device is back online.

export interface OutboxEntry {
  tempId: string;
  chatId: string;
  body: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}

export async function enqueueOutbox(
  tempId: string,
  chatId: string,
  body: Record<string, unknown>
): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO outbox (tempId, chatId, body, createdAt, attempts)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(tempId) DO NOTHING`,
      [tempId, chatId, JSON.stringify(body), Date.now()]
    );
  } catch {
    // ignore
  }
}

export async function listOutbox(chatId?: string): Promise<OutboxEntry[]> {
  try {
    const db = await getDb();
    const rows = chatId
      ? await db.getAllAsync<any>(
          "SELECT * FROM outbox WHERE chatId = ? ORDER BY createdAt ASC",
          [chatId]
        )
      : await db.getAllAsync<any>("SELECT * FROM outbox ORDER BY createdAt ASC");
    const out: OutboxEntry[] = [];
    for (const row of rows) {
      try {
        out.push({ ...row, body: JSON.parse(row.body) });
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function dequeueOutbox(tempId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM outbox WHERE tempId = ?", [tempId]);
  } catch {
    // ignore
  }
}

/**
 * Record a failed send. Past the cap the entry is dropped rather than retried
 * forever — the message is still on screen as "failed" and the user can resend
 * it, which beats a queue that silently grows on a permanent 403.
 */
const MAX_OUTBOX_ATTEMPTS = 5;

export async function bumpOutboxAttempts(tempId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "UPDATE outbox SET attempts = attempts + 1 WHERE tempId = ?",
      [tempId]
    );
    await db.runAsync("DELETE FROM outbox WHERE tempId = ? AND attempts >= ?", [
      tempId,
      MAX_OUTBOX_ATTEMPTS,
    ]);
  } catch {
    // ignore
  }
}

// ── Housekeeping ────────────────────────────────────────────────────────────

/** Trim the store on launch so it can't grow without bound. */
export async function pruneChatStore(): Promise<void> {
  try {
    const db = await getDb();
    const cutoff = Date.now() - CHAT_TTL_MS;
    await db.runAsync(
      `DELETE FROM messages WHERE chatId IN (
         SELECT id FROM chats WHERE updatedAt < ?
       )`,
      [cutoff]
    );
    await db.runAsync("DELETE FROM chats WHERE updatedAt < ?", [cutoff]);
    // Keep only the newest N per chat. The correlated subquery is why
    // idx_messages_chat is (chatId, createdAt DESC).
    await db.runAsync(
      `DELETE FROM messages WHERE id IN (
         SELECT m.id FROM messages m
         WHERE m.createdAt < (
           SELECT MIN(createdAt) FROM (
             SELECT createdAt FROM messages
             WHERE chatId = m.chatId
             ORDER BY createdAt DESC LIMIT ?
           )
         )
       )`,
      [MAX_MESSAGES_PER_CHAT]
    );
  } catch {
    // ignore
  }
}

/**
 * Wipe every chat this device holds. Called on logout (it's another user's
 * mail) and from the "Clear local chat cache" setting.
 */
export async function clearChatStore(): Promise<void> {
  try {
    const db = await getDb();
    await db.execAsync(
      "DELETE FROM messages; DELETE FROM chats; DELETE FROM outbox;"
    );
  } catch {
    // ignore
  }
}
