import type { Pool } from "pg";
import type { TelegramConversationKey } from "../telegram/conversation.js";

interface PendingRow {
  chat_id: string; thread_id: string; user_id: string;
  phase: "awaiting_prompt" | "awaiting_confirmation";
  prompt: string | null; settings_snapshot: unknown; invalid_attempts: number;
  expected_reply_message_id: string | null;
  expires_at: Date; created_at: Date; updated_at: Date;
}

export interface PendingT2I {
  chatId: string; threadId: string; userId: string;
  phase: PendingRow["phase"]; prompt: string | null; settingsSnapshot: unknown;
  invalidAttempts: number; expectedReplyMessageId: string | null;
  expiresAt: string; createdAt: string; updatedAt: string;
}

type PendingKey = TelegramConversationKey | string;
function normalizeKey(key: PendingKey): TelegramConversationKey {
  return typeof key === "string" ? { chatId: key, threadId: "0", userId: key } : key;
}

function mapRow(row: PendingRow): PendingT2I {
  return { chatId: row.chat_id, threadId: row.thread_id, userId: row.user_id, phase: row.phase, prompt: row.prompt,
    settingsSnapshot: row.settings_snapshot, invalidAttempts: row.invalid_attempts, expectedReplyMessageId: row.expected_reply_message_id,
    expiresAt: row.expires_at.toISOString(), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

export class T2IPendingRepository {
  constructor(private readonly db: Pool) {}
  async get(key: PendingKey): Promise<PendingT2I | null> {
    key = normalizeKey(key);
    const result = await this.db.query<PendingRow>(`SELECT chat_id, thread_id, user_id, phase, prompt, settings_snapshot, invalid_attempts, expected_reply_message_id, expires_at, created_at, updated_at FROM operator_pending_t2i WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3`, [key.chatId, key.threadId, key.userId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
  async beginPrompt(key: PendingKey, expiresAt: Date) {
    key = normalizeKey(key);
    await this.db.query(`INSERT INTO operator_pending_t2i (chat_id, thread_id, user_id, phase, prompt, settings_snapshot, invalid_attempts, expires_at) VALUES ($1,$2,$3,'awaiting_prompt',NULL,NULL,0,$4) ON CONFLICT (chat_id,thread_id,user_id) DO UPDATE SET phase='awaiting_prompt', prompt=NULL, settings_snapshot=NULL, invalid_attempts=0, expected_reply_message_id=NULL, expires_at=EXCLUDED.expires_at, created_at=NOW(), updated_at=NOW()`, [key.chatId,key.threadId,key.userId,expiresAt]);
  }
  async setPrompt(key: PendingKey, prompt: string, settingsSnapshot: unknown, expiresAt: Date) {
    key = normalizeKey(key);
    const r=await this.db.query(`UPDATE operator_pending_t2i SET phase='awaiting_confirmation', prompt=$4, settings_snapshot=$5::jsonb, invalid_attempts=0, expected_reply_message_id=NULL, expires_at=$6, updated_at=NOW() WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3 AND phase='awaiting_prompt'`,[key.chatId,key.threadId,key.userId,prompt,JSON.stringify(settingsSnapshot),expiresAt]); return (r.rowCount??0)>0;
  }
  async setExpectedReply(key: PendingKey, messageId: string) { key = normalizeKey(key); await this.db.query(`UPDATE operator_pending_t2i SET expected_reply_message_id=$4, updated_at=NOW() WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3`,[key.chatId,key.threadId,key.userId,messageId]); }
  async incrementInvalid(key: PendingKey): Promise<PendingT2I|null> { key = normalizeKey(key); const r=await this.db.query<PendingRow>(`UPDATE operator_pending_t2i SET invalid_attempts=LEAST(invalid_attempts+1,3),updated_at=NOW() WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3 AND phase='awaiting_confirmation' RETURNING chat_id,thread_id,user_id,phase,prompt,settings_snapshot,invalid_attempts,expected_reply_message_id,expires_at,created_at,updated_at`,[key.chatId,key.threadId,key.userId]); return r.rows[0]?mapRow(r.rows[0]):null; }
  async remove(key: PendingKey) { key = normalizeKey(key); await this.db.query(`DELETE FROM operator_pending_t2i WHERE chat_id=$1 AND thread_id=$2 AND user_id=$3`,[key.chatId,key.threadId,key.userId]); }
  async expireDue(_key?: PendingKey) { const r=await this.db.query(`DELETE FROM operator_pending_t2i WHERE expires_at<=NOW()`); return (r.rowCount??0)>0; }
}
