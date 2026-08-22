import type {
  ComfyClient,
  ComfyQueue
} from "./client.js";

import type {
  AdapterArtifact,
  AdapterExecutionStatus
} from "../../domain/media-adapter.js";

interface ComfyHistoryRecord {
  status?: {
    status_str?: string;
    completed?: boolean;
  };

  outputs?: Record<
    string,
    unknown
  >;
}

function queueContains(
  entries: unknown[] | undefined,
  promptId: string
) {
  return (
    entries ?? []
  ).some(entry => {
    if (!Array.isArray(entry)) {
      return false;
    }

    return entry.some(
      value =>
        value === promptId
    );
  });
}

function collectValue(
  value: unknown,
  nodeId: string,
  artifacts:
    AdapterArtifact[]
) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const record =
      value as
        Record<string, unknown>;

    if (
      typeof record.filename ===
      "string"
    ) {
      artifacts.push({
        filename:
          record.filename,

        subfolder:
          typeof record.subfolder ===
          "string"
            ? record.subfolder
            : "",

        type:
          typeof record.type ===
          "string"
            ? record.type
            : "output",

        nodeId
      });
    }

    for (
      const child of
      Object.values(record)
    ) {
      collectValue(
        child,
        nodeId,
        artifacts
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      collectValue(
        child,
        nodeId,
        artifacts
      );
    }
  }
}

function collectArtifacts(
  outputs:
    Record<string, unknown> |
    undefined
) {
  const artifacts:
    AdapterArtifact[] = [];

  if (!outputs) {
    return artifacts;
  }

  for (
    const [
      nodeId,
      value
    ] of Object.entries(outputs)
  ) {
    collectValue(
      value,
      nodeId,
      artifacts
    );
  }

  return artifacts;
}

export async function
readComfyExecutionStatus(
  client: ComfyClient,
  promptId: string
): Promise<
  AdapterExecutionStatus
> {
  const history =
    await client
      .historyByPrompt(
        promptId
      );

  const record =
    history[promptId] as
      ComfyHistoryRecord |
      undefined;

  if (record) {
    const artifacts =
      collectArtifacts(
        record.outputs
      );

    if (
      record.status
        ?.completed === true
    ) {
      if (
        record.status
          .status_str ===
        "success"
      ) {
        return {
          state:
            "succeeded",

          artifacts
        };
      }

      return {
        state: "failed",

        artifacts,

        error:
          `Comfy execution status: ${
            record.status
              ?.status_str ??
            "unknown"
          }`
      };
    }

    return {
      state: "running",
      artifacts
    };
  }

  const queue:
    ComfyQueue =
      await client.queue();

  if (
    queueContains(
      queue.queue_running,
      promptId
    )
  ) {
    return {
      state: "running",
      artifacts: []
    };
  }

  if (
    queueContains(
      queue.queue_pending,
      promptId
    )
  ) {
    return {
      state: "queued",
      artifacts: []
    };
  }

  return {
    state: "unknown",
    artifacts: []
  };
}
