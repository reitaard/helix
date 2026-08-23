import {
  ComfyClient
} from "./client.js";

import {
  readComfyExecutionStatus
} from "./execution-status.js";

import type {
  AdapterLiveness,
  AdapterReadiness,
  MediaAdapter
} from "../../domain/media-adapter.js";

function errorText(
  value: unknown
): string {
  return value instanceof Error
    ? value.message
    : String(value);
}

function failedCheck(
  name: string,
  result:
    PromiseSettledResult<unknown>
): string | null {
  if (
    result.status === "fulfilled"
  ) {
    return null;
  }

  return `${name}: ${errorText(
    result.reason
  )}`;
}

export class ComfyAdapter
  implements MediaAdapter {

  readonly kind = "comfy" as const;

  private readonly client:
    ComfyClient;

  constructor(
    endpoint: string
  ) {
    this.client =
      new ComfyClient(endpoint);
  }

  async liveness():
    Promise<AdapterLiveness> {

    const started =
      performance.now();

    try {
      const stats =
        await this.client
          .systemStats();

      const result:
        AdapterLiveness = {
          adapter: this.kind,
          reachable: true,
          latencyMs: Math.round(
            performance.now() -
              started
          )
        };

      const version =
        stats.system
          ?.comfyui_version;

      if (
        version !== undefined
      ) {
        result.backendVersion =
          version;
      }

      return result;
    }
    catch (error) {
      return {
        adapter: this.kind,
        reachable: false,
        latencyMs: Math.round(
          performance.now() -
            started
        ),
        error: errorText(error)
      };
    }
  }

  async submit(
    workflow:
      Record<string, unknown>
  ) {
    const response =
      await this.client.prompt(
        workflow
      );

    if (!response.prompt_id) {
      throw new Error(
        "Comfy /prompt did not return prompt_id"
      );
    }

    return {
      backendJobId:
        response.prompt_id,

      backendResponse:
        response
    };
  }

  status(
    backendJobId: string
  ) {
    return readComfyExecutionStatus(
      this.client,
      backendJobId
    );
  }

  cancel(
    backendJobId: string
  ) {
    return this.client
      .cancelPrompt(
        backendJobId
      );
  }

  downloadArtifact(
    artifact: {
      filename: string;
      subfolder: string;
      type: string;
    },

    destinationPath:
      string
  ) {
    return this.client
      .downloadArtifact(
        artifact,
        destinationPath
      );
  }

  async queueSummary() {
    const queue =
      await this.client.queue();

    return {
      running:
        queue.queue_running
          ?.length ?? 0,

      pending:
        queue.queue_pending
          ?.length ?? 0
    };
  }

  async readiness():
    Promise<AdapterReadiness> {

    const started =
      performance.now();

    const [
      stats,
      queue,
      capabilities,
      events
    ] =
      await Promise.allSettled([
        this.client.systemStats(),
        this.client.queue(),
        this.client.objectInfo(),
        this.client.statusSocket()
      ]);

    const checks = {
      runtime:
        stats.status ===
        "fulfilled",

      queue:
        queue.status ===
        "fulfilled",

      capabilities:
        capabilities.status ===
        "fulfilled",

      events:
        events.status ===
        "fulfilled"
    };

    const errors = [
      failedCheck(
        "runtime",
        stats
      ),
      failedCheck(
        "queue",
        queue
      ),
      failedCheck(
        "capabilities",
        capabilities
      ),
      failedCheck(
        "events",
        events
      )
    ].filter(
      (
        value
      ): value is string =>
        value !== null
    );

    const result:
      AdapterReadiness = {
        adapter: this.kind,

        transportReady:
          Object.values(
            checks
          ).every(Boolean),

        checks,

        latencyMs:
          Math.round(
            performance.now() -
              started
          ),

        errors
      };

    if (
      stats.status ===
      "fulfilled"
    ) {
      const system =
        stats.value.system;

      const backend:
        NonNullable<
          AdapterReadiness[
            "backend"
          ]
        > = {};

      if (
        system
          ?.comfyui_version !==
        undefined
      ) {
        backend.version =
          system
            .comfyui_version;
      }

      if (
        system
          ?.python_version !==
        undefined
      ) {
        backend.python =
          system
            .python_version;
      }

      if (
        system
          ?.pytorch_version !==
        undefined
      ) {
        backend.runtime =
          system
            .pytorch_version;
      }

      result.backend =
        backend;

      result.device =
        stats.value
          .devices?.[0];

      if (
        typeof system
          ?.ram_total ===
          "number" &&
        typeof system
          ?.ram_free ===
          "number"
      ) {
        result.memory = {
          total:
            system.ram_total,

          free:
            system.ram_free
        };
      }
    }

    if (
      queue.status ===
      "fulfilled"
    ) {
      result.queue = {
        running:
          queue.value
            .queue_running
            ?.length ?? 0,

        pending:
          queue.value
            .queue_pending
            ?.length ?? 0
      };
    }

    if (
      capabilities.status ===
      "fulfilled"
    ) {
      result.capabilityCount =
        Object.keys(
          capabilities.value
        ).length;
    }

    return result;
  }
}
