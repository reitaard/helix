import type {
  Pool
} from "pg";

interface DeliveryRow {
  id: string;
  job_id: string;
  job_number: string;

  artifact_index:
    number;

  artifact:
    unknown;

  provider:
    string;

  destination: unknown | null;

  status:
    string;

  attempt_count:
    number;

  metadata_message_id:
    string | null;

  document_message_id:
    string | null;

  worker_id:
    string | null;

  profile_id:
    string | null;

  tool:
    string;

  started_at:
    Date | null;

  finished_at:
    Date | null;
}

export interface ClaimedDelivery {
  id: string;
  jobId: string;
  jobNumber: string;

  artifactIndex:
    number;

  artifact:
    unknown;

  provider:
    string;

  destination: unknown | null;

  attemptCount:
    number;

  metadataMessageId:
    string | null;

  documentMessageId:
    string | null;

  workerId:
    string;

  profileId:
    string | null;

  tool:
    string;

  startedAt:
    string | null;

  finishedAt:
    string | null;
}

interface DeliveryStatusRow {
  artifact_index: number;
  provider: string;
  status: string;
  attempt_count: number;

  metadata_message_id:
    string | null;

  document_message_id:
    string | null;

  error: unknown | null;

  next_attempt_at:
    Date | null;

  created_at:
    Date;

  updated_at:
    Date;

  delivered_at:
    Date | null;
}

export interface JobDelivery {
  artifactIndex: number;
  provider: string;
  status: string;
  attemptCount: number;

  metadataMessageId:
    string | null;

  documentMessageId:
    string | null;

  error:
    unknown | null;

  nextAttemptAt:
    string | null;

  createdAt:
    string;

  updatedAt:
    string;

  deliveredAt:
    string | null;
}

export class DeliveryRepository {
  constructor(
    private readonly db:
      Pool
  ) {}

  async listForJob(
    jobId: string
  ): Promise<JobDelivery[]> {
    const result =
      await this.db.query<
        DeliveryStatusRow
      >(
        `
        SELECT
          artifact_index,
          provider,
          status,
          attempt_count,
          metadata_message_id,
          document_message_id,
          error,
          next_attempt_at,
          created_at,
          updated_at,
          delivered_at
        FROM media_deliveries
        WHERE job_id = $1
        ORDER BY
          artifact_index,
          provider
        `,
        [jobId]
      );

    return result.rows.map(
      row => ({
        artifactIndex:
          row.artifact_index,

        provider:
          row.provider,

        status:
          row.status,

        attemptCount:
          row.attempt_count,

        metadataMessageId:
          row.metadata_message_id,

        documentMessageId:
          row.document_message_id,

        error:
          row.error,

        nextAttemptAt:
          row.next_attempt_at
            ?.toISOString() ??
          null,

        createdAt:
          row.created_at
            .toISOString(),

        updatedAt:
          row.updated_at
            .toISOString(),

        deliveredAt:
          row.delivered_at
            ?.toISOString() ??
          null
      })
    );
  }

