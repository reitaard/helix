import type {
  Pool
} from "pg";

interface PendingResetRow {
  chat_id: string;
  scope: "core" | "all";
  current_settings: unknown;
  target_settings: unknown;
  invalid_attempts: number;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PendingT2VReset {
  chatId: string;
  scope: "core" | "all";
  currentSettings: unknown;
  targetSettings: unknown;
  invalidAttempts: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(
  row: PendingResetRow
): PendingT2VReset {
  return {
    chatId: row.chat_id,
    scope: row.scope,
    currentSettings: row.current_settings,
    targetSettings: row.target_settings,
    invalidAttempts: row.invalid_attempts,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class T2VResetPendingRepository {
  constructor(
    private readonly db: Pool
  ) {}

  async get(
    chatId: string
  ): Promise<PendingT2VReset | null> {
    const result =
      await this.db.query<PendingResetRow>(
        `
        SELECT
          chat_id,
          scope,
          current_settings,
          target_settings,
          invalid_attempts,
          expires_at,
          created_at,
          updated_at
        FROM operator_pending_t2v_reset
        WHERE chat_id = $1
        `,
        [chatId]
      );

    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async begin(
    input: {
      chatId: string;
      scope: "core" | "all";
      currentSettings: unknown;
      targetSettings: unknown;
      expiresAt: Date;
    }
  ) {
    await this.db.query(
      `
      INSERT INTO operator_pending_t2v_reset (
        chat_id,
        scope,
        current_settings,
        target_settings,
        invalid_attempts,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3::jsonb,
        $4::jsonb,
        0,
        $5
      )
      ON CONFLICT (chat_id)
      DO UPDATE SET
        scope = EXCLUDED.scope,
        current_settings = EXCLUDED.current_settings,
        target_settings = EXCLUDED.target_settings,
        invalid_attempts = 0,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      `,
      [
        input.chatId,
        input.scope,
        JSON.stringify(input.currentSettings),
        JSON.stringify(input.targetSettings),
        input.expiresAt
      ]
    );
  }

  async incrementInvalid(
    chatId: string
  ): Promise<PendingT2VReset | null> {
    const result =
      await this.db.query<PendingResetRow>(
        `
        UPDATE operator_pending_t2v_reset
        SET
          invalid_attempts = LEAST(invalid_attempts + 1, 3),
          updated_at = NOW()
        WHERE chat_id = $1
        RETURNING
          chat_id,
          scope,
          current_settings,
          target_settings,
          invalid_attempts,
          expires_at,
          created_at,
          updated_at
        `,
        [chatId]
      );

    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async remove(
    chatId: string
  ) {
    await this.db.query(
      `
      DELETE FROM operator_pending_t2v_reset
      WHERE chat_id = $1
      `,
      [chatId]
    );
  }

  async expireDue(
    chatId: string
  ) {
    const result =
      await this.db.query(
        `
        DELETE FROM operator_pending_t2v_reset
        WHERE
          chat_id = $1
          AND expires_at <= NOW()
        `,
        [chatId]
      );

    return (result.rowCount ?? 0) > 0;
  }
}
