import type {
  Pool
} from "pg";

interface EventRow {
  sequence: number;
  event_type: string;
  stage: string | null;
  payload: unknown;
  created_at: Date;
}

export interface JobEventView {
  sequence: number;
  eventType: string;
  stage: string | null;
  payload: unknown;
  createdAt: string;
}

interface ErrorRow {
  job_id: string;

  kind:
    | "job"
    | "outbox";

  status: string;
  message: string | null;
  occurred_at: Date;
}

export interface RecentErrorView {
  jobId: string;

  kind:
    | "job"
    | "outbox";

  status: string;
  message: string;
  occurredAt: string;
}

export class EventRepository {
  constructor(
    private readonly db:
      Pool
  ) {}

  async listForJob(
    jobId: string
  ): Promise<JobEventView[]> {
    const result =
      await this.db.query<
        EventRow
      >(
        `
        SELECT
          sequence,
          event_type,
          stage,
          payload,
          created_at
        FROM media_job_events
        WHERE job_id = $1
        ORDER BY sequence DESC
        `,
        [jobId]
      );

    return result.rows.map(
      row => ({
        sequence:
          row.sequence,

        eventType:
          row.event_type,

        stage:
          row.stage,

        payload:
          row.payload,

        createdAt:
          row.created_at
            .toISOString()
      })
    );
  }

  async listRecentErrors(
    limit = 5
  ): Promise<
    RecentErrorView[]
  > {
    const safeLimit =
      Math.max(
        1,
        Math.min(
          20,
          Math.floor(limit)
        )
      );

    const result =
      await this.db.query<
        ErrorRow
      >(
        `
        SELECT
          job_id,
          kind,
          status,
          message,
          occurred_at
        FROM (
          SELECT
            e.job_id,

            'job'::text
              AS kind,

            CASE
              WHEN
                e.event_type =
                  'job.timed_out'
              THEN 'timed out'
              ELSE 'failed'
            END
              AS status,

            COALESCE(
              e.payload
                ->> 'message',

              j.error
                ->> 'message',

              'Unknown error'
            )
              AS message,

            e.created_at
              AS occurred_at

          FROM media_job_events e

          JOIN media_jobs j
            ON j.id =
              e.job_id

          WHERE
            e.event_type IN (
              'job.failed',
              'job.timed_out'
            )

          UNION ALL

          SELECT
            e.job_id,

            'outbox'::text
              AS kind,

            'failed'::text
              AS status,

            COALESCE(
              e.payload
                ->> 'message',

              'Unknown error'
            )
              AS message,

            e.created_at
              AS occurred_at

          FROM media_job_events e

          WHERE
            e.event_type =
              'delivery.failed'

            AND COALESCE(
              (
                e.payload
                  ->> 'terminal'
              )::boolean,

              false
            ) = true
        ) failures

        ORDER BY
          occurred_at DESC

        LIMIT $1
        `,
        [safeLimit]
      );

    return result.rows.map(
      row => ({
        jobId:
          row.job_id,

        kind:
          row.kind,

        status:
          row.status,

        message:
          row.message ??
          "Unknown error",

        occurredAt:
          row.occurred_at
            .toISOString()
      })
    );
  }
}
