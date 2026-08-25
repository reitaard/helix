import type { Pool } from "pg";

interface Row { chat_id: string; target_settings: unknown; invalid_attempts: number; expires_at: Date; }
export class T2IResetPendingRepository {
  constructor(private readonly db: Pool) {}
  async get(chatId: string) { const result = await this.db.query<Row>(`SELECT chat_id, target_settings, invalid_attempts, expires_at FROM operator_pending_t2i_reset WHERE chat_id=$1`, [chatId]); return result.rows[0] ?? null; }
  async begin(chatId: string, targetSettings: unknown, expiresAt: Date) { await this.db.query(`INSERT INTO operator_pending_t2i_reset (chat_id, target_settings, invalid_attempts, expires_at) VALUES ($1,$2::jsonb,0,$3) ON CONFLICT (chat_id) DO UPDATE SET target_settings=EXCLUDED.target_settings, invalid_attempts=0, expires_at=EXCLUDED.expires_at, updated_at=NOW()`, [chatId, JSON.stringify(targetSettings), expiresAt]); }
  async incrementInvalid(chatId: string) { const result = await this.db.query<Row>(`UPDATE operator_pending_t2i_reset SET invalid_attempts=LEAST(invalid_attempts+1,3),updated_at=NOW() WHERE chat_id=$1 RETURNING chat_id,target_settings,invalid_attempts,expires_at`, [chatId]); return result.rows[0] ?? null; }
  async remove(chatId: string) { await this.db.query(`DELETE FROM operator_pending_t2i_reset WHERE chat_id=$1`, [chatId]); }
  async expireDue(chatId: string) { const result = await this.db.query(`DELETE FROM operator_pending_t2i_reset WHERE chat_id=$1 AND expires_at<=NOW()`, [chatId]); return (result.rowCount ?? 0) > 0; }
}
