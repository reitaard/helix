import {
  WorkerRegistry
} from "./registry.js";

import {
  WorkerRepository
} from "../repositories/worker-repository.js";

export class WorkerService {
  constructor(
    private readonly registry:
      WorkerRegistry,

    private readonly repository:
      WorkerRepository
  ) {}

  list() {
    return this.registry.list();
  }

  get(id: string) {
    return this.registry.get(id);
  }

  liveness(id: string) {
    return this.registry
      .liveness(id);
  }

  async readiness(
    id: string
  ) {
    const result =
      await this.registry
        .readiness(id);

    if (!result) {
      return null;
    }

    await this.repository
      .recordObservation({
        workerId:
          result.workerId,

        state:
          result.state,

        runtimeOk:
          result.checks.runtime,

        queueOk:
          result.checks.queue,

        capabilitiesOk:
          result.checks.capabilities,

        eventsOk:
          result.checks.events,

        latencyMs:
          result.latencyMs,

        queueRunning:
          result.queue?.running ??
          null,

        queuePending:
          result.queue?.pending ??
          null,

        capabilityCount:
          result.capabilityCount ??
          null,

        backendVersion:
          result.backend?.version ??
          null,

        device:
          result.device ?? null,

        errors:
          result.errors
      });

    return result;
  }

  health(id: string) {
    return this.readiness(id);
  }
}
