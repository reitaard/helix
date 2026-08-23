import type {
  Pool,
  PoolClient
} from "pg";

interface PendingActionRow {
  chat_id: string;
  action_type: string;
  job_id: string;
  invalid_attempts: number;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PendingOperatorAction {
  chatId: string;
  actionType: string;
  jobId: string;
  invalidAttempts: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

function mapPendingAction(
  row: PendingActionRow
): PendingOperatorAction {
  return {
    chatId:
      row.chat_id,

    actionType:
      row.action_type,

    jobId:
      row.job_id,

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

export class OperatorActionRepository {
  constructor(
    private readonly db:
      Pool
  ) {}

  private async lockJob(
    client: PoolClient,
    jobId: string
  ) {
    const result =
      await client.query(
        `
        SELECT id
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [jobId]
      );

    return (
      (result.rowCount ?? 0) > 0
    );
  }

  private async appendEvent(
    client: PoolClient,
    jobId: string,
    eventType: string,
    payload: unknown
  ) {
    await client.query(
      `
      INSERT INTO media_job_events (
        job_id,
        sequence,
        event_type,
        stage,
        payload
      )

      SELECT
        $1,
        COALESCE(
          MAX(sequence),
          0
        ) + 1,
        $2,
        'operator',
        $3::jsonb

      FROM media_job_events

      WHERE job_id = $1
      `,
      [
        jobId,
        eventType,
        JSON.stringify(payload)
      ]
    );
  }

  async get(
    chatId: string
  ): Promise<
    PendingOperatorAction |
    null
  > {
    const result =
      await this.db.query<
        PendingActionRow
      >(
        `
        SELECT
          chat_id,
          action_type,
          job_id,
          invalid_attempts,
          expires_at,
          created_at,
          updated_at

        FROM operator_pending_actions

        WHERE chat_id = $1
        `,
        [chatId]
      );

    const row =
      result.rows[0];

    return row
      ? mapPendingAction(row)
      : null;
  }

  async createCancel(
    input: {
      chatId: string;
      jobId: string;
      expiresAt: Date;
    }
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const jobExists =
        await this.lockJob(
          client,
          input.jobId
        );

      if (!jobExists) {
        await client.query(
          "ROLLBACK"
        );

        return false;
      }

      await client.query(
        `
        DELETE FROM
          operator_pending_actions

        WHERE chat_id = $1
        `,
        [input.chatId]
      );

      await client.query(
        `
        INSERT INTO
          operator_pending_actions (
            chat_id,
            action_type,
            job_id,
            invalid_attempts,
            expires_at
          )

        VALUES (
          $1,
          'cancel_job',
          $2,
          0,
          $3
        )
        `,
        [
          input.chatId,
          input.jobId,
          input.expiresAt
        ]
      );

      await this.appendEvent(
        client,
        input.jobId,
        "operator.telegram.cancel_requested",
        {
          expiresAt:
            input.expiresAt
              .toISOString()
        }
      );

      await client.query(
        "COMMIT"
      );

      return true;
    }
    catch (error) {
      await client.query(
        "ROLLBACK"
      );

      throw error;
    }
    finally {
      client.release();
    }
  }

  async incrementInvalid(
    chatId: string
  ): Promise<
    PendingOperatorAction |
    null
  > {
    const result =
      await this.db.query<
        PendingActionRow
      >(
        `
        UPDATE
          operator_pending_actions

        SET
          invalid_attempts =
            LEAST(
              invalid_attempts + 1,
              3
            ),

          updated_at =
            NOW()

        WHERE chat_id = $1

        RETURNING
          chat_id,
          action_type,
          job_id,
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
      ? mapPendingAction(row)
      : null;
  }

  async close(
    chatId: string,
    eventType: string,
    payload: unknown
  ): Promise<
    PendingOperatorAction |
    null
  > {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const result =
        await client.query<
          PendingActionRow
        >(
          `
          SELECT
            chat_id,
            action_type,
            job_id,
            invalid_attempts,
            expires_at,
            created_at,
            updated_at

          FROM operator_pending_actions

          WHERE chat_id = $1

          FOR UPDATE
          `,
          [chatId]
        );

      const row =
        result.rows[0];

      if (!row) {
        await client.query(
          "COMMIT"
        );

        return null;
      }

      const jobExists =
        await this.lockJob(
          client,
          row.job_id
        );

      if (jobExists) {
        await this.appendEvent(
          client,
          row.job_id,
          eventType,
          payload
        );
      }

      await client.query(
        `
        DELETE FROM
          operator_pending_actions

        WHERE chat_id = $1
        `,
        [chatId]
      );

      await client.query(
        "COMMIT"
      );

      return mapPendingAction(row);
    }
    catch (error) {
      await client.query(
        "ROLLBACK"
      );

      throw error;
    }
    finally {
      client.release();
    }
  }

  async expireDue(
    chatId: string
  ) {
    const pending =
      await this.get(
        chatId
      );

    if (!pending) {
      return false;
    }

    if (
      new Date(
        pending.expiresAt
      ).getTime() >
      Date.now()
    ) {
      return false;
    }

    await this.close(
      chatId,
      "operator.telegram.cancel_expired",
      {
        reason:
          "timeout"
      }
    );

    return true;
  }
}
