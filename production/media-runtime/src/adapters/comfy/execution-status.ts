import type {
  ComfyClient,
  ComfyQueue
} from "./client.js";

import {
  collectComfyArtifacts
} from "./history.js";

import type {
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
      collectComfyArtifacts(
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
