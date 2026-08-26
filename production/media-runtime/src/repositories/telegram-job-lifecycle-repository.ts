import type {
  Pool
} from "pg";

interface LifecycleRow {
  job_id: string;
  chat_id: string;
  message_id: string;
  presentation_state:
    | "active"
    | "terminal"
    | "delivered";
  last_job_status: string | null;

  job_number: string;
  status: string;
  worker_id: string | null;
  profile_id: string | null;
  tool: string;
  backend_job_id: string | null;
  request: unknown;
  error: unknown | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface TelegramLifecycleJob {
  jobId: string;
  chatId: string;
  messageId: string;
  presentationState:
    | "active"
    | "terminal"
    | "delivered";
  lastJobStatus: string | null;

  jobNumber: string;
  status: string;
  workerId: string | null;
  profileId: string | null;
  tool: string;
  backendJobId: string | null;
  request: unknown;
  error: unknown | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

function mapRow(
  row: LifecycleRow
): TelegramLifecycleJob {
  return {
    jobId: row.job_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    presentationState:
      row.presentation_state,
    lastJobStatus:
      row.last_job_status,

    jobNumber: row.job_number,
    status: row.status,
    workerId: row.worker_id,
    profileId: row.profile_id,
    tool: row.tool,
    backendJobId:
      row.backend_job_id,
    request: row.request,
    error: row.error,
    createdAt:
      row.created_at.toISOString(),
    startedAt:
      row.started_at
        ?.toISOString() ?? null,
    finishedAt:
      row.finished_at
        ?.toISOString() ?? null
  };
}

const SELECT_LIFECYCLE = `
  SELECT
    l.job_id,
    l.chat_id,
    l.message_id,
    l.presentation_state,
    l.last_job_status,
    j.job_number,
    j.status,
    j.worker_id,
    j.profile_id,
    j.tool,
    j.backend_job_id,
    j.request,
    j.error,
    j.created_at,
    j.started_at,
    j.finished_at
  FROM telegram_job_lifecycles l
  JOIN media_jobs j
    ON j.id = l.job_id
`;

export class TelegramJobLifecycleRepository {
  constructor(
    private readonly db: Pool
  ) {}

  async attach(
    input: {
      jobId: string;
      chatId: string;
      messageId: string;
      lastJobStatus?: string | null;
    }
  ) {
    await this.db.query(
      `
      INSERT INTO telegram_job_lifecycles (
        job_id,
        chat_id,
        message_id,
        presentation_state,
        last_job_status
      )
      VALUES (
        $1,
        $2,
        $3,
        'active',
        $4
      )
      ON CONFLICT (job_id)
      DO UPDATE SET
        chat_id = EXCLUDED.chat_id,
        message_id = EXCLUDED.message_id,
        presentation_state = 'active',
        last_job_status = EXCLUDED.last_job_status,
        updated_at = NOW()
      `,
      [
        input.jobId,
        input.chatId,
        input.messageId,
        input.lastJobStatus ?? null
      ]
    );
  }

  async get(
    jobId: string
  ): Promise<TelegramLifecycleJob | null> {
    const result =
      await this.db.query<LifecycleRow>(
        `${SELECT_LIFECYCLE}
        WHERE l.job_id = $1
        `,
        [jobId]
      );

    return result.rows[0]
      ? mapRow(result.rows[0])
      : null;
  }

  async findByBackendJobId(
    backendJobId: string
  ): Promise<TelegramLifecycleJob | null> {
    const result =
      await this.db.query<LifecycleRow>(
        `${SELECT_LIFECYCLE}
        WHERE
          l.presentation_state = 'active'
          AND j.backend_job_id = $1
        LIMIT 1
        `,
        [backendJobId]
      );

    return result.rows[0]
      ? mapRow(result.rows[0])
      : null;
  }

  async listActive(
    limit = 100
  ): Promise<TelegramLifecycleJob[]> {
    const safeLimit = Math.max(
      1,
      Math.min(500, Math.floor(limit))
    );

    const result =
      await this.db.query<LifecycleRow>(
        `${SELECT_LIFECYCLE}
        WHERE
          l.presentation_state = 'active'
          AND COALESCE(
            l.last_job_status,
            ''
          ) NOT IN (
            'delivery_retrying',
            'delivery_failed'
          )
        ORDER BY l.updated_at, l.job_id
        LIMIT $1
        `,
        [safeLimit]
      );

    return result.rows.map(mapRow);
  }

  async markRenderedStatus(
    jobId: string,
    status: string
  ) {
    await this.db.query(
      `
      UPDATE telegram_job_lifecycles
      SET
        last_job_status = $2,
        updated_at = NOW()
      WHERE job_id = $1
        AND presentation_state = 'active'
      `,
      [jobId, status]
    );
  }

  async markDeliveryPresentation(
    jobId: string,
    state:
      | "delivery_retrying"
      | "delivery_failed"
  ) {
    await this.db.query(
      `
      UPDATE telegram_job_lifecycles
      SET
        last_job_status = $2,
        updated_at = NOW()
      WHERE job_id = $1
        AND presentation_state = 'active'
      `,
      [jobId, state]
    );
  }

  async markTerminal(
    jobId: string,
    status: string
  ) {
    await this.db.query(
      `
      UPDATE telegram_job_lifecycles
      SET
        presentation_state = 'terminal',
        last_job_status = $2,
        updated_at = NOW()
      WHERE job_id = $1
        AND presentation_state = 'active'
      `,
      [jobId, status]
    );
  }

  async markDelivered(
    jobId: string
  ) {
    await this.db.query(
      `
      UPDATE telegram_job_lifecycles
      SET
        presentation_state = 'delivered',
        last_job_status = 'succeeded',
        updated_at = NOW()
      WHERE job_id = $1
        AND presentation_state = 'active'
      `,
      [jobId]
    );
  }
}
