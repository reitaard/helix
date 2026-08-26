import {
  compactError,
  durationBetween,
  escapeHtml,
  formatDuration,
  title
} from "./presentation.js";

export interface ProgressJobView {
  jobNumber: string;
  tool?: string;
  status: string;
  request: unknown;
  error: unknown | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ProgressSnapshot {
  workflowPercent: number | null;
  nodePercent: number | null;
  stage: string | null;
}

export interface WorkflowProgressNode {
  nodeId: string;
  displayNodeId: string | null;
  state: string;
}

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

function clip(
  value: string,
  limit = 28
) {
  const compact =
    value
      .replace(/\s+/g, " ")
      .trim();

  return compact.length <= limit
    ? compact
    : `${compact.slice(0, limit - 3)}...`;
}

function workflowRecord(
  request: unknown
) {
  const requestRecord = asRecord(request);
  return asRecord(requestRecord?.workflow);
}

export function workflowNodeCount(
  request: unknown
) {
  return Object.keys(
    workflowRecord(request) ?? {}
  ).length;
}

export function workflowProgressPercent(
  request: unknown,
  nodes: WorkflowProgressNode[]
) {
  const workflow = workflowRecord(request);

  if (!workflow) {
    return null;
  }

  const submitted =
    new Set(Object.keys(workflow));

  if (submitted.size === 0) {
    return null;
  }

  const finished =
    new Set<string>();

  for (const node of nodes) {
    if (node.state !== "finished") {
      continue;
    }

    if (submitted.has(node.nodeId)) {
      finished.add(node.nodeId);
      continue;
    }

    if (
      node.displayNodeId &&
      submitted.has(node.displayNodeId)
    ) {
      finished.add(node.displayNodeId);
    }
  }

  return (
    finished.size /
    submitted.size *
    100
  );
}

export function nodeStageLabel(
  request: unknown,
  nodeId: string | null,
  displayNodeId: string | null = null
) {
  const workflow = workflowRecord(request);

  const node =
    asRecord(
      (
        nodeId
          ? workflow?.[nodeId]
          : null
      ) ??
      (
        displayNodeId
          ? workflow?.[displayNodeId]
          : null
      )
    );

  const meta =
    asRecord(node?._meta);

  const titleValue =
    typeof meta?.title === "string"
      ? meta.title
      : null;

  const classType =
    typeof node?.class_type === "string"
      ? node.class_type
      : null;

  const candidate =
    titleValue ??
    classType ??
    "Processing";

  if (/sampler/i.test(candidate)) {
    return "Sampling";
  }

  if (
    /vae.*decode|decode.*vae/i.test(
      candidate
    )
  ) {
    return "VAE Decode";
  }

  if (
    /save|combine|mux|export/i.test(
      candidate
    )
  ) {
    return "Finalizing";
  }

  if (/load|loader/i.test(candidate)) {
    return "Loading";
  }

  return clip(candidate);
}

export function clampPercent(
  value: number
) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value)
    )
  );
}

export function progressBar(
  percent: number
) {
  const safe = clampPercent(percent);
  const filled = Math.max(
    0,
    Math.min(
      10,
      Math.round(safe / 10)
    )
  );

  return (
    "█".repeat(filled) +
    "░".repeat(10 - filled)
  );
}

function elapsed(
  job: ProgressJobView
) {
  return durationBetween(
    job.startedAt ?? job.createdAt,
    job.finishedAt
  );
}

function lifecycleHeader(
  job: ProgressJobView,
  workerName: string
) {
  return [
    `<b>${escapeHtml(workerName)}</b> <b>//</b> Job · <code>${escapeHtml(job.jobNumber)}</code>`,
    `└ <code>${escapeHtml(job.tool ?? "generation")}</code>`
  ];
}

export function queuedProgressHtml(
  job: ProgressJobView,
  workerName: string
) {
  return [
    title("QUEUED"),
    ...lifecycleHeader(job, workerName),
    `<i>Waiting for GPU</i>`
  ].join("\n");
}

export function runningProgressHtml(
  job: ProgressJobView,
  workerName: string,
  snapshot: ProgressSnapshot
) {
  const workflowPercent =
    clampPercent(
      snapshot.workflowPercent ?? 0
    );

  const lines = [
    title("GENERATING"),
    ...lifecycleHeader(job, workerName),
    `<code>Workflow  ${progressBar(workflowPercent)}  ${workflowPercent}%</code>`
  ];

  if (snapshot.nodePercent !== null) {
    const nodePercent =
      clampPercent(snapshot.nodePercent);
    lines.push(
      `<code>Sampling  ${progressBar(nodePercent)}  ${nodePercent}%</code>`
    );
  }

  lines.push(
    `${escapeHtml(clip(snapshot.stage ?? "Processing"))} · <b><i>Running (${escapeHtml(elapsed(job))})</i></b>`
  );

  return lines.join("\n");
}

export function deliveringProgressHtml(
  job: ProgressJobView,
  workerName: string
) {
  return [
    title("COMPLETE"),
    ...lifecycleHeader(job, workerName),
    `<code>Workflow  ${progressBar(100)}  100%</code>`,
    `<i>Uploading artifact…</i>`
  ].join("\n");
}

export function deliveryRetryProgressHtml(
  job: ProgressJobView,
  workerName: string,
  attemptCount: number,
  retryAfterSeconds: number
) {
  return [
    title("COMPLETE"),
    ...lifecycleHeader(job, workerName),
    `<code>Workflow  ${progressBar(100)}  100%</code>`,
    `<b>Artifact delivery retrying</b> · <i>attempt ${Math.max(1, attemptCount)}</i>`,
    `<b>Retry</b> · <i>${escapeHtml(formatDuration(Math.max(0, retryAfterSeconds)))}</i>`
  ].join("\n");
}

export function deliveryFailedProgressHtml(
  job: ProgressJobView,
  workerName: string,
  message: string
) {
  return [
    title("DELIVERY FAILED"),
    ...lifecycleHeader(job, workerName),
    `<i>Generation completed, but automatic artifact delivery failed.</i>`,
    `<blockquote>${escapeHtml(compactError(message))}</blockquote>`,
    `<b>Get</b> · <code>/dl g ${escapeHtml(job.jobNumber)}</code>`
  ].join("\n");
}

export function terminalProgressHtml(
  job: ProgressJobView,
  workerName: string
) {
  const heading =
    job.status === "cancelled"
      ? "CANCELLED"
      : job.status === "timed_out"
        ? "TIMED OUT"
        : "FAILED";

  const lines = [
    title(heading),
    ...lifecycleHeader(job, workerName)
  ];

  if (job.status === "failed") {
    lines.push(
      `<blockquote>${escapeHtml(compactError(job.error))}</blockquote>`
    );
  }

  return lines.join("\n");
}
