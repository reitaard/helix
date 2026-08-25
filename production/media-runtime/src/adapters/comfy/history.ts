import type {
  AdapterArtifact
} from "../../domain/media-adapter.js";

export interface ComfyHistoryItem {
  promptId: string;
  completedAt: string | null;
  artifacts: AdapterArtifact[];
  workflow: Record<string, unknown> | null;
}

export interface ComfyWorkflowInspection {
  workflow: string;
  prompt: string | null;
  promptConfidence: "known" | "best_effort" | "none";
  details: Array<{
    label: string;
    value: string;
  }>;
}

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function nodeInputs(
  workflow: Record<string, unknown>,
  nodeId: string
) {
  return asRecord(
    asRecord(workflow[nodeId])?.inputs
  );
}

function stringValue(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : null;
}

function numberValue(
  value: unknown
) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function booleanValue(
  value: unknown
) {
  return typeof value === "boolean"
    ? value
    : null;
}

function displayNumber(
  value: number | null
) {
  return value === null
    ? null
    : String(value);
}

function pushDetail(
  details: ComfyWorkflowInspection["details"],
  label: string,
  value: string | null
) {
  if (value !== null && value !== "") {
    details.push({ label, value });
  }
}

function workflowFromRecord(
  record: Record<string, unknown>
) {
  const prompt = record.prompt;

  if (Array.isArray(prompt)) {
    return asRecord(prompt[2]);
  }

  const promptRecord = asRecord(prompt);
  return asRecord(promptRecord?.prompt) ?? promptRecord;
}

function historyTimestamp(
  record: Record<string, unknown>
) {
  const status = asRecord(record.status);
  const messages = status?.messages;

  if (!Array.isArray(messages)) {
    return null;
  }

  let latest: number | null = null;

  for (const message of messages) {
    if (!Array.isArray(message) || message.length < 2) {
      continue;
    }

    const payload = asRecord(message[1]);
    const timestamp = numberValue(payload?.timestamp);

    if (
      timestamp !== null &&
      (latest === null || timestamp > latest)
    ) {
      latest = timestamp;
    }
  }

  if (latest === null) {
    return null;
  }

  const milliseconds =
    latest > 10_000_000_000
      ? latest
      : latest * 1000;

  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}

function collectValue(
  value: unknown,
  nodeId: string,
  artifacts: AdapterArtifact[]
) {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const record = value as Record<string, unknown>;

    if (typeof record.filename === "string") {
      artifacts.push({
        filename: record.filename,
        subfolder:
          typeof record.subfolder === "string"
            ? record.subfolder
            : "",
        type:
          typeof record.type === "string"
            ? record.type
            : "output",
        nodeId
      });
    }

    for (const child of Object.values(record)) {
      collectValue(child, nodeId, artifacts);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      collectValue(child, nodeId, artifacts);
    }
  }
}

export function collectComfyArtifacts(
  outputs: Record<string, unknown> | undefined
) {
  const artifacts: AdapterArtifact[] = [];

  if (!outputs) {
    return artifacts;
  }

  for (const [nodeId, value] of Object.entries(outputs)) {
    collectValue(value, nodeId, artifacts);
  }

  return artifacts;
}

export function parseComfyHistory(
  history: Record<string, unknown>
): ComfyHistoryItem[] {
  const items = Object.entries(history)
    .map(([promptId, value], index) => {
      const record = asRecord(value);
      if (!record) return null;

      const status = asRecord(record.status);
      if (status?.completed !== true) return null;

      const artifacts = collectComfyArtifacts(
        asRecord(record.outputs) ?? undefined
      );

      if (artifacts.length === 0) return null;

      return {
        promptId,
        completedAt: historyTimestamp(record),
        artifacts,
        workflow: workflowFromRecord(record),
        index
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  items.sort((a, b) => {
    const aTime = a.completedAt
      ? new Date(a.completedAt).getTime()
      : 0;
    const bTime = b.completedAt
      ? new Date(b.completedAt).getTime()
      : 0;

    return bTime - aTime || b.index - a.index;
  });

  return items.map(({ index: _index, ...item }) => item);
}

export function inspectComfyWorkflow(
  workflow: Record<string, unknown> | null
): ComfyWorkflowInspection {
  if (!workflow) {
    return {
      workflow: "Comfy workflow",
      prompt: null,
      promptConfidence: "none",
      details: []
    };
  }

  const t2vPrompt = stringValue(
    nodeInputs(workflow, "405:376")?.value
  );

  if (t2vPrompt !== null) {
    const details: ComfyWorkflowInspection["details"] = [];
    const resolution = nodeInputs(workflow, "409");
    const enhance = booleanValue(
      nodeInputs(workflow, "405:383")?.value
    );

    pushDetail(
      details,
      "Aspect",
      stringValue(resolution?.aspect_ratio)
    );
    pushDetail(
      details,
      "Megapixels",
      displayNumber(numberValue(resolution?.megapixels))
    );
    pushDetail(
      details,
      "Duration",
      displayNumber(numberValue(nodeInputs(workflow, "405:362")?.value))
    );
    pushDetail(
      details,
      "Enhance",
      enhance === null ? null : enhance ? "ON" : "OFF"
    );
    pushDetail(
      details,
      "FPS",
      displayNumber(numberValue(nodeInputs(workflow, "405:361")?.value))
    );
    pushDetail(
      details,
      "Stage1",
      displayNumber(numberValue(nodeInputs(workflow, "405:339")?.noise_seed))
    );
    pushDetail(
      details,
      "Stage2",
      displayNumber(numberValue(nodeInputs(workflow, "405:338")?.noise_seed))
    );
    pushDetail(
      details,
      "Negative",
      stringValue(nodeInputs(workflow, "405:373")?.text)
    );
    pushDetail(
      details,
      "Sampler",
      stringValue(nodeInputs(workflow, "405:352")?.sampler_name)
    );
    pushDetail(
      details,
      "Guidance",
      displayNumber(numberValue(nodeInputs(workflow, "405:388")?.video_cfg))
    );

    return {
      workflow: "LTX 2.5 T2V",
      prompt: t2vPrompt,
      promptConfidence: "known",
      details
    };
  }

  const t2iPrompt = stringValue(
    nodeInputs(workflow, "76")?.value
  );

  if (t2iPrompt !== null) {
    const details: ComfyWorkflowInspection["details"] = [];
    const width = numberValue(nodeInputs(workflow, "77:84")?.value);
    const height = numberValue(nodeInputs(workflow, "77:85")?.value);

    if (width !== null && height !== null) {
      pushDetail(details, "Image", `${width}×${height}`);
    }

    pushDetail(
      details,
      "Seed",
      displayNumber(numberValue(nodeInputs(workflow, "77:86")?.noise_seed))
    );

    return {
      workflow: "FLUX.2 Klein 4B Distilled",
      prompt: t2iPrompt,
      promptConfidence: "known",
      details
    };
  }

  const candidates: string[] = [];

  for (const value of Object.values(workflow)) {
    const node = asRecord(value);
    if (node?.class_type !== "PrimitiveStringMultiline") {
      continue;
    }

    const text = stringValue(asRecord(node.inputs)?.value)?.trim();
    if (text) candidates.push(text);
  }

  candidates.sort((a, b) => b.length - a.length);

  return {
    workflow: "Comfy workflow",
    prompt: candidates[0] ?? null,
    promptConfidence:
      candidates.length > 0
        ? "best_effort"
        : "none",
    details: []
  };
}
