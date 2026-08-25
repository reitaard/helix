import type { Pool } from "pg";
import { normalizeStoredT2ISettings } from "../t2i/settings.js";
import type { T2ISettings } from "../t2i/settings.js";

export class T2ISettingsRepository {
  constructor(private readonly db: Pool) {}

  async get(profileId: string, tool: string): Promise<T2ISettings> {
    const result = await this.db.query<{ settings: unknown }>(`
      SELECT settings FROM production_profile_tool_settings
      WHERE profile_id = $1 AND tool = $2`, [profileId, tool]);
    return normalizeStoredT2ISettings(result.rows[0]?.settings);
  }

  async save(profileId: string, tool: string, settings: T2ISettings) {
    await this.db.query(`
      INSERT INTO production_profile_tool_settings (profile_id, tool, settings)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (profile_id, tool) DO UPDATE SET
        settings = EXCLUDED.settings, updated_at = NOW()`,
      [profileId, tool, JSON.stringify(settings)]);
  }
}
