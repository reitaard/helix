import {
  ComfyAdapter
} from "../adapters/comfy/adapter.js";

import type {
  WorkerDefinition,
  WorkerState
} from "../domain/worker.js";

export class WorkerRegistry {
  private readonly definitions =
    new Map<
      string,
      WorkerDefinition
    >();

  private readonly adapters =
    new Map<
      string,
      ComfyAdapter
    >();

  constructor(
    workers: WorkerDefinition[]
  ) {
    for (const worker of workers) {
      this.definitions.set(
        worker.id,
        worker
      );

      if (
        worker.adapter === "comfy"
      ) {
        this.adapters.set(
          worker.id,
          new ComfyAdapter(
            worker.endpoint
          )
        );
      }
    }
  }

  list() {
    return [
      ...this.definitions.values()
    ].map(worker => ({
      id: worker.id,
      profile: worker.profile,

      runtime:
        worker.adapter,

      capabilities:
        worker.capabilities,

      modelFamilies:
        worker.modelFamilies,

      maxConcurrentGpuJobs:
        worker.maxConcurrentGpuJobs
    }));
  }

  get(id: string) {
    const worker =
      this.definitions.get(id);

    if (!worker) {
      return null;
    }

    return {
      id: worker.id,
      profile: worker.profile,

      runtime:
        worker.adapter,

      capabilities:
        worker.capabilities,

      modelFamilies:
        worker.modelFamilies,

      maxConcurrentGpuJobs:
        worker.maxConcurrentGpuJobs
    };
  }

  async liveness(
    id: string
  ) {
    const worker =
      this.definitions.get(id);

    const adapter =
      this.adapters.get(id);

    if (!worker || !adapter) {
      return null;
    }

    const result =
      await adapter.liveness();

    return {
      workerId: worker.id,
      profile: worker.profile,

      ...result
    };
  }

  async readiness(
    id: string
  ) {
    const worker =
      this.definitions.get(id);

    const adapter =
      this.adapters.get(id);

    if (!worker || !adapter) {
      return null;
    }

    const result =
      await adapter.readiness();

    let state:
      WorkerState = "degraded";

    if (!result.checks.runtime) {
      state = "offline";
    }
    else if (
      result.transportReady
    ) {
      state =
        (result.queue?.running ?? 0) > 0
          ? "busy"
          : "cold_ready";
    }

    return {
      workerId: worker.id,
      profile: worker.profile,
      state,

      ...result
    };
  }

  /*
   * Temporary compatibility route.
   *
   * Existing clients already call
   * /health, so for Checkpoint 2 it
   * remains equivalent to readiness.
   *
   * Later this can become a cached
   * summary rather than running the
   * expensive readiness probe.
   */
  async health(
    id: string
  ) {
    return this.readiness(id);
  }

}
