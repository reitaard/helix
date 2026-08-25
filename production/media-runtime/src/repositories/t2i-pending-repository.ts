import type { Pool } from "pg";

interface Row { chat_id: string; phase: "awaiting_prompt" | "awaiting_confirmation"; prompt: string | null; settings_snapshot: unknown; invalid_attempts: number; expires_at: Date; created_at: Date; updated_at: Date; }
export interface PendingT2I { chatId: string; phase: Row["phase"]; prompt: string | null; settingsSnapshot: unknown; invalidAttempts: number; expiresAt: string; createdAt: string; updatedAt: string; }
const map = (row: Row): PendingT2I => ({ chatId: row.chat_id, phase: row.phase, prompt: row.prompt, settingsSnapshot: row.settings_snapshot, invalidAttempts: row.invalid_attempts, expiresAt: row.expires_at.toISOString(), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });

export class T2IPendingRepository {
  constructor(private readonly db: Pool) {}
  async get(chatId: string) { const result = await this.db.query<Row>(`SELECT chat_id, phase, prompt, settings_snapshot, invalid_attempts, expires_at, created_at, updated_at FROM operator_pending_t2i WHERE chat_id=$1`, [chatId]); return result.rows[0] ? map(result.rows[0]) : null; }
  async beginPrompt(chatId: string, expiresAt: Date) { await this.db.query(`INSERT INTO operator_pending_t2i (chat_id, phase, prompt, settings_snapshot, invalid_attempts, expires_at) VALUES ($1, 'awaiting_prompt', NULL, NULL, 0, $2) ON CONFLICT (chat_id) DO UPDATE SET phase='awaiting_prompt', prompt=NULL, settings_snapshot=NULL, invalid_attempts=0, expires_at=EXCLUDED.expires_at, updated_at=NOW()`, [chatId, expiresAt]); }
  async setPrompt(chatId: string, prompt: string, settingsSnapshot: unknown, expiresAt: Date) { const result = await this.db.query(`UPDATE operator_pending_t2i SET phase='awaiting_confirmation', prompt=$2, settings_snapshot=$3::jsonb, invalid_attempts=0, expires_at=$4, updated_at=NOW() WHERE chat_id=$1 AND phase='awaiting_prompt'`, [chatId, prompt, JSON.stringify(settingsSnapshot), expiresAt]); return (result.rowCount ?? 0) > 0; }
  async incrementInvalid(chatId: string) { const result = await this.db.query<Row>(`UPDATE operator_pending_t2i SET invalid_attempts=LEAST(invalid_attempts+1,3), updated_at=NOW() WHERE chat_id=$1 AND phase='awaiting_confirmation' RETURNING chat_id, phase, prompt, settings_snapshot, invalid_attempts, expires_at, created_at, updated_at`, [chatId]); return result.rows[0] ? map(result.rows[0]) : null; }
  async remove(chatId: string) { await this.db.query(`DELETE FROM operator_pending_t2i WHERE chat_id=$1`, [chatId]); }
  async expireDue(chatId: string) { const result = await this.db.query(`DELETE FROM operator_pending_t2i WHERE chat_id=$1 AND expires_at <= NOW()`, [chatId]); return (result.rowCount ?? 0) > 0; }
}
