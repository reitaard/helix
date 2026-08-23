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
      name: worker.name,
      profile: worker.profile,
      revision: worker.revision,

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
      name: worker.name,
      profile: worker.profile,
      revision: worker.revision,

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
      name: worker.name,
      profile: worker.profile,
      revision: worker.revision,

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

    const executionReady =
      result.checks.runtime &&
      result.checks.queue &&
      result.checks.capabilities;

    if (!result.checks.runtime) {
      state = "offline";
    }
    else if (
      executionReady
    ) {
      state =
        (result.queue?.running ?? 0) > 0
          ? "busy"
          : "cold_ready";
    }

    return {
      workerId: worker.id,
      name: worker.name,
      profile: worker.profile,
      revision: worker.revision,
      state,

      ...result
    };
  }

  async queue(
    id: string
  ) {
    const adapter =
      this.adapters.get(id);

    if (!adapter) {
      return null;
    }

    return adapter.queueSummary();
  }

  async submit(
    id: string,
    workflow:
      Record<string, unknown>
  ) {
    const adapter =
      this.adapters.get(id);

    if (!adapter) {
      return null;
    }

    return adapter.submit(
      workflow
    );
  }

  async cancel(
    id: string,
    backendJobId: string
  ) {
    const adapter =
      this.adapters.get(id);

    if (!adapter) {
      return null;
    }

    return adapter.cancel(
      backendJobId
    );
  }

  async downloadArtifact(
    id: string,

    artifact: {
      filename: string;
      subfolder: string;
      type: string;
    },

    destinationPath:
      string
  ) {
    const adapter =
      this.adapters.get(id);

    if (!adapter) {
      return false;
    }

    await adapter
      .downloadArtifact(
        artifact,
        destinationPath
      );

    return true;
  }

  async status(
    id: string,
    backendJobId: string
  ) {
    const adapter =
      this.adapters.get(id);

    if (!adapter) {
      return null;
    }

    return adapter.status(
      backendJobId
    );
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
