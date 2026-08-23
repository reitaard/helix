import type {
  Pool
} from "pg";

export type OutboxState =
  | "pending"
  | "sending"
  | "retrying"
  | "failed";

interface OutboxCountRow {
  pending: number;
  sending: number;
  retrying: number;
  failed: number;
}

interface OutboxItemRow {
  job_id: string;
  artifact_index: number;
  provider: string;
  status: string;
  attempt_count: number;
  next_attempt_at: Date | null;
  error: unknown | null;
  updated_at: Date;
}

export interface OutboxItem {
  jobId: string;
  artifactIndex: number;
  provider: string;
  state: OutboxState;
  attemptCount: number;
  nextAttemptAt: string | null;
  error: unknown | null;
  updatedAt: string;
}

export interface OutboxSnapshot {
  pending: number;
  sending: number;
  retrying: number;
  failed: number;
  total: number;
  hiddenCount: number;
  items: OutboxItem[];
}

function mapState(
  status: string,
  nextAttemptAt: Date | null
): OutboxState {
  if (status === "pending") {
    return "pending";
  }

  if (status === "delivering") {
    return "sending";
  }

  if (
    status === "failed" &&
    nextAttemptAt
  ) {
    return "retrying";
  }

  return "failed";
}

export class OutboxRepository {
  constructor(
    private readonly db: Pool
  ) {}

  async snapshot(
    provider: string,
    limit = 5
  ): Promise<OutboxSnapshot> {
    const safeLimit =
      Math.max(
        1,
        Math.min(
          20,
          Math.floor(limit)
        )
      );

    const [
      counts,
      items
    ] =
      await Promise.all([
        this.db.query<
          OutboxCountRow
        >(
          `
          SELECT
            COUNT(*) FILTER (
              WHERE status = 'pending'
            )::int AS pending,

            COUNT(*) FILTER (
              WHERE status = 'delivering'
            )::int AS sending,

            COUNT(*) FILTER (
              WHERE
                status = 'failed'
                AND next_attempt_at IS NOT NULL
            )::int AS retrying,

            COUNT(*) FILTER (
              WHERE
                status = 'failed'
                AND next_attempt_at IS NULL
            )::int AS failed
          FROM media_deliveries
          WHERE
            provider = $1
            AND status <> 'delivered'
          `,
          [provider]
        ),

        this.db.query<
          OutboxItemRow
        >(
          `
          SELECT
            job_id,
            artifact_index,
            provider,
            status,
            attempt_count,
            next_attempt_at,
            error,
            updated_at
          FROM media_deliveries
          WHERE
            provider = $1
            AND status IN (
              'pending',
              'delivering',
              'failed'
            )
          ORDER BY
            CASE
              WHEN
                status = 'failed'
                AND next_attempt_at IS NULL
              THEN 0

              WHEN status = 'failed'
              THEN 1

              WHEN status = 'delivering'
              THEN 2

              ELSE 3
            END,

            COALESCE(
              next_attempt_at,
              updated_at
            ),

            updated_at
          LIMIT $2
          `,
          [
            provider,
            safeLimit
          ]
        )
      ]);

    const count =
      counts.rows[0] ?? {
        pending: 0,
        sending: 0,
        retrying: 0,
        failed: 0
      };

    const total =
      count.pending +
      count.sending +
      count.retrying +
      count.failed;

    const mapped =
      items.rows.map(
        row => ({
          jobId:
            row.job_id,

          artifactIndex:
            row.artifact_index,

          provider:
            row.provider,

          state:
            mapState(
              row.status,
              row.next_attempt_at
            ),

          attemptCount:
            row.attempt_count,

          nextAttemptAt:
            row.next_attempt_at
              ?.toISOString() ??
            null,

          error:
            row.error,

          updatedAt:
            row.updated_at
              .toISOString()
        })
      );

    return {
      pending:
        count.pending,

      sending:
        count.sending,

      retrying:
        count.retrying,

      failed:
        count.failed,

      total,

      hiddenCount:
        Math.max(
          0,
          total - mapped.length
        ),

      items:
        mapped
    };
  }
}
