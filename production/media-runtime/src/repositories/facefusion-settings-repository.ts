import type { Pool } from "pg";
import { normalizeFaceFusionProfileSettings, type FaceFusionProfileSettings } from "../facefusion/profile-settings.js";

export interface FaceFusionSettingsScope { botId: string; chatId: string; threadId: string | null; userId: string }

function profileId(scope: FaceFusionSettingsScope) {
  return `telegram:${scope.botId}:${scope.chatId}:${scope.threadId ?? "private"}:${scope.userId}`;
}

export class FaceFusionSettingsRepository {
  constructor(private readonly db: Pool) {}

  async get(scope: FaceFusionSettingsScope): Promise<FaceFusionProfileSettings> {
    const result = await this.db.query<{ settings: unknown }>(
      `SELECT settings FROM production_profile_tool_settings WHERE profile_id=$1 AND tool='face.swap'`,
      [profileId(scope)]
    );
    return normalizeFaceFusionProfileSettings(result.rows[0]?.settings);
  }

  async save(scope: FaceFusionSettingsScope, settings: FaceFusionProfileSettings) {
    await this.db.query(`
      INSERT INTO production_profile_tool_settings (profile_id, tool, settings)
      VALUES ($1, 'face.swap', $2::jsonb)
      ON CONFLICT (profile_id, tool) DO UPDATE SET settings=EXCLUDED.settings, updated_at=NOW()
    `, [profileId(scope), JSON.stringify(normalizeFaceFusionProfileSettings(settings))]);
  }
}
