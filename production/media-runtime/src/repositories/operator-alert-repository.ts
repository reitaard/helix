import type {
  Pool,
  PoolClient
} from "pg";

export interface ClaimedOperatorAlert {
  id: number;
  kind: string;

  jobId:
    string | null;

  payload: unknown;
  attemptCount: number;
}

interface AlertRow {
  id: number;
  kind: string;

  job_id:
    string | null;

  payload: unknown;

  attempt_count:
    number;
}

interface CursorRow {
  last_event_id: string;
}

interface MaxEventRow {
  max_event_id: string;
}

interface WorkerStateRow {
  state:
    | "unknown"
    | "online"
    | "offline";

  consecutive_failures:
    number;

  consecutive_successes:
    number;

  last_transition_at:
    Date | null;
}

export interface WorkerAlertObservation {
  workerId: string;
  workerName: string;
  reachable: boolean;

  error:
    string | null;

  presentationState:
    string;
}

export class OperatorAlertRepository {
  constructor(
    private readonly db:
      Pool
  ) {}

  private async ensureCursor(
    client: PoolClient
  ) {
    await client.query(
      `
      INSERT INTO
        operator_alert_cursors (
          name,
          last_event_id
        )

      SELECT
        'telegram-domain-events',
        COALESCE(MAX(id), 0)

      FROM media_job_events

      ON CONFLICT (name)
      DO NOTHING
      `
    );
  }

