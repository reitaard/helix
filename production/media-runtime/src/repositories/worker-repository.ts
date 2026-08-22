import type {
  Pool
} from "pg";

import type {
  WorkerState
} from "../domain/worker.js";

export interface WorkerObservationInput {
  workerId: string;
  state: WorkerState;

  runtimeOk: boolean;
  queueOk: boolean;
  capabilitiesOk: boolean;
  eventsOk: boolean;

  latencyMs: number | null;

  queueRunning: number | null;
  queuePending: number | null;

  capabilityCount: number | null;

  backendVersion: string | null;

  device: unknown | null;

  errors: string[];
}

export class WorkerRepository {
  constructor(
    private readonly db: Pool
  ) {}

  async upsertWorker(
    input: {
      id: string;
      profile: string;
      adapter: string;
    }
  ) {
    await this.db.query(
      `
      INSERT INTO workers (
        id,
        profile,
        adapter
      )
      VALUES ($1, $2, $3)

      ON CONFLICT (id)
      DO UPDATE SET
        profile = EXCLUDED.profile,
        adapter = EXCLUDED.adapter,
        updated_at = NOW()
      `,
      [
        input.id,
        input.profile,
        input.adapter
      ]
    );
  }

  async recordObservation(
    input: WorkerObservationInput
  ) {
    await this.db.query(
      `
      INSERT INTO worker_observations (
        worker_id,
        state,

        runtime_ok,
        queue_ok,
        capabilities_ok,
        events_ok,

        latency_ms,

        queue_running,
        queue_pending,

        capability_count,

        backend_version,

        device,
        errors
      )
      VALUES (
        $1, $2,
        $3, $4, $5, $6,
        $7,
        $8, $9,
        $10,
        $11,
        $12::jsonb,
        $13::jsonb
      )
      `,
      [
        input.workerId,
        input.state,

        input.runtimeOk,
        input.queueOk,
        input.capabilitiesOk,
        input.eventsOk,

        input.latencyMs,

        input.queueRunning,
        input.queuePending,

        input.capabilityCount,

        input.backendVersion,

        input.device === null
          ? null
          : JSON.stringify(
              input.device
            ),

        JSON.stringify(
          input.errors
        )
      ]
    );
  }
}
