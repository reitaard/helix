import {
  ComfyClient
} from "../adapters/comfy/client.js";

import type {
  WorkerDefinition,
  WorkerHealth,
  WorkerState
} from "../domain/worker.js";

function failureMessage(
  name: string,
  result: PromiseSettledResult<unknown>
): string | null {
  if (
    result.status === "fulfilled"
  ) {
    return null;
  }

  const reason =
    result.reason instanceof Error
      ? result.reason.message
      : String(result.reason);

  return `${name}: ${reason}`;
}

export class WorkerRegistry {
  private readonly definitions =
    new Map<
      string,
      WorkerDefinition
    >();

  private readonly comfyClients =
    new Map<
      string,
      ComfyClient
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
        this.comfyClients.set(
          worker.id,
          new ComfyClient(
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

  async health(
    id: string
  ): Promise<WorkerHealth | null> {
    const worker =
      this.definitions.get(id);

    const client =
      this.comfyClients.get(id);

    if (!worker || !client) {
      return null;
    }

    const started =
      performance.now();

    const [
      statsResult,
      queueResult,
      objectInfoResult,
      websocketResult
    ] = await Promise.allSettled([
      client.systemStats(),
      client.queue(),
      client.objectInfo(),
      client.statusSocket()
    ]);

    const checks = {
      systemStats:
        statsResult.status ===
        "fulfilled",

      queue:
        queueResult.status ===
        "fulfilled",

      objectInfo:
        objectInfoResult.status ===
        "fulfilled",

      websocket:
        websocketResult.status ===
        "fulfilled"
    };

    const errors = [
      failureMessage(
        "systemStats",
        statsResult
      ),

      failureMessage(
        "queue",
        queueResult
      ),

      failureMessage(
        "objectInfo",
        objectInfoResult
      ),

      failureMessage(
        "websocket",
        websocketResult
      )
    ].filter(
      (
        value
      ): value is string =>
        value !== null
    );

    let state:
      WorkerState = "degraded";

    if (!checks.systemStats) {
      state = "offline";
    }
    else if (
      Object.values(
        checks
      ).every(Boolean)
    ) {
      const running =
        queueResult.status ===
        "fulfilled"
          ? queueResult.value
              .queue_running
              ?.length ?? 0
          : 0;

      /*
       * We intentionally use
       * cold_ready here.
       *
       * API/network readiness is
       * proven, but a versioned
       * production canary has not
       * been introduced yet.
       */
      state =
        running > 0
          ? "busy"
          : "cold_ready";
    }

    const health:
      WorkerHealth = {
        workerId: worker.id,
        profile: worker.profile,

        state,
        checks,

        latencyMs:
          Math.round(
            performance.now() -
              started
          ),

        errors
      };

    if (
      statsResult.status ===
      "fulfilled"
    ) {
      const system =
        statsResult.value.system;

      const comfy:
        NonNullable<
          WorkerHealth["comfy"]
        > = {};

      if (
        system?.comfyui_version !==
        undefined
      ) {
        comfy.version =
          system.comfyui_version;
      }

      if (
        system?.python_version !==
        undefined
      ) {
        comfy.python =
          system.python_version;
      }

      if (
        system?.pytorch_version !==
        undefined
      ) {
        comfy.pytorch =
          system.pytorch_version;
      }

      health.comfy = comfy;

      health.device =
        statsResult.value
          .devices?.[0];
    }

    if (
      queueResult.status ===
      "fulfilled"
    ) {
      health.queue = {
        running:
          queueResult.value
            .queue_running
            ?.length ?? 0,

        pending:
          queueResult.value
            .queue_pending
            ?.length ?? 0
      };
    }

    if (
      objectInfoResult.status ===
      "fulfilled"
    ) {
      health.nodeClassCount =
        Object.keys(
          objectInfoResult.value
        ).length;
    }

    return health;
  }
}
