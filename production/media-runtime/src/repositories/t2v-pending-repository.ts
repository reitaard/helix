import type {
  Pool
} from "pg";

interface PendingRow {
  chat_id: string;

  phase:
    | "awaiting_prompt"
    | "awaiting_confirmation";

  prompt:
    string |
    null;

  settings_snapshot:
    unknown;

  invalid_attempts:
    number;

  expires_at:
    Date;

  created_at:
    Date;

  updated_at:
    Date;
}

export interface PendingT2V {
  chatId: string;

  phase:
    | "awaiting_prompt"
    | "awaiting_confirmation";

  prompt:
    string |
    null;

  settingsSnapshot:
    unknown;

  invalidAttempts:
    number;

  expiresAt:
    string;

  createdAt:
    string;

  updatedAt:
    string;
}

function mapRow(
  row: PendingRow
): PendingT2V {
  return {
    chatId:
      row.chat_id,

    phase:
      row.phase,

    prompt:
      row.prompt,

    settingsSnapshot:
      row.settings_snapshot,

    invalidAttempts:
      row.invalid_attempts,

    expiresAt:
      row.expires_at
        .toISOString(),

    createdAt:
      row.created_at
        .toISOString(),

    updatedAt:
      row.updated_at
        .toISOString()
  };
}

export class T2VPendingRepository {
  constructor(
    private readonly db:
      Pool
  ) {}

  async get(
    chatId: string
  ): Promise<
    PendingT2V |
    null
  > {
    const result =
      await this.db.query<
        PendingRow
      >(
        `
        SELECT
          chat_id,
          phase,
          prompt,
          settings_snapshot,
          invalid_attempts,
          expires_at,
          created_at,
          updated_at
        FROM operator_pending_t2v
        WHERE chat_id = $1
        `,
        [chatId]
      );

    const row =
      result.rows[0];

    return row
      ? mapRow(row)
      : null;
  }

  async beginPrompt(
    chatId: string,
    expiresAt: Date
  ) {
    await this.db.query(
      `
      INSERT INTO
        operator_pending_t2v (
          chat_id,
          phase,
          prompt,
          settings_snapshot,
          invalid_attempts,
          expires_at
        )
      VALUES (
        $1,
        'awaiting_prompt',
        NULL,
        NULL,
        0,
        $2
      )

      ON CONFLICT (chat_id)
      DO UPDATE SET
        phase =
          'awaiting_prompt',

        prompt =
          NULL,

        settings_snapshot =
          NULL,

        invalid_attempts =
          0,

        expires_at =
          EXCLUDED.expires_at,

        updated_at =
          NOW()
      `,
      [
        chatId,
        expiresAt
      ]
    );
  }

  async setPrompt(
    chatId: string,
    prompt: string,
    settingsSnapshot: unknown,
    expiresAt: Date
  ): Promise<boolean> {
    const result =
      await this.db.query(
        `
        UPDATE
          operator_pending_t2v

        SET
          phase =
            'awaiting_confirmation',

          prompt =
            $2,

          settings_snapshot =
            $3::jsonb,

          invalid_attempts =
            0,

          expires_at =
            $4,

          updated_at =
            NOW()

        WHERE
          chat_id = $1
          AND phase =
            'awaiting_prompt'
        `,
        [
          chatId,
          prompt,
          JSON.stringify(
            settingsSnapshot
          ),
          expiresAt
        ]
      );

    return (
      (result.rowCount ?? 0) >
      0
    );
  }

  async incrementInvalid(
    chatId: string
  ): Promise<
    PendingT2V |
    null
  > {
    const result =
      await this.db.query<
        PendingRow
      >(
        `
        UPDATE
          operator_pending_t2v

        SET
          invalid_attempts =
            LEAST(
              invalid_attempts + 1,
              3
            ),

          updated_at =
            NOW()

        WHERE
          chat_id = $1
          AND phase =
            'awaiting_confirmation'

        RETURNING
          chat_id,
          phase,
          prompt,
          settings_snapshot,
          invalid_attempts,
          expires_at,
          created_at,
          updated_at
        `,
        [chatId]
      );

    const row =
      result.rows[0];

    return row
      ? mapRow(row)
      : null;
  }

  async remove(
    chatId: string
  ) {
    await this.db.query(
      `
      DELETE FROM
        operator_pending_t2v
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
        DELETE FROM
          operator_pending_t2v

        WHERE
          chat_id = $1
          AND expires_at <= NOW()
        `,
        [chatId]
      );

    return (
      (result.rowCount ?? 0) >
      0
    );
  }
}
