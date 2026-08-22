import type {
  Pool
} from "pg";

interface MediaJobRow {
  id: string;
  tool: string;
  status: string;

  worker_id: string | null;
  adapter: string | null;

  backend_job_id:
    string | null;

  idempotency_key:
    string | null;

  request: unknown;
  result: unknown | null;
  error: unknown | null;

  created_at: Date;
  updated_at: Date;

  started_at: Date | null;
  finished_at: Date | null;
}

export interface MediaJob {
  id: string;
  tool: string;
  status: string;

  workerId: string | null;
  adapter: string | null;

  backendJobId:
    string | null;

  idempotencyKey:
    string | null;

  request: unknown;
  result: unknown | null;
  error: unknown | null;

  createdAt: string;
  updatedAt: string;

  startedAt: string | null;
  finishedAt: string | null;
}

function mapJob(
  row: MediaJobRow
): MediaJob {
  return {
    id: row.id,
    tool: row.tool,
    status: row.status,

    workerId:
      row.worker_id,

    adapter:
      row.adapter,

    backendJobId:
      row.backend_job_id,

    idempotencyKey:
      row.idempotency_key,

    request:
      row.request,

    result:
      row.result,

    error:
      row.error,

    createdAt:
      row.created_at
        .toISOString(),

    updatedAt:
      row.updated_at
        .toISOString(),

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

export class JobRepository {
  constructor(
    private readonly db: Pool
  ) {}

  async get(
    id: string
  ): Promise<MediaJob | null> {
    const result =
      await this.db.query<
        MediaJobRow
      >(
        `
        SELECT
          id,
          tool,
          status,
          worker_id,
          adapter,
          backend_job_id,
          idempotency_key,
          request,
          result,
          error,
          created_at,
          updated_at,
          started_at,
          finished_at
        FROM media_jobs
        WHERE id = $1
        `,
        [id]
      );

    const row =
      result.rows[0];

    return row
      ? mapJob(row)
      : null;
  }

  async findByIdempotencyKey(
    key: string
  ): Promise<MediaJob | null> {
    const result =
      await this.db.query<
        MediaJobRow
      >(
        `
        SELECT
          id,
          tool,
          status,
          worker_id,
          adapter,
          backend_job_id,
          idempotency_key,
          request,
          result,
          error,
          created_at,
          updated_at,
          started_at,
          finished_at
        FROM media_jobs
        WHERE idempotency_key = $1
        `,
        [key]
      );

    const row =
      result.rows[0];

    return row
      ? mapJob(row)
      : null;
  }

  async createAccepted(
    input: {
      id: string;
      workerId: string;
      adapter: string;

      idempotencyKey:
        string | null;

      request: unknown;
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
        INSERT INTO media_jobs (
          id,
          tool,
          status,
          worker_id,
          adapter,
          idempotency_key,
          request
        )
        VALUES (
          $1,
          'video.i2v',
          'accepted',
          $2,
          $3,
          $4,
          $5::jsonb
        )
        `,
        [
          input.id,
          input.workerId,
          input.adapter,
          input.idempotencyKey,
          JSON.stringify(
            input.request
          )
        ]
      );

      await client.query(
        `
        INSERT INTO media_job_events (
          job_id,
          sequence,
          event_type,
          stage,
          payload
        )
        VALUES (
          $1,
          1,
          'job.accepted',
          'accepted',
          '{}'::jsonb
        )
        `,
        [input.id]
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

  async markQueued(
    input: {
      id: string;
      backendJobId: string;
      backendResponse: unknown;
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
        UPDATE media_jobs
        SET
          status = 'queued',
          backend_job_id = $2,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          input.id,
          input.backendJobId
        ]
      );

      await client.query(
        `
        INSERT INTO media_job_events (
          job_id,
          sequence,
          event_type,
          stage,
          payload
        )
        VALUES (
          $1,
          2,
          'job.queued',
          'queued',
          $2::jsonb
        )
        `,
        [
          input.id,

          JSON.stringify({
            backendJobId:
              input.backendJobId,

            backendResponse:
              input.backendResponse
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
    id: string,
    message: string
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await client.query(
        `
        UPDATE media_jobs
        SET
          status = 'failed',
          error = $2::jsonb,
          updated_at = NOW(),
          finished_at = NOW()
        WHERE id = $1
        `,
        [
          id,

          JSON.stringify({
            message
          })
        ]
      );

      await client.query(
        `
        INSERT INTO media_job_events (
          job_id,
          sequence,
          event_type,
          stage,
          payload
        )
        VALUES (
          $1,
          2,
          'job.failed',
          'failed',
          $2::jsonb
        )
        `,
        [
          id,

          JSON.stringify({
            message
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

  async listActive():
    Promise<MediaJob[]> {

    const result =
      await this.db.query<
        MediaJobRow
      >(
        `
        SELECT
          id,
          tool,
          status,
          worker_id,
          adapter,
          backend_job_id,
          idempotency_key,
          request,
          result,
          error,
          created_at,
          updated_at,
          started_at,
          finished_at
        FROM media_jobs
        WHERE status IN (
          'accepted',
          'queued',
          'running',
          'finalizing'
        )
        AND backend_job_id
          IS NOT NULL
        ORDER BY created_at
        `
      );

    return result.rows.map(
      mapJob
    );
  }

  async markRunning(
    id: string
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        SELECT id
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [id]
      );

      await client.query(
        `
        UPDATE media_jobs
        SET
          status = 'running',
          started_at =
            COALESCE(
              started_at,
              NOW()
            ),
          updated_at = NOW()
        WHERE id = $1
        `,
        [id]
      );

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
          'job.running',
          'running',
          '{}'::jsonb
        FROM media_job_events
        WHERE job_id = $1
        `,
        [id]
      );

      await client.query("COMMIT");
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

  async markSucceeded(
    id: string,
    result: unknown
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        SELECT id
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [id]
      );

      await client.query(
        `
        UPDATE media_jobs
        SET
          status = 'succeeded',
          result = $2::jsonb,
          started_at =
            COALESCE(
              started_at,
              NOW()
            ),
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          JSON.stringify(result)
        ]
      );

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
          'job.succeeded',
          'succeeded',
          $2::jsonb
        FROM media_job_events
        WHERE job_id = $1
        `,
        [
          id,
          JSON.stringify(result)
        ]
      );

      await client.query("COMMIT");
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

  async markBackendFailed(
    id: string,
    message: string
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        SELECT id
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [id]
      );

      const payload =
        JSON.stringify({
          message
        });

      await client.query(
        `
        UPDATE media_jobs
        SET
          status = 'failed',
          error = $2::jsonb,
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          payload
        ]
      );

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
          'job.failed',
          'failed',
          $2::jsonb
        FROM media_job_events
        WHERE job_id = $1
        `,
        [
          id,
          payload
        ]
      );

      await client.query("COMMIT");
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
