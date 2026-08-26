import type {
  AdapterExecutionEvent,
  AdapterProgressNode
} from "../../domain/media-adapter.js";

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function readString(
  record: Record<string, unknown> | null,
  key: string
) {
  const value = record?.[key];
  return typeof value === "string"
    ? value
    : null;
}

function readNumber(
  record: Record<string, unknown> | null,
  key: string
) {
  const value = record?.[key];
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function progressNode(
  fallbackNodeId: string,
  value: unknown
): AdapterProgressNode | null {
  const record = asRecord(value);
  if (!record) return null;

  const nodeId =
    readString(record, "node_id") ??
    fallbackNodeId;
  const state =
    readString(record, "state");
  const progressValue =
    readNumber(record, "value");
  const max =
    readNumber(record, "max");

  if (
    !nodeId ||
    !state ||
    progressValue === null ||
    max === null
  ) {
    return null;
  }

  return {
    nodeId,
    displayNodeId:
      readString(record, "display_node_id"),
    realNodeId:
      readString(record, "real_node_id"),
    parentNodeId:
      readString(record, "parent_node_id"),
    state,
    value: progressValue,
    max
  };
}

export function parseComfyExecutionEvent(
  raw: string
): AdapterExecutionEvent | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  }
  catch {
    return null;
  }

  const envelope = asRecord(parsed);
  const type = readString(envelope, "type");
  const data = asRecord(envelope?.data);

  if (!type || !data) {
    return null;
  }

  const backendJobId =
    readString(data, "prompt_id");

  if (!backendJobId) {
    return null;
  }

  switch (type) {
    case "execution_start":
      return {
        kind: "execution_start",
        backendJobId
      };

    case "executing": {
      const nodeValue = data.node;
      const nodeId =
        typeof nodeValue === "string" ||
        typeof nodeValue === "number"
          ? String(nodeValue)
          : null;

      const displayValue =
        data.display_node;
      const displayNodeId =
        typeof displayValue === "string" ||
        typeof displayValue === "number"
          ? String(displayValue)
          : null;

      return {
        kind: "executing",
        backendJobId,
        nodeId,
        displayNodeId
      };
    }

    case "progress": {
      const value = readNumber(data, "value");
      const max = readNumber(data, "max");
      const nodeValue = data.node;

      if (value === null || max === null) {
        return null;
      }

      return {
        kind: "progress",
        backendJobId,
        nodeId:
          typeof nodeValue === "string" ||
          typeof nodeValue === "number"
            ? String(nodeValue)
            : null,
        value,
        max
      };
    }

    case "progress_state": {
      const nodesRecord =
        asRecord(data.nodes);

      if (!nodesRecord) {
        return null;
      }

      const nodes =
        Object.entries(nodesRecord)
          .map(([nodeId, value]) =>
            progressNode(nodeId, value)
          )
          .filter(
            (
              node
            ): node is AdapterProgressNode =>
              node !== null
          );

      return {
        kind: "progress_state",
        backendJobId,
        nodes
      };
    }

    case "execution_success":
      return {
        kind: "execution_success",
        backendJobId
      };

    case "execution_interrupted":
      return {
        kind: "execution_interrupted",
        backendJobId
      };

    case "execution_error":
      return {
        kind: "execution_error",
        backendJobId,
        message:
          readString(
            data,
            "exception_message"
          )
      };

    default:
      return null;
  }
}
