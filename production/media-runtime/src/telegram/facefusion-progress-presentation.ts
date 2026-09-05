import { compactError, durationBetween, escapeHtml, title } from "./presentation.js";
import type { ProgressJobView } from "./progress-presentation.js";

function header(job: ProgressJobView) {
  return [`<b>HyperSwap B</b> <b>//</b> Job · <code>#${escapeHtml(job.jobNumber)}</code>`, "└ <code>face.swap</code>"];
}

/** Ten-cell ping-pong indicator. Its frame derives from durable elapsed time. */
export function faceFusionProgressBar(elapsedSeconds: number) {
  const frame = Math.max(0, Math.floor(elapsedSeconds / 5)) % 16;
  const start = frame <= 8 ? frame : 16 - frame;
  return "░".repeat(start) + "██" + "░".repeat(8 - start);
}

function elapsedSeconds(job: ProgressJobView) {
  const start = new Date(job.startedAt ?? job.createdAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000)) : 0;
}

export function faceFusionQueuedProgressHtml(job: ProgressJobView) {
  return [title("QUEUED"), ...header(job), "<i>Waiting for GPU</i>"].join("\n");
}

export function faceFusionRunningProgressHtml(job: ProgressJobView) {
  const seconds = elapsedSeconds(job);
  return [title("PROCESSING"), ...header(job), `<code>Processing  ${faceFusionProgressBar(seconds)}</code>`, `Running · <b><i>${escapeHtml(durationBetween(job.startedAt ?? job.createdAt, job.finishedAt))}</i></b>`].join("\n");
}

export function faceFusionDeliveringProgressHtml(job: ProgressJobView) {
  return [title("COMPLETE"), ...header(job), "<code>Processing  ██████████</code>", "<i>Uploading artifact…</i>"].join("\n");
}

function safeError(value: unknown) {
  return compactError(value)
    .replace(/(?:[A-Za-z]:)?[\\/][^\s]+/g, "[redacted]")
    .replace(/bearer\s+[^\s]+|token\s*[=:]\s*[^\s]+/gi, "[redacted]");
}

export function faceFusionTerminalProgressHtml(job: ProgressJobView) {
  const heading = job.status === "cancelled" ? "CANCELLED" : "FAILED";
  const lines = [title(heading), ...header(job)];
  if (heading === "FAILED") lines.push(`<blockquote>${escapeHtml(safeError(job.error))}</blockquote>`);
  return lines.join("\n");
}
