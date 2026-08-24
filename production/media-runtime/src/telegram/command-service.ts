import type {
  Pool
} from "pg";

import {
  JobRepository
} from "../repositories/job-repository.js";

import {
  DeliveryRepository
} from "../repositories/delivery-repository.js";

import {
  OutboxRepository
} from "../repositories/outbox-repository.js";

import {
  TelegramDebugService
} from "./debug-service.js";

import {
  TelegramCancelService
} from "./cancel-service.js";

import {
  TelegramT2VService
} from "./t2v-service.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  ComfyUpdateChecker
} from "../workers/comfy-update-checker.js";

interface TelegramUpdate {
  update_id: number;

  message?: {
    text?: string;

    chat?: {
      id: number | string;
    };
  };
}

interface TelegramEnvelope<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

function escapeHtml(
  value: string
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function title(
  value: string
) {
  return (
    `<b><i>• <u>${
      escapeHtml(value)
    }</u> •</i></b>`
  );
}

function shortJobId(
  value: string
) {
  const id =
    value.startsWith("job_")
      ? value.slice(4)
      : value;

  return `${id.slice(0, 6)}...`;
}

function formatDuration(
  seconds: number
) {
  const whole =
    Math.max(
      0,
      Math.floor(seconds)
    );

  const hours =
    Math.floor(
      whole / 3600
    );

  const minutes =
    Math.floor(
      (whole % 3600) / 60
    );

  const secs =
    whole % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

function ageFrom(
  value: string | null
) {
  if (!value) {
    return "waiting";
  }

  const milliseconds =
    Date.now() -
    new Date(value).getTime();

  if (
    !Number.isFinite(
      milliseconds
    )
  ) {
    return "unknown";
  }

  return formatDuration(
    milliseconds / 1000
  );
}

function durationBetween(
  startedAt: string | null,
  finishedAt: string | null
) {
  if (!startedAt) {
    return "waiting";
  }

  const start =
    new Date(startedAt)
      .getTime();

  const end =
    finishedAt
      ? new Date(finishedAt)
          .getTime()
      : Date.now();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return "unknown";
  }

  return formatDuration(
    Math.max(
      0,
      end - start
    ) / 1000
  );
}

function formatTimestamp(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone:
        process.env
          .HELIX_TIME_ZONE ??
        "UTC"
    }
  );
}

function timeUntil(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const milliseconds =
    new Date(value).getTime() -
    Date.now();

  if (
    !Number.isFinite(
      milliseconds
    )
  ) {
    return "unknown";
  }

  if (milliseconds <= 0) {
    return "now";
  }

  return formatDuration(
    Math.ceil(
      milliseconds / 1000
    )
  );
}

function displayProvider(
  value: string
) {
  if (!value) {
    return value;
  }

  return (
    value[0]!.toUpperCase() +
    value.slice(1)
  );
}

function displayDeliveryState(
  status: string,
  nextAttemptAt: string | null
) {
  if (status === "delivering") {
    return "sending";
  }

  if (
    status === "failed" &&
    nextAttemptAt
  ) {
    return "retrying";
  }

  return status;
}

function errorMessage(
  value: unknown
) {
  let message =
    "Unknown error";

  if (typeof value === "string") {
    message = value;
  }
  else if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const candidate =
      (value as Record<
        string,
        unknown
      >).message;

    if (
      typeof candidate ===
      "string"
    ) {
      message = candidate;
    }
  }

  const compact =
    message
      .replace(/\s+/g, " ")
      .trim();

  if (compact.length <= 120) {
    return compact;
  }

  return `${compact.slice(0, 117)}...`;
}

function attemptWord(
  count: number
) {
  return count === 1
    ? "attempt"
    : "attempts";
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

  return value as
    Record<string, unknown>;
}

function readString(
  record:
    Record<string, unknown> | null,
  key: string
) {
  const value =
    record?.[key];

  return typeof value === "string"
    ? value
    : null;
}

