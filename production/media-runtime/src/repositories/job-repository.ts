import type {
  Pool
} from "pg";

interface MediaJobRow {
  id: string;
  job_number: string;
  tool: string;
  status: string;

  worker_id: string | null;
  profile_id: string | null;
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
  jobNumber: string;
  tool: string;
  status: string;

  workerId: string | null;
  profileId: string | null;
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
    jobNumber: row.job_number,
    tool: row.tool,
    status: row.status,

    workerId:
      row.worker_id,

    profileId:
      row.profile_id,

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

interface ActiveMediaJobRow {
  id: string;
  status: string;

  worker_id:
    string | null;

  created_at:
    Date;

  started_at:
    Date | null;
}

export interface ActiveMediaJobSummary {
  id: string;
  status: string;

  workerId:
    string | null;

  createdAt:
    string;

  startedAt:
    string | null;
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
          job_number,
          tool,
          status,
          worker_id,
          profile_id,
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
          job_number,
          tool,
          status,
          worker_id,
          profile_id,
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
      tool: string;
      workerId: string;
      profileId: string;
      adapter: string;

      idempotencyKey:
        string | null;

      deliveryContext?: unknown;
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
          profile_id,
          adapter,
          idempotency_key,
          delivery_context,
          request
        )
        VALUES (
          $1,
          $2,
          'accepted',
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8::jsonb
        )
        `,
        [
          input.id,
          input.tool,
          input.workerId,
          input.profileId,
          input.adapter,
          input.idempotencyKey,
          input.deliveryContext ? JSON.stringify(input.deliveryContext) : null,
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

  async count() {
    const result =
      await this.db.query<{
        total: number;
      }>(
        `
        SELECT COUNT(*)::int AS total
        FROM media_jobs
        `
      );

    return result.rows[0]?.total ?? 0;
  }


  async listRecent(
    limit = 20,
    offset = 0
  ): Promise<MediaJob[]> {
    const safeLimit =
      Math.max(
        1,
        Math.min(
          20,
          Math.floor(limit)
        )
      );
    const safeOffset =
      Math.max(
        0,
        Math.floor(offset)
      );

    const result =
      await this.db.query<
        MediaJobRow
      >(
        `
        SELECT
          id,
          job_number,
          tool,
          status,
          worker_id,
          profile_id,
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
        ORDER BY created_at DESC
        LIMIT $1
        OFFSET $2
        `,
        [
          safeLimit,
          safeOffset
        ]
      );

    return result.rows.map(
      mapJob
    );
  }


  async findByJobNumber(
    jobNumber: string
  ): Promise<MediaJob | null> {
    const result =
      await this.db.query<
        MediaJobRow
      >(
        `
        SELECT
          id,
          job_number,
          tool,
          status,
          worker_id,
          profile_id,
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
        FROM (
          SELECT
            0 AS priority,
            id,
            job_number,
            tool,
            status,
            worker_id,
            profile_id,
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
          WHERE job_number = $1::bigint

          UNION ALL

          SELECT
            1 AS priority,
            'comfy_ref_' ||
              reference_number::text AS id,
            reference_number AS job_number,
            'comfy.artifact' AS tool,
            'succeeded' AS status,
            'Comfy UI' AS worker_id,
            NULL::text AS profile_id,
            'comfy' AS adapter,
            backend_job_id,
            NULL::text AS idempotency_key,
            jsonb_build_object(
              'kind',
              'comfy_artifact',
              'referenceNumber',
              reference_number::text
            ) AS request,
            NULL::jsonb AS result,
            NULL::jsonb AS error,
            first_seen_at AS created_at,
            first_seen_at AS updated_at,
            first_seen_at AS started_at,
            first_seen_at AS finished_at
          FROM media_references
          WHERE kind = 'comfy_artifact'
            AND reference_number = $1::bigint
        ) AS lookup
        ORDER BY priority
        LIMIT 1
        `,
        [jobNumber]
      );

    const row = result.rows[0];

    return row
      ? mapJob(row)
      : null;
  }


  async findByPrefix(
    prefix: string
  ): Promise<MediaJob[]> {
    const result =
      await this.db.query<
        MediaJobRow
      >(
        `
        SELECT
          id,
          job_number,
          tool,
          status,
          worker_id,
          profile_id,
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
        WHERE id LIKE $1
        ORDER BY created_at DESC
        LIMIT 2
        `,
        [`${prefix}%`]
      );

    return result.rows.map(
      mapJob
    );
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
          job_number,
          tool,
          status,
          worker_id,
          profile_id,
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
  ): Promise<boolean> {
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

      const updated =
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
            AND status IN (
              'accepted',
              'queued',
              'finalizing'
            )
          RETURNING id
          `,
          [id]
        );

      if (
        (updated.rowCount ?? 0) === 0
      ) {
        await client.query("COMMIT");
        return false;
      }

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
      return true;
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
  }

  async markSucceeded(
    id: string,
    result: unknown,
    artifacts: unknown[],
    deliveryProviders: string[]
  ): Promise<boolean> {
    const client =
      await this.db.connect();

    try {
      await client.query("BEGIN");

      const locked = await client.query<{ delivery_context: unknown | null }>(
        `
        SELECT id, delivery_context
        FROM media_jobs
        WHERE id = $1
        FOR UPDATE
        `,
        [id]
      );
      const deliveryContext = locked.rows[0]?.delivery_context ?? null;

      const updated =
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
            AND status IN (
              'accepted',
              'queued',
              'running',
              'finalizing'
            )
          RETURNING id
          `,
          [
            id,
            JSON.stringify(result)
          ]
        );

      if (
        (updated.rowCount ?? 0) === 0
      ) {
        await client.query("COMMIT");
        return false;
      }

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

      for (
        const provider of
        deliveryProviders
      ) {
        for (
          const [
            artifactIndex,
            artifact
          ] of artifacts.entries()
        ) {
          await client.query(
            `
            INSERT INTO
              media_deliveries (
                job_id,
                artifact_index,
                artifact,
                provider,
                destination
              )
            VALUES (
              $1,
              $2,
              $3::jsonb,
              $4,
              $5::jsonb
            )
            ON CONFLICT (
              job_id,
              artifact_index,
              provider
            )
            DO NOTHING
            `,
            [
              id,
              artifactIndex,
              JSON.stringify(
                artifact
              ),
              provider,
              deliveryContext ? JSON.stringify(deliveryContext) : null
            ]
          );
        }
      }

      await client.query("COMMIT");
      return true;
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
  }

  async markBackendFailed(
    id: string,
    message: string
  ): Promise<boolean> {
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

      const updated =
        await client.query(
          `
          UPDATE media_jobs
          SET
            status = 'failed',
            error = $2::jsonb,
            finished_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
            AND status IN (
              'accepted',
              'queued',
              'running',
              'finalizing'
            )
          RETURNING id
          `,
          [
            id,
            payload
          ]
        );

      if (
        (updated.rowCount ?? 0) === 0
      ) {
        await client.query("COMMIT");
        return false;
      }

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
      return true;
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
  }

  async markCancelled(
    id: string,
    backendJobId: string
  ): Promise<boolean> {
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

      const updated =
        await client.query(
          `
          UPDATE media_jobs
          SET
            status = 'cancelled',
            finished_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
            AND status IN (
              'accepted',
              'queued',
              'running',
              'finalizing'
            )
          RETURNING id
          `,
          [id]
        );

      if (
        (updated.rowCount ?? 0) === 0
      ) {
        await client.query("COMMIT");
        return false;
      }

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
          'job.cancelled',
          'cancelled',
          $2::jsonb
        FROM media_job_events
        WHERE job_id = $1
        `,
        [
          id,
          JSON.stringify({
            backendJobId
          })
        ]
      );

      await client.query("COMMIT");
      return true;
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
  }

  async markTimedOut(
    id: string,
    backendJobId: string,
    timeoutMs: number
  ): Promise<boolean> {
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
          message:
            "Generation exceeded timeout",

          backendJobId,
          timeoutMs
        });

      const updated =
        await client.query(
          `
          UPDATE media_jobs
          SET
            status = 'timed_out',
            error = $2::jsonb,
            finished_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
            AND status = 'running'
          RETURNING id
          `,
          [
            id,
            payload
          ]
        );

      if (
        (updated.rowCount ?? 0) === 0
      ) {
        await client.query("COMMIT");
        return false;
      }

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
          'job.timed_out',
          'timed_out',
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
      return true;
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
  }


}
