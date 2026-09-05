import crypto from "node:crypto";
import type { Pool } from "pg";

interface DispatchRow {
  id: string;
  worker_id: string;
  resource_id: string;
  request: unknown;
  dispatch_token: string;
}

export interface DispatchClaim {
  jobId: string;
  workerId: string;
  resourceId: string;
  request: unknown;
  dispatchToken: string;
}

/** PostgreSQL resource-row locking is the serialization point across runtime instances. */
export class DispatchRepository {
  constructor(private readonly db: Pool) {}

  async claimNext(): Promise<DispatchClaim | null> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const resource = await client.query<{ id: string; capacity: number }>(
        `
        SELECT r.id, r.capacity
        FROM execution_resources r
        WHERE EXISTS (
          SELECT 1 FROM media_jobs pending
          WHERE pending.resource_id = r.id
            AND pending.status = 'accepted'
            AND pending.dispatch_state = 'pending'
        )
        ORDER BY (
          SELECT MIN(pending.created_at) FROM media_jobs pending
          WHERE pending.resource_id = r.id
            AND pending.status = 'accepted'
            AND pending.dispatch_state = 'pending'
        ), r.id
        FOR UPDATE OF r SKIP LOCKED
        LIMIT 1
        `
      );
      const selected = resource.rows[0];
      if (!selected) {
        await client.query("COMMIT");
        return null;
      }

      const active = await client.query<{ total: number }>(
        `
        SELECT COUNT(*)::int AS total
        FROM media_jobs
        WHERE resource_id = $1
          AND dispatch_state IN ('claimed', 'dispatched')
          AND status IN ('accepted', 'queued', 'running', 'finalizing')
        `,
        [selected.id]
      );
      if ((active.rows[0]?.total ?? 0) >= selected.capacity) {
        await client.query("COMMIT");
        return null;
      }

      const token = `dispatch_${crypto.randomUUID().replaceAll("-", "")}`;
      const claimed = await client.query<DispatchRow>(
        `
        WITH candidate AS (
          SELECT id
          FROM media_jobs
          WHERE resource_id = $1
            AND status = 'accepted'
            AND dispatch_state = 'pending'
          ORDER BY created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE media_jobs j
        SET dispatch_state = 'claimed',
            dispatch_token = $2,
            dispatch_claimed_at = NOW(),
            updated_at = NOW()
        FROM candidate c
        WHERE j.id = c.id
        RETURNING j.id, j.worker_id, j.resource_id, j.request, j.dispatch_token
        `,
        [selected.id, token]
      );
      await client.query("COMMIT");
      const row = claimed.rows[0];
      return row ? {
        jobId: row.id,
        workerId: row.worker_id,
        resourceId: row.resource_id,
        request: row.request,
        dispatchToken: row.dispatch_token
      } : null;
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
  }

  async markDispatched(input: { jobId: string; dispatchToken: string; backendJobId: string; backendResponse: unknown }) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `
        UPDATE media_jobs
        SET status = 'queued', backend_job_id = $3,
            dispatch_state = 'dispatched', updated_at = NOW()
        WHERE id = $1 AND dispatch_token = $2
          AND status = 'accepted' AND dispatch_state = 'claimed'
        RETURNING id
        `,
        [input.jobId, input.dispatchToken, input.backendJobId]
      );
      if ((updated.rowCount ?? 0) !== 1) throw new Error(`Dispatch claim lost for ${input.jobId}`);
      await client.query(
        `
        INSERT INTO media_job_events (job_id, sequence, event_type, stage, payload)
        SELECT $1, COALESCE(MAX(sequence), 0) + 1, 'job.queued', 'queued', $2::jsonb
        FROM media_job_events WHERE job_id = $1
        `,
        [input.jobId, JSON.stringify({ backendJobId: input.backendJobId, backendResponse: input.backendResponse, dispatchToken: input.dispatchToken })]
      );
      await client.query("COMMIT");
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally { client.release(); }
  }

  async markDispatchFailed(jobId: string, dispatchToken: string, message: string) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `
        UPDATE media_jobs
        SET status = 'failed', dispatch_state = 'completed',
            error = $3::jsonb, finished_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND dispatch_token = $2
          AND status = 'accepted' AND dispatch_state = 'claimed'
        RETURNING id
        `,
        [jobId, dispatchToken, JSON.stringify({ message })]
      );
      if ((updated.rowCount ?? 0) === 1) {
        await client.query(
          `
          INSERT INTO media_job_events (job_id, sequence, event_type, stage, payload)
          SELECT $1, COALESCE(MAX(sequence), 0) + 1, 'job.failed', 'failed', $2::jsonb
          FROM media_job_events WHERE job_id = $1
          `,
          [jobId, JSON.stringify({ message })]
        );
      }
      await client.query("COMMIT");
    }
    catch (error) {
      await client.query("ROLLBACK"); throw error;
    }
    finally { client.release(); }
  }
}