function readNumber(
  record:
    Record<string, unknown> | null,
  key: string
) {
  const value =
    record?.[key];

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function displayWorkerState(
  value: string
) {
  switch (value) {
    case "cold_ready":
      return "Idle";

    case "ready":
      return "Ready";

    case "busy":
      return "Busy";

    case "offline":
      return "Offline";

    case "starting":
      return "Starting";

    case "degraded":
      return "Degraded";

    default:
      return value;
  }
}

function compactVersion(
  value: string
) {
  return (
    value
      .trim()
      .split(/\s+/)[0] ??
    value
  );
}

function compactGpuName(
  value: string
) {
  return value
    .replace(
      /^cuda:\d+\s*/i,
      ""
    )
    .replace(
      /\s*:\s*cudaMallocAsync.*$/i,
      ""
    )
    .replace(
      /^NVIDIA GeForce\s+/i,
      ""
    )
    .trim();
}

function formatGiB(
  bytes: number
) {
  return (
    bytes /
    1024 /
    1024 /
    1024
  ).toFixed(1);
}

export class TelegramCommandService {
  private running = false;

  private pollAbort:
    AbortController | null =
      null;

  private offset:
    number | undefined;

  constructor(
    private readonly botToken:
      string,
    private readonly chatId:
      string,
    private readonly workerId:
      string,
    private readonly updates:
      ComfyUpdateChecker,
    private readonly db:
      Pool,
    private readonly workers:
      WorkerRegistry,
    private readonly jobs:
      JobRepository,
    private readonly deliveries:
      DeliveryRepository,
    private readonly outbox:
      OutboxRepository,

    private readonly debug:
      TelegramDebugService,

    private readonly cancel:
      TelegramCancelService,

    private readonly t2v:
      TelegramT2VService
  ) {}

  private endpoint(
    method: string
  ) {
    return (
      "https://api.telegram.org/bot" +
      this.botToken +
      "/" +
      method
    );
  }

  private async postJson<T>(
    method: string,
    body: unknown,
    timeoutMs = 30000,
    externalSignal?: AbortSignal
  ): Promise<T> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        timeoutMs
      );

    const abort = () => {
      controller.abort();
    };

    externalSignal
      ?.addEventListener(
        "abort",
        abort,
        { once: true }
      );

    try {
      const response =
        await fetch(
          this.endpoint(method),
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json"
            },
            body:
              JSON.stringify(body),
            signal:
              controller.signal
          }
        );

      const parsed =
        await response.json() as
          TelegramEnvelope<T>;

      if (
        !response.ok ||
        parsed.ok !== true
      ) {
        throw new Error(
          `${method} failed: ` +
          (
            parsed.description ??
            `HTTP ${response.status}`
          )
        );
      }

      return parsed.result as T;
    }
    finally {
      clearTimeout(timeout);

      externalSignal
        ?.removeEventListener(
          "abort",
          abort
        );
    }
  }

  private sendHtml(
    html: string
  ) {
    return this.postJson(
      "sendMessage",
      {
        chat_id:
          this.chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: {
          is_disabled: true
        }
      }
    );
  }

  private async clearCommands() {
    await this.postJson(
      "deleteMyCommands",
      {
        scope: {
          type: "chat",
          chat_id: this.chatId
        }
      }
    );

    await this.postJson(
      "deleteMyCommands",
      {}
    );
  }

  private async discardPending() {
    const updates =
      await this.postJson<
        TelegramUpdate[]
      >(
        "getUpdates",
        {
          offset: -1,
          limit: 1,
          timeout: 0,
          allowed_updates: [
            "message"
          ]
        }
      );

    const latest =
      updates.at(-1);

    if (latest) {
      this.offset =
        latest.update_id + 1;
    }
  }

  private async poll() {
    this.pollAbort =
      new AbortController();

    try {
      return await this.postJson<
        TelegramUpdate[]
      >(
        "getUpdates",
        {
          offset: this.offset,
          limit: 20,
          timeout: 25,
          allowed_updates: [
            "message"
          ]
        },
        35000,
        this.pollAbort.signal
      );
    }
    finally {
      this.pollAbort = null;
    }
  }

  private helpHtml() {
    return (
      `${title("COMMANDS")}\n` +
      `<code>/status</code> <b>-</b> <b>Diagnostics</b>\n` +
      `<code>/queue</code> <b>-</b> <b>Queue check</b>\n` +
      `<code>/jobs</code> <b>-</b> <b>Recent jobs</b>\n` +
      `<code>/job &lt;id&gt;</code> <b>-</b> <b>Job details</b>\n` +
      `<code>/outbox</code> <b>-</b> <b>Send queue</b>\n` +
      `<code>/errors</code> <b>-</b> <b>Recent failures</b>\n` +
      `<code>/events &lt;id&gt;</code> <b>-</b> <b>Job events</b>\n` +
      `<code>/t2v</code> <b>-</b> <b>Generate video</b>\n` +
      `<code>/t2v settings</code> <b>-</b> <b>T2V settings</b>\n` +
      `<code>/cancel &lt;id&gt;</code> <b>-</b> <b>Cancel job</b>`
    );
  }

  private async statusHtml() {
    const databaseCheck =
      (async () => {
        const started =
          performance.now();

        await this.db.query(
          "SELECT 1"
        );

        return Math.round(
          performance.now() -
          started
        );
      })();

    const [
      database,
      readiness,
      update
    ] =
      await Promise.allSettled([
        databaseCheck,
        this.workers
          .readiness(
            this.workerId
          ),
        this.updates.check()
      ]);

    const lines = [
      `<b>Runtime</b> · <b>OK</b> · <i>${
        escapeHtml(
          formatDuration(
            process.uptime()
          )
        )
      }</i>`,

      `<b>Database</b> · ${
        database.status ===
        "fulfilled"
          ? `<b>OK</b> · <i>${database.value} ms</i>`
          : "<b>ERROR</b>"
      }`
    ];

    const system: string[] = [];

    if (
      readiness.status ===
        "fulfilled" &&
      readiness.value
    ) {
      const value =
        readiness.value;

      lines.push(
        `<b>Worker</b> · <b>${
          escapeHtml(value.name)
        }</b>`,

        `<b>State</b> · <code>${
          escapeHtml(
            displayWorkerState(
              value.state
            )
          )
        }</code> · <i>${
          value.latencyMs
        } ms</i>`,

        `<b>Queue</b> · <b>${
          value.queue?.running ?? 0
        }</b> <i>running</i> · <b>${
          value.queue?.pending ?? 0
        }</b> <i>pending</i>`
      );

      if (value.backend?.version) {
        system.push(
          `<b>Comfy</b> · <b>${
            escapeHtml(
              compactVersion(
                value.backend.version
              )
            )
          }</b>`
        );
      }

      if (
        update.status ===
        "fulfilled"
      ) {
        const status =
          update.value;

        let updateHtml =
          "<b>Unavailable</b>";

        if (
          status.state ===
          "current"
        ) {
          updateHtml =
            "<b>Current</b>";
        }
        else if (
          status.state ===
          "available"
        ) {
          const count =
            status.commitsAvailable;

          const noun =
            count === 1
              ? "commit"
              : "commits";

          updateHtml =
            '<b><a href="' +
            'https://github.com/Comfy-Org/ComfyUI/releases' +
            '">Available</a></b> ' +
            `<b><i>(${count} ${noun})</i></b>`;
        }
        else if (
          status.state ===
          "custom"
        ) {
          updateHtml =
            "<b>Custom revision</b>";
        }

        system.push(
          `<b>Update</b> · ${
            updateHtml
          }`
        );
      }
      else {
        system.push(
          "<b>Update</b> · <b>Unavailable</b>"
        );
      }

      if (value.backend?.python) {
        system.push(
          `<b>Python</b> · <b>${
            escapeHtml(
              compactVersion(
                value.backend.python
              )
            )
          }</b>`
        );
      }

      if (value.backend?.runtime) {
        system.push(
          `<b>Torch</b> · <b><i>${
            escapeHtml(
              compactVersion(
                value.backend.runtime
              )
            )
          }</i></b>`
        );
      }

      const device =
        asRecord(value.device);

      const deviceName =
        readString(
          device,
          "name"
        );

      if (deviceName) {
        system.push(
          `<b>GPU</b> · <code>${
            escapeHtml(
              compactGpuName(
                deviceName
              )
            )
          }</code>`
        );
      }

      const total =
        readNumber(
          device,
          "vram_total"
        ) ??
        readNumber(
          device,
          "torch_vram_total"
        );

      const free =
        readNumber(
          device,
          "vram_free"
        ) ??
        readNumber(
          device,
          "torch_vram_free"
        );

      if (
        total !== null &&
        free !== null
      ) {
        system.push(
          `<b>VRAM</b> · <b><i>${
            formatGiB(free)
          }</i></b> / <b><i>${
            formatGiB(total)
          } GB</i></b> <i>free</i>`
        );
      }

      if (value.memory) {
        system.push(
          `<b>RAM</b> · <b><i>${
            formatGiB(
              value.memory.free
            )
          }</i></b> / <b><i>${
            formatGiB(
              value.memory.total
            )
          } GB</i></b> <i>free</i>`
        );
      }

      if (value.errors.length > 0) {
        system.push(
          `<b>Checks</b> · <i>${
            escapeHtml(
              value.errors.join(
                " · "
              )
            )
          }</i>`
        );
      }
    }
    else {
      lines.push(
        `<b>Worker</b> · <b>ERROR</b>`
      );
    }

    if (system.length > 0) {
      lines.push(
        "",
        "<b><i>[System]</i></b>",
        ...system
      );
    }

    return (
      `${title("STATUS")}\n` +
      `<blockquote expandable>${
        lines.join("\n")
      }</blockquote>`
    );
  }

  private async queueHtml() {
    const [
      comfy,
      active
    ] =
      await Promise.allSettled([
        this.workers.queue(
          this.workerId
        ),
        this.jobs.listActive()
      ]);

    const lines: string[] = [];

    if (
      comfy.status ===
        "fulfilled" &&
      comfy.value
    ) {
      lines.push(
        `<b>Comfy</b> · <b>${
          comfy.value.running
        }</b> <i>running</i> · <b>${
          comfy.value.pending
        }</b> <i>pending</i>`
      );
    }
    else {
      lines.push(
        `<b>Comfy</b> · <b>ERROR</b>`
      );
    }

    if (
      active.status ===
      "fulfilled"
    ) {
      lines.push(
        `<b>Helix</b> · <b>${
          active.value.length
        }</b> <i>active</i>`
      );

      if (
        active.value.length === 0
      ) {
        lines.push(
          "<i>Queue is clear.</i>"
        );
      }
      else {
        lines.push("");

        for (
          const job of
          active.value
        ) {
          const since =
            job.startedAt ??
            job.createdAt;

          lines.push(
            `<code>${
              escapeHtml(
                shortJobId(job.id)
              )
            }</code> · ` +
            `<b>[${
              escapeHtml(job.status)
            }]</b> · ` +
            `<i>${
              escapeHtml(
                ageFrom(since)
              )
            }</i>`
          );
        }
      }
    }
    else {
      lines.push(
        `<b>Helix</b> · <b>ERROR</b>`
      );
    }

    return (
      `${title("QUEUE")}\n` +
      lines.join("\n")
    );
  }

  private async jobsHtml() {
    const jobs =
      await this.jobs
        .listRecent(5);

    if (jobs.length === 0) {
      return (
        `${title("JOBS")}\n` +
        `<i>No jobs yet.</i>`
      );
    }

    const lines =
      jobs.map(
        job => {
          const runtime =
            durationBetween(
              job.startedAt,
              job.finishedAt
            );

          return (
            `<b>ID:</b> <code>${
              escapeHtml(job.id)
            }</code> · ` +
            `<b>[${
              escapeHtml(job.status)
            }]</b> · ` +
            `<i>${
              escapeHtml(runtime)
            }</i>`
          );
        }
      );

    return (
      `${title("JOBS")}\n` +
      lines.join("\n")
    );
  }

  private async jobHtml(
    reference: string
  ) {
    let clean =
      reference
        .trim()
        .replace(
          /\.+$/,
          ""
        );

    if (
      clean.startsWith("job_")
    ) {
      clean = clean.slice(4);
    }

    if (
      clean.length < 4 ||
      !/^[a-zA-Z0-9_-]+$/
        .test(clean)
    ) {
      return (
        `${title("JOB")}\n` +
        `<b>Usage</b> · ` +
        `<code>/job &lt;id&gt;</code>`
      );
    }

    const matches =
      await this.jobs
        .findByPrefix(
          `job_${clean}`
        );

    if (matches.length === 0) {
      return (
        `${title("JOB")}\n` +
        `<i>Job not found.</i>`
      );
    }

    if (matches.length > 1) {
      return (
        `${title("JOB")}\n` +
        `<i>Prefix is ambiguous. Use more characters.</i>`
      );
    }

    const job = matches[0]!;

    const worker =
      job.workerId
        ? this.workers.get(
            job.workerId
          )
        : null;

    const workerName =
      worker?.name ??
      job.workerId ??
      "Unassigned";

    const runtime =
      durationBetween(
        job.startedAt,
        job.finishedAt
      );

    const deliveryRows =
      await this.deliveries
        .listForJob(job.id);

    const lines = [
      `<b>ID</b> · <code>${
        escapeHtml(
          shortJobId(job.id)
        )
      }</code>`,
      `<b>Status</b> · <b>${
        escapeHtml(job.status)
      }</b>`,
      `<b>Worker</b> · <b>${
        escapeHtml(workerName)
      }</b>`,
      `<b>Tool</b> · <code>${
        escapeHtml(job.tool)
      }</code>`,
      `<b>Runtime</b> · <i>${
        escapeHtml(runtime)
      }</i>`,
      `<b>Started</b> · <i>${
        escapeHtml(
          formatTimestamp(
            job.startedAt
          )
        )
      }</i>`,
      `<b>Finished</b> · <i>${
        escapeHtml(
          formatTimestamp(
            job.finishedAt
          )
        )
      }</i>`
    ];

    lines.push(
      "",
      "<b><i>[Outbox]</i></b>"
    );

    if (deliveryRows.length === 0) {
      lines.push(
        "<i>None</i>"
      );
    }
    else {
      for (
        const delivery of
        deliveryRows
      ) {
        const state =
          displayDeliveryState(
            delivery.status,
            delivery.nextAttemptAt
          );

        const provider =
          displayProvider(
            delivery.provider
          );

        const prefix =
          deliveryRows.length === 1
            ? `<b>${escapeHtml(provider)}</b>`
            : `<b>${escapeHtml(provider)} #${
                delivery.artifactIndex + 1
              }</b>`;

        lines.push(
          `${prefix} · <b>${
            escapeHtml(state)
          }</b>`,
          `<b>Attempts</b> · <b>${
            delivery.attemptCount
          }</b>`
        );

        if (state === "retrying") {
          lines.push(
            `<b>Retry</b> · <i>${
              escapeHtml(
                timeUntil(
                  delivery.nextAttemptAt
                )
              )
            }</i>`
          );
        }
        else if (state === "failed") {
          lines.push(
            `<b>Error</b> · <i>${
              escapeHtml(
                errorMessage(
                  delivery.error
                )
              )
            }</i>`
          );
        }
      }
    }

    return (
      `${title("JOB")}\n` +
      lines.join("\n")
    );
  }

  private async outboxHtml() {
    const snapshot =
      await this.outbox
        .snapshot(
          "telegram",
          5
        );

    const lines = [
      `<b>Pending</b> · <b>${
        snapshot.pending
      }</b>`,
      `<b>Sending</b> · <b>${
        snapshot.sending
      }</b>`,
      `<b>Retrying</b> · <b>${
        snapshot.retrying
      }</b>`,
      `<b>Failed</b> · <b>${
        snapshot.failed
      }</b>`
    ];

    if (snapshot.total === 0) {
      lines.push(
        "<i>Outbox is clear.</i>"
      );
    }
    else {
      lines.push("");

      for (
        const item of
        snapshot.items
      ) {
        const provider =
          displayProvider(
            item.provider
          );

        let line =
          `<code>${
            escapeHtml(
              shortJobId(
                item.jobId
              )
            )
          }</code> · ` +
          `<b>${
            escapeHtml(provider)
          }</b> · ` +
          `<b>${
            escapeHtml(item.state)
          }</b>`;

        if (item.attemptCount > 0) {
          line +=
            ` · <b>${
              item.attemptCount
            }</b> <i>${
              attemptWord(
                item.attemptCount
              )
            }</i>`;
        }

        lines.push(line);

        if (item.state === "retrying") {
          lines.push(
            `<b>Retry</b> · <i>${
              escapeHtml(
                timeUntil(
                  item.nextAttemptAt
                )
              )
            }</i>`
          );
        }
        else if (item.state === "failed") {
          lines.push(
            `<b>Error</b> · <i>${
              escapeHtml(
                errorMessage(
                  item.error
                )
              )
            }</i>`
          );
        }
      }

      if (snapshot.hiddenCount > 0) {
        lines.push(
          "",
          `<i>+${
            snapshot.hiddenCount
          } more</i>`
        );
      }
    }

    return (
      `${title("OUTBOX")}\n` +
      lines.join("\n")
    );
  }

  private async handleUpdate(
    update: TelegramUpdate
  ) {
    const message =
      update.message;

    if (
      !message?.text ||
      !message.chat
    ) {
      return;
    }

    if (
      String(message.chat.id) !==
      this.chatId
    ) {
      return;
    }

    const text =
      message.text.trim();

    try {
      if (!text.startsWith("/")) {
        if (
          await this.cancel
            .hasPending()
        ) {
          const response =
            await this.cancel
              .handlePlainText(
                text
              );

          if (response) {
            await this.sendHtml(
              response
            );
          }

          return;
        }

        if (
          await this.t2v
            .hasPending()
        ) {
          const response =
            await this.t2v
              .handlePlainText(
                text
              );

          if (response) {
            await this.sendHtml(
              response
            );
          }

          return;
        }

        const answer =
          text
            .trim()
            .toLowerCase();

        if (
          answer === "yes" ||
          answer === "no"
        ) {
          await this.sendHtml(
            `${title("CONFIRM")}\n` +
            `<b><i>No confirmation is pending.</i></b>`
          );
        }

        return;
      }

      await this.cancel
        .abandonPendingForCommand();

      await this.t2v
        .abandonPendingForCommand();

      const parts =
        text.split(/\s+/);

      const rawCommand =
        parts[0]
          ?.toLowerCase() ??
        "";

      const command =
        rawCommand
          .split("@")[0];

      const args =
        parts.slice(1);

      switch (command) {
        case "/st":
        case "/stat":
        case "/status":
          await this.sendHtml(
            await this.statusHtml()
          );
          break;

        case "/qu":
        case "/que":
        case "/queue":
          await this.sendHtml(
            await this.queueHtml()
          );
          break;

        case "/jbs":
        case "/jobs":
          await this.sendHtml(
            await this.jobsHtml()
          );
          break;

        case "/jb":
        case "/job":
          await this.sendHtml(
            await this.jobHtml(
              args[0] ?? ""
            )
          );
          break;

        case "/ob":
        case "/outbox":
          await this.sendHtml(
            await this.outboxHtml()
          );
          break;

        case "/err":
        case "/errors":
          await this.sendHtml(
            await this.debug
              .errorsHtml()
          );
          break;

        case "/ev":
        case "/events":
          await this.sendHtml(
            await this.debug
              .eventsHtml(
                args[0] ?? ""
              )
          );
          break;

        case "/t2v":
          await this.sendHtml(
            await this.t2v
              .handleCommand(
                args
              )
          );
          break;

        case "/cc":
        case "/cancel":
          await this.sendHtml(
            await this.cancel
              .begin(
                args[0] ?? ""
              )
          );
          break;

        case "/h":
        case "/help":
        default:
          await this.sendHtml(
            this.helpHtml()
          );
          break;
      }
    }
    catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : String(error);

      await this.sendHtml(
        `<code>HELIX • ERROR</code>\n` +
        `<blockquote>${
          escapeHtml(detail)
        }</blockquote>`
      );
    }
  }

  private async run() {
    try {
      await this.clearCommands();
      await this.discardPending();

      console.log(
        "[telegram] command service ready"
      );
    }
    catch (error) {
      console.error(
        "[telegram] command setup failed",
        error
      );
    }

    while (this.running) {
      try {
        const updates =
          await this.poll();

        for (const update of updates) {
          this.offset =
            update.update_id + 1;

          await this.handleUpdate(
            update
          );
        }
      }
      catch (error) {
        if (!this.running) {
          break;
        }

        console.error(
          "[telegram] command poll failed",
          error
        );

        await new Promise(
          resolve => {
            setTimeout(
              resolve,
              3000
            );
          }
        );
      }
    }
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.run();
  }

  stop() {
    this.running = false;
    this.pollAbort?.abort();
    this.pollAbort = null;
  }
}