  async discoverDomainAlerts() {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await this.ensureCursor(
        client
      );

      const cursor =
        await client.query<
          CursorRow
        >(
          `
          SELECT
            last_event_id::text

          FROM
            operator_alert_cursors

          WHERE
            name =
              'telegram-domain-events'

          FOR UPDATE
          `
        );

      const lastEventId =
        cursor.rows[0]
          ?.last_event_id ??
        "0";

      const maximum =
        await client.query<
          MaxEventRow
        >(
          `
          SELECT
            COALESCE(
              MAX(id),
              0
            )::text
              AS max_event_id

          FROM media_job_events
          `
        );

      const maxEventId =
        maximum.rows[0]
          ?.max_event_id ??
        lastEventId;

      if (
        BigInt(maxEventId) >
        BigInt(lastEventId)
      ) {
        await client.query(
          `
          INSERT INTO
            operator_alerts (
              dedupe_key,
              kind,
              job_id,
              payload
            )

          SELECT
            'event:' ||
              e.id::text,

            CASE
              WHEN
                e.event_type =
                  'job.failed'
              THEN 'job_failed'

              WHEN
                e.event_type =
                  'job.timed_out'
              THEN 'job_timed_out'

              ELSE
                'outbox_failed'
            END,

            e.job_id,

            CASE
              WHEN
                e.event_type IN (
                  'job.failed',
                  'job.timed_out'
                )

              THEN
                jsonb_build_object(
                  'workerId',
                    j.worker_id,

                  'error',
                    COALESCE(
                      e.payload
                        ->> 'message',

                      j.error
                        ->> 'message',

                      'Unknown error'
                    ),

                  'startedAt',
                    j.started_at,

                  'finishedAt',
                    j.finished_at
                )

              ELSE
                jsonb_build_object(
                  'provider',
                    COALESCE(
                      e.payload
                        ->> 'provider',

                      'telegram'
                    ),

                  'attempts',
                    COALESCE(
                      d.attempt_count,
                      0
                    ),

                  'error',
                    COALESCE(
                      e.payload
                        ->> 'message',

                      'Unknown error'
                    )
                )
            END

          FROM media_job_events e

          JOIN media_jobs j
            ON j.id =
              e.job_id

          LEFT JOIN
            media_deliveries d

            ON d.job_id =
              e.job_id

            AND d.provider =
              e.payload
                ->> 'provider'

            AND d.artifact_index =
              CASE
                WHEN
                  e.payload
                    ? 'artifactIndex'

                THEN
                  (
                    e.payload
                      ->> 'artifactIndex'
                  )::integer

                ELSE -1
              END

          WHERE
            e.id >
              $1::bigint

            AND e.id <=
              $2::bigint

            AND (
              e.event_type IN (
                'job.failed',
                'job.timed_out'
              )

              OR (
                e.event_type =
                  'delivery.failed'

                AND COALESCE(
                  (
                    e.payload
                      ->> 'terminal'
                  )::boolean,

                  false
                ) = true
              )
            )

          ON CONFLICT (
            dedupe_key
          )
          DO NOTHING
          `,
          [
            lastEventId,
            maxEventId
          ]
        );

        await client.query(
          `
          UPDATE
            operator_alert_cursors

          SET
            last_event_id =
              GREATEST(
                last_event_id,
                $2::bigint
              ),

            updated_at =
              NOW()

          WHERE
            name = $1
          `,
          [
            "telegram-domain-events",
            maxEventId
          ]
        );
      }

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

  async claimDue():
    Promise<
      ClaimedOperatorAlert |
      null
    > {

    const result =
      await this.db.query<
        AlertRow
      >(
        `
        WITH candidate AS (
          SELECT id

          FROM operator_alerts

          WHERE
            status = 'pending'

            OR (
              status = 'failed'

              AND
                next_attempt_at
                  IS NOT NULL

              AND
                next_attempt_at
                  <= NOW()
            )

            OR (
              status = 'sending'

              AND
                updated_at <=
                  NOW() -
                  INTERVAL '5 minutes'
            )

          ORDER BY
            created_at,
            id

          FOR UPDATE
            SKIP LOCKED

          LIMIT 1
        ),

        claimed AS (
          UPDATE
            operator_alerts a

          SET
            status = 'sending',

            attempt_count =
              a.attempt_count + 1,

            updated_at =
              NOW(),

            last_error =
              NULL

          FROM candidate c

          WHERE
            a.id = c.id

          RETURNING a.*
        )

        SELECT
          id,
          kind,
          job_id,
          payload,
          attempt_count

        FROM claimed
        `
      );

    const row =
      result.rows[0];

    return row
      ? {
          id:
            row.id,

          kind:
            row.kind,

          jobId:
            row.job_id,

          payload:
            row.payload,

          attemptCount:
            row.attempt_count
        }
      : null;
  }

  async markSent(
    id: number
  ) {
    await this.db.query(
      `
      UPDATE operator_alerts

      SET
        status = 'sent',

        next_attempt_at =
          NULL,

        last_error =
          NULL,

        sent_at =
          NOW(),

        updated_at =
          NOW()

      WHERE id = $1
      `,
      [id]
    );
  }

  async markFailed(
    id: number,
    message: string,

    retryAfterSeconds:
      number | null
  ) {
    await this.db.query(
      `
      UPDATE operator_alerts

      SET
        status = 'failed',

        last_error =
          $2,

        next_attempt_at =
          CASE
            WHEN
              $3::integer
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
        id,
        message,
        retryAfterSeconds
      ]
    );
  }

  async observeWorker(
    input:
      WorkerAlertObservation,

    failureThreshold = 2,
    successThreshold = 2,
    cooldownSeconds = 60
  ) {
    const client =
      await this.db.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await client.query(
        `
        INSERT INTO
          operator_worker_alert_state (
            worker_id
          )

        VALUES ($1)

        ON CONFLICT (
          worker_id
        )
        DO NOTHING
        `,
        [input.workerId]
      );

      const result =
        await client.query<
          WorkerStateRow
        >(
          `
          SELECT
            state,
            consecutive_failures,
            consecutive_successes,
            last_transition_at

          FROM
            operator_worker_alert_state

          WHERE
            worker_id = $1

          FOR UPDATE
          `,
          [input.workerId]
        );

      const current =
        result.rows[0];

      if (!current) {
        throw new Error(
          "Worker alert state disappeared"
        );
      }

      const now =
        Date.now();

      const cooldownElapsed =
        current
          .last_transition_at ===
          null ||

        now -
          current
            .last_transition_at
            .getTime() >=
          cooldownSeconds * 1000;

      let nextState =
        current.state;

      let failures =
        current
          .consecutive_failures;

      let successes =
        current
          .consecutive_successes;

      let transition:
        | "offline"
        | "recovered"
        | null =
          null;

      if (input.reachable) {
        failures = 0;

        if (
          current.state ===
            "offline"
        ) {
          successes += 1;

          if (
            successes >=
              successThreshold &&

            cooldownElapsed
          ) {
            nextState =
              "online";

            successes = 0;

            transition =
              "recovered";
          }
        }
        else {
          successes = 0;

          if (
            current.state ===
              "unknown"
          ) {
            nextState =
              "online";
          }
        }
      }
      else {
        successes = 0;

        if (
          current.state ===
            "offline"
        ) {
          failures = 0;
        }
        else {
          failures += 1;

          if (
            failures >=
              failureThreshold &&

            cooldownElapsed
          ) {
            nextState =
              "offline";

            failures = 0;

            transition =
              "offline";
          }
        }
      }

      await client.query(
        `
        UPDATE
          operator_worker_alert_state

        SET
          state = $2,

          consecutive_failures =
            $3,

          consecutive_successes =
            $4,

          last_error =
            $5,

          last_transition_at =
            CASE
              WHEN $6::boolean
              THEN NOW()

              ELSE
                last_transition_at
            END,

          updated_at =
            NOW()

        WHERE
          worker_id = $1
        `,
        [
          input.workerId,
          nextState,
          failures,
          successes,

          input.reachable
            ? null
            : input.error,

          transition !== null ||
          current.state ===
            "unknown"
        ]
      );

      if (transition) {
        const payload =
          transition ===
          "offline"
            ? {
                workerName:
                  input.workerName,

                error:
                  input.error
              }
            : {
                workerName:
                  input.workerName,

                state:
                  input
                    .presentationState
              };

        await client.query(
          `
          INSERT INTO
            operator_alerts (
              dedupe_key,
              kind,
              payload
            )

          VALUES (
            $1,
            $2,
            $3::jsonb
          )
          `,
          [
            `worker:${input.workerId}:${transition}:${now}`,

            transition ===
              "offline"
              ? "worker_offline"
              : "worker_recovered",

            JSON.stringify(
              payload
            )
          ]
        );
      }

      await client.query(
        "COMMIT"
      );

      return transition;
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
