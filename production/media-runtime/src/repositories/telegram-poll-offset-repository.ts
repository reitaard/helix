import type { Pool } from "pg";

const MAX_SAFE_UPDATE_ID = Number.MAX_SAFE_INTEGER - 1;

export function parseTelegramOffset(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_SAFE_UPDATE_ID) {
    throw new Error("Stored Telegram update offset is outside JavaScript safe integer range");
  }
  return parsed;
}

export class TelegramPollOffsetRepository {
  constructor(private readonly db: Pool) {}

  async get(botId: string): Promise<number | null> {
    const result = await this.db.query<{ next_update_id: string }>(
      "SELECT next_update_id FROM telegram_poll_offsets WHERE bot_id = $1",
      [botId]
    );
    return result.rows[0] ? parseTelegramOffset(result.rows[0].next_update_id) : null;
  }

  async save(botId: string, nextUpdateId: number): Promise<void> {
    const safe = parseTelegramOffset(nextUpdateId);
    await this.db.query(
      `INSERT INTO telegram_poll_offsets (bot_id, next_update_id)
       VALUES ($1, $2)
       ON CONFLICT (bot_id) DO UPDATE
       SET next_update_id = EXCLUDED.next_update_id, updated_at = NOW()`,
      [botId, String(safe)]
    );
  }
}
