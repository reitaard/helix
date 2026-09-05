import type { Pool } from "pg";

export type FaceFusionPhase = "awaiting_source" | "awaiting_target" | "confirming";
export interface FaceFusionConversation {
  botId: string;
  chatId: string;
  threadId: string | null;
  userId: string;
  phase: FaceFusionPhase;
  sourceInputHandle: string | null;
  targetInputHandle: string | null;
  sourceMediaKind: string | null;
  targetMediaKind: string | null;
  settings: unknown;
  confirmationMessageId: string | null;
}
interface Row {
  bot_id: string; chat_id: string; thread_id: string; user_id: string; phase: FaceFusionPhase;
  source_input_handle: string | null; target_input_handle: string | null;
  source_media_kind: string | null; target_media_kind: string | null;
  settings: unknown; confirmation_message_id: string | null;
}
function storedThreadId(threadId: string | null) { return threadId ?? ""; }
function map(row: Row): FaceFusionConversation {
  return { botId: row.bot_id, chatId: row.chat_id, threadId: row.thread_id || null, userId: row.user_id, phase: row.phase,
    sourceInputHandle: row.source_input_handle, targetInputHandle: row.target_input_handle,
    sourceMediaKind: row.source_media_kind, targetMediaKind: row.target_media_kind,
    settings: row.settings, confirmationMessageId: row.confirmation_message_id };
}

export class FaceFusionConversationRepository {
  constructor(private readonly db: Pool) {}
  async begin(botId: string, chatId: string, threadId: string | null, userId: string, settings: unknown, expiresAt: Date) {
    await this.db.query(`
      INSERT INTO facefusion_telegram_conversations (bot_id, chat_id, thread_id, user_id, phase, settings, expires_at)
      VALUES ($1, $2, $3, $4, 'awaiting_source', $5::jsonb, $6)
      ON CONFLICT (bot_id, chat_id, thread_id, user_id) DO UPDATE SET
        phase = 'awaiting_source', source_input_handle = NULL, target_input_handle = NULL,
        source_media_kind = NULL, target_media_kind = NULL, settings = EXCLUDED.settings,
        confirmation_message_id = NULL, expires_at = EXCLUDED.expires_at, updated_at = NOW()
    `, [botId, chatId, storedThreadId(threadId), userId, JSON.stringify(settings), expiresAt]);
  }
  async get(botId: string, chatId: string, threadId: string | null, userId: string): Promise<FaceFusionConversation | null> {
    const result = await this.db.query<Row>(`
      SELECT bot_id, chat_id, thread_id, user_id, phase, source_input_handle, target_input_handle,
             source_media_kind, target_media_kind, settings, confirmation_message_id
      FROM facefusion_telegram_conversations
      WHERE bot_id = $1 AND chat_id = $2 AND thread_id = $3 AND user_id = $4 AND expires_at > NOW()
    `, [botId, chatId, storedThreadId(threadId), userId]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }
  async setSource(botId: string, chatId: string, threadId: string | null, userId: string, handle: string, mediaKind: string, expiresAt: Date) {
    const result = await this.db.query(`UPDATE facefusion_telegram_conversations SET phase='awaiting_target', source_input_handle=$5,
      source_media_kind=$6, expires_at=$7, updated_at=NOW() WHERE bot_id=$1 AND chat_id=$2 AND thread_id=$3 AND user_id=$4 AND phase='awaiting_source' RETURNING bot_id`,
      [botId, chatId, storedThreadId(threadId), userId, handle, mediaKind, expiresAt]);
    return (result.rowCount ?? 0) === 1;
  }
  async setTarget(botId: string, chatId: string, threadId: string | null, userId: string, handle: string, mediaKind: string, settings: unknown, expiresAt: Date) {
    const result = await this.db.query(`UPDATE facefusion_telegram_conversations SET phase='confirming', target_input_handle=$5,
      target_media_kind=$6, settings=$7::jsonb, expires_at=$8, updated_at=NOW() WHERE bot_id=$1 AND chat_id=$2 AND thread_id=$3 AND user_id=$4 AND phase='awaiting_target' RETURNING bot_id`,
      [botId, chatId, storedThreadId(threadId), userId, handle, mediaKind, JSON.stringify(settings), expiresAt]);
    return (result.rowCount ?? 0) === 1;
  }
  async setSettings(botId: string, chatId: string, threadId: string | null, userId: string, settings: unknown) {
    await this.db.query(`UPDATE facefusion_telegram_conversations SET settings=$5::jsonb, updated_at=NOW()
      WHERE bot_id=$1 AND chat_id=$2 AND thread_id=$3 AND user_id=$4`, [botId, chatId, storedThreadId(threadId), userId, JSON.stringify(settings)]);
  }
  async setConfirmation(botId: string, chatId: string, threadId: string | null, userId: string, messageId: string) {
    await this.db.query(`UPDATE facefusion_telegram_conversations SET confirmation_message_id=$5, updated_at=NOW()
      WHERE bot_id=$1 AND chat_id=$2 AND thread_id=$3 AND user_id=$4`, [botId, chatId, storedThreadId(threadId), userId, messageId]);
  }
  async remove(botId: string, chatId: string, threadId: string | null, userId: string) {
    const result = await this.db.query<Row>(`DELETE FROM facefusion_telegram_conversations
      WHERE bot_id=$1 AND chat_id=$2 AND thread_id=$3 AND user_id=$4 RETURNING *`, [botId, chatId, storedThreadId(threadId), userId]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }
  async takeExpired(limit = 20): Promise<FaceFusionConversation[]> {
    const result = await this.db.query<Row>(`WITH expired AS (
      SELECT bot_id, chat_id, thread_id, user_id FROM facefusion_telegram_conversations WHERE expires_at <= NOW()
      ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT $1)
      DELETE FROM facefusion_telegram_conversations c USING expired e
      WHERE c.bot_id=e.bot_id AND c.chat_id=e.chat_id AND c.thread_id=e.thread_id AND c.user_id=e.user_id RETURNING c.*`, [limit]);
    return result.rows.map(map);
  }
}