  async claimDue(
    provider: string
  ): Promise<
    ClaimedDelivery | null
  > {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const result =
        await client.query<
          DeliveryRow
        >(
          `
          WITH candidate AS (
            SELECT d.id
            FROM media_deliveries d
            WHERE
              d.provider = $1
              AND (
                (
                  d.status =
                    'pending'
                  AND (
                    d.next_attempt_at
                      IS NULL
                    OR
                    d.next_attempt_at
                      <= NOW()
                  )
                )
                OR (
                  d.status =
                    'failed'
                  AND
                  d.next_attempt_at
                    IS NOT NULL
                  AND
                  d.next_attempt_at
                    <= NOW()
                )
                OR (
                  d.status =
                    'delivering'
                  AND
                  d.updated_at <=
                    NOW() -
                    INTERVAL '15 minutes'
                )
              )
            ORDER BY
              d.created_at,
              d.id
            FOR UPDATE
              SKIP LOCKED
            LIMIT 1
          ),
          claimed AS (
            UPDATE
              media_deliveries d
            SET
              status =
                'delivering',

              attempt_count =
                d.attempt_count + 1,

              updated_at =
                NOW(),

              error =
                NULL
            FROM candidate c
            WHERE d.id = c.id
            RETURNING d.*
          )
          SELECT
            c.id,
            c.job_id,
            c.artifact_index,
            c.artifact,
            c.provider,
            c.destination,
            c.status,
            c.attempt_count,
            c.metadata_message_id,
            c.document_message_id,
            j.worker_id,
            j.profile_id,
            j.job_number,
            j.tool,
            j.started_at,
            j.finished_at
          FROM claimed c
          JOIN media_jobs j
            ON j.id =
              c.job_id
          `,
          [provider]
        );

      await client.query(
        "COMMIT"
      );

      const row =
        result.rows[0];

      if (
        !row ||
        !row.worker_id
      ) {
        return null;
      }

      return {
        id: row.id,

        jobId:
          row.job_id,

        jobNumber:
          row.job_number,

        artifactIndex:
          row.artifact_index,

        artifact:
          row.artifact,

        provider:
          row.provider,

        destination:
          row.destination,

        attemptCount:
          row.attempt_count,

        metadataMessageId:
          row.metadata_message_id,

        documentMessageId:
          row.document_message_id,

        workerId:
          row.worker_id,

        profileId:
          row.profile_id,

        tool:
          row.tool,

        startedAt:
          row.started_at
            ?.toISOString() ??
          null,

        finishedAt:
          row.finished_at
            ?.toISOString() ??
          null
      };
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

  async markMetadataSent(
    input: {
      id: string;
      jobId: string;
      messageId: string;
    }
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await client.query(
        `
        SELECT id
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [input.jobId]
      );

      await client.query(
        `
        UPDATE media_deliveries
        SET
          metadata_message_id =
            $2,

          updated_at =
            NOW()
        WHERE id = $1
        `,
        [
          input.id,
          input.messageId
        ]
      );

      await client.query(
        `
        INSERT INTO
          media_job_events (
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

          'delivery.metadata_sent',
          'delivery',

          $2::jsonb
        FROM media_job_events
        WHERE job_id = $1
        `,
        [
          input.jobId,

          JSON.stringify({
            provider:
              "telegram",

            messageId:
              input.messageId
          })
        ]
      );

      await client.query(
        "COMMIT"
      );
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

  async markDelivered(
    input: {
      id: string;
      jobId: string;

      artifactIndex:
        number;

      provider:
        string;

      documentMessageId:
        string;
    }
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await client.query(
        `
        SELECT id
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [input.jobId]
      );

      await client.query(
        `
        UPDATE media_deliveries
        SET
          status =
            'delivered',

          metadata_message_id =
            $2,

          document_message_id =
            $2,

          delivered_at =
            NOW(),

          next_attempt_at =
            NULL,

          error =
            NULL,

          updated_at =
            NOW()
        WHERE id = $1
        `,
        [
          input.id,
          input.documentMessageId
        ]
      );

      await client.query(
        `
        INSERT INTO
          media_job_events (
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

          'delivery.succeeded',
          'delivery',

          $2::jsonb
        FROM media_job_events
        WHERE job_id = $1
        `,
        [
          input.jobId,

          JSON.stringify({
            provider:
              input.provider,

            artifactIndex:
              input.artifactIndex,

            documentMessageId:
              input.documentMessageId
          })
        ]
      );

      await client.query(
        "COMMIT"
      );
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

  async markFailed(
    input: {
      id: string;
      jobId: string;

      artifactIndex:
        number;

      provider:
        string;

      message: string;

      retryAfterSeconds:
        number | null;
    }
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await client.query(
        `
        SELECT id
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [input.jobId]
      );

      const terminal =
        input.retryAfterSeconds ===
        null;

      const payload =
        JSON.stringify({
          message:
            input.message,

          terminal
        });

      await client.query(
        `
        UPDATE media_deliveries
        SET
          status =
            'failed',

          error =
            $2::jsonb,

          next_attempt_at =
            CASE
              WHEN $3::integer
                IS NULL
              THEN NULL

              ELSE
                NOW() +
                (
                  $3::integer *
                  INTERVAL '1 second'
                )
            END,

          updated_at =
            NOW()
        WHERE id = $1
        `,
        [
          input.id,
          payload,
          input.retryAfterSeconds
        ]
      );

      await client.query(
        `
        INSERT INTO
          media_job_events (
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

          'delivery.failed',
          'delivery',

          $2::jsonb
        FROM media_job_events
        WHERE job_id = $1
        `,
        [
          input.jobId,

          JSON.stringify({
            provider:
              input.provider,

            artifactIndex:
              input.artifactIndex,

            message:
              input.message,

            terminal,

            retryAfterSeconds:
              input.retryAfterSeconds
          })
        ]
      );

      await client.query(
        "COMMIT"
      );
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
}
