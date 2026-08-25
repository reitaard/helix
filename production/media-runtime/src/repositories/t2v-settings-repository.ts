import type {
  Pool
} from "pg";

import {
  normalizeT2VMode
} from "../t2v/mode.js";

import type {
  T2VMode
} from "../t2v/mode.js";

import {
  normalizeStoredT2VSettings
} from "../t2v/settings.js";

import type {
  T2VSettings
} from "../t2v/settings.js";

interface SettingsRow {
  settings: unknown;
}

interface ModeRow {
  generation_mode: unknown;
}

export class T2VSettingsRepository {
  constructor(
    private readonly db:
      Pool
  ) {}

  async get(
    profileId: string,
    tool: string
  ): Promise<T2VSettings> {
    const result =
      await this.db.query<
        SettingsRow
      >(
        `
        SELECT
          settings
        FROM
          production_profile_tool_settings
        WHERE
          profile_id = $1
          AND tool = $2
        `,
        [
          profileId,
          tool
        ]
      );

    return normalizeStoredT2VSettings(
      result.rows[0]?.settings
    );
  }

  async getMode(
    profileId: string,
    tool: string
  ): Promise<T2VMode> {
    const result =
      await this.db.query<
        ModeRow
      >(
        `
        SELECT
          generation_mode
        FROM
          production_profile_tool_settings
        WHERE
          profile_id = $1
          AND tool = $2
        `,
        [
          profileId,
          tool
        ]
      );

    return normalizeT2VMode(
      result.rows[0]
        ?.generation_mode
    );
  }

  async save(
    profileId: string,
    tool: string,
    settings: T2VSettings
  ) {
    await this.db.query(
      `
      INSERT INTO
        production_profile_tool_settings (
          profile_id,
          tool,
          settings
        )
      VALUES (
        $1,
        $2,
        $3::jsonb
      )

      ON CONFLICT (
        profile_id,
        tool
      )
      DO UPDATE SET
        settings =
          EXCLUDED.settings,

        updated_at =
          NOW()
      `,
      [
        profileId,
        tool,
        JSON.stringify(settings)
      ]
    );
  }

  async setMode(
    profileId: string,
    tool: string,
    mode: T2VMode
  ) {
    const result =
      await this.db.query(
        `
        UPDATE
          production_profile_tool_settings
        SET
          generation_mode = $3,
          updated_at = NOW()
        WHERE
          profile_id = $1
          AND tool = $2
        `,
        [
          profileId,
          tool,
          mode
        ]
      );

    if (
      (result.rowCount ?? 0) === 0
    ) {
      throw new Error(
        "T2V settings row is missing"
      );
    }
  }
}
