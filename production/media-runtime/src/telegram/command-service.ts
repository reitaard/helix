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
  TelegramDownloadsService
} from "./downloads-service.js";

import {
  TelegramCancelService
} from "./cancel-service.js";

import {
  renderJobGeneration
} from "./job-generation-presentation.js";

import {
  resolveJobReference
} from "./job-reference.js";

import {
  TelegramT2VService
} from "./t2v-service.js";

import {
  TelegramT2IService
} from "./t2i-service.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  classifyTelegramRoute,
  commandForBot,
  isDirectT2IPrompt
} from "./context.js";

import type {
  TelegramDestination,
  TelegramForumConfig
} from "./context.js";

import {
  TelegramPollOffsetRepository
} from "../repositories/telegram-poll-offset-repository.js";

import {
  ComfyUpdateChecker
} from "../workers/comfy-update-checker.js";

const JOBS_PAGE_SIZE = 20;

interface TelegramCallbackMessage {
  message_id?: number | string;
  message_thread_id?: number | string;
  is_topic_message?: boolean;
  chat?: { id: number | string; type?: string };
}

interface TelegramUpdate {
  update_id: number;

  callback_query?: {
    id?: string;
    data?: string;
    from?: { id: number | string };
    message?: TelegramCallbackMessage;
  };

  message?: {
    text?: string;
    message_id?: number | string;
    message_thread_id?: number | string;
    is_topic_message?: boolean;
    reply_to_message?: {
      message_id?: number | string;
      text?: string;
      from?: { id: number | string };
    };
    from?: { id: number | string };
    chat?: {
      id: number | string;
      type?: string;
    };
  };
}

interface TelegramEnvelope<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

function parsePage(
  value: string | undefined
) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const page = Number(value);

  return (
    Number.isSafeInteger(page) &&
    page >= 1
  )
    ? page
    : null;
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
    `<b>[ ${escapeHtml(
      value
    )} ]</b>`
  );
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

function jobRuntime(
  status: string,
  startedAt: string | null,
  finishedAt: string | null
) {
  if (
    startedAt === null &&
    ["failed", "cancelled", "timed_out"].includes(status)
  ) {
    return "not started";
  }

  return durationBetween(startedAt, finishedAt);
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

  private bot: { id: string; username: string } | null = null;

  private replyDestination: TelegramDestination | null = null;

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

    private readonly downloads:
      TelegramDownloadsService,

    private readonly cancel:
      TelegramCancelService,

    private readonly t2v:
      TelegramT2VService,

    private readonly t2i:
      TelegramT2IService,

    private readonly forum: TelegramForumConfig | null = null,
    private readonly pollOffsets: TelegramPollOffsetRepository | null = null
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
    html: string,
    destination: TelegramDestination = this.replyDestination ?? { chatId: this.chatId, threadId: null },
    replyTo?: string,
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>
  ) {
    return this.postJson(
      "sendMessage",
      {
        chat_id: destination.chatId,
        ...(destination.threadId ? { message_thread_id: destination.threadId } : {}),
        text: html,
        parse_mode: "HTML",
        link_preview_options: {
          is_disabled: true
        },
        ...(replyTo ? {
          reply_parameters: { message_id: replyTo }
        } : {}),
        ...(inlineKeyboard ? {
          reply_markup: { inline_keyboard: inlineKeyboard }
        } : {})
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

  private async initializeOffset() {
    if (!this.bot) throw new Error("Telegram bot identity is not initialized");
    const stored = await this.pollOffsets?.get(this.bot.id);
    if (stored !== undefined && stored !== null) {
      this.offset = stored;
      return;
    }

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
            "message",
            "callback_query"
          ]
        }
      );

    const latest =
      updates.at(-1);

    this.offset = latest ? latest.update_id + 1 : 0;
    await this.pollOffsets?.save(this.bot.id, this.offset);
  }

  private async resolveBotIdentity() {
    const me = await this.postJson<{ id?: number | string; username?: string }>("getMe", {});
    if ((typeof me.id !== "number" && typeof me.id !== "string") || !me.username) {
      throw new Error("Telegram getMe did not return a bot ID and username");
    }
    this.bot = { id: String(me.id), username: me.username };
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
            "message",
            "callback_query"
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
      `<code>/j</code> <b>-</b> <b>Recent jobs</b>\n` +
      `<code>/job &lt;number&gt;</code> <b>-</b> <b>Job details</b>\n` +
      `<code>/downloads</code> <b>-</b> <b>Recent GPU artifacts</b>\n` +
      `<code>/outbox</code> <b>-</b> <b>Send queue</b>\n` +
      `<code>/errors</code> <b>-</b> <b>Recent failures</b>\n` +
      `<code>/events &lt;number&gt;</code> <b>-</b> <b>Job events</b>\n` +
      `<code>/t2v</code> <b>-</b> <b>Generate video</b>\n` +
      `<code>/t2v settings</code> <b>-</b> <b>T2V settings</b>\n` +
      `<code>/t2i</code> <b>-</b> <b>Generate image</b>\n` +
      `<code>/t2i settings</code> <b>-</b> <b>T2I settings</b>\n` +
      `<code>/cancel &lt;number&gt;</code> <b>-</b> <b>Cancel job</b>`
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

        `<b>State</b> · ${
          escapeHtml(
            displayWorkerState(
              value.state
            )
          )
        } · <i>${
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
          `<b>GPU</b> · ${
            escapeHtml(
              compactGpuName(
                deviceName
              )
            )
          }`
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

    const profiles = this.workers.listProfiles(this.workerId) ?? [];
    if (profiles.length > 0) {
      lines.push(
        "",
        "<b><i>• Production •</i></b>",
        ...profiles.flatMap(profile => [
          `<b>${escapeHtml(profile.displayName)}</b>`,
          ...profile.capabilities.map(
            capability =>
              `└ <b><i>${escapeHtml(capability)}</i></b>`
          )
        ])
      );
    }

    if (system.length > 0) {
      lines.push(
        "",
        "<b><i>• System •</i></b>",
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
        const blocks =
          active.value.map(
            job => {
              const since =
                job.startedAt ??
                job.createdAt;

              return (
                `<blockquote>` +
                `<code>${
                  escapeHtml(
                    job.jobNumber
                  )
                }</code> · ` +
                `<b>[${escapeHtml(job.status)}]</b>\n` +
                `<code>${escapeHtml(job.tool)}</code> · ` +
                `<b>${escapeHtml(this.workers.profileDisplayName(job.workerId, job.profileId))}</b> · ` +
                `<i>${escapeHtml(ageFrom(since))}</i>` +
                `</blockquote>`
              );
            }
          );

        lines.push(
          blocks.join("\n")
        );
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

  private async jobsHtml(
    page = 1
  ) {
    const total =
      await this.jobs.count();

    if (total === 0) {
      return (
        `${title("JOBS")}\n` +
        `<i>No jobs yet.</i>`
      );
    }

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total / JOBS_PAGE_SIZE
        )
      );

    if (page > totalPages) {
      return (
        `${title("JOBS")}\n` +
        `<i>Page not found.</i>\n` +
        `<b>Available</b> · <code>1-${totalPages}</code>`
      );
    }

    const jobs =
      await this.jobs.listRecent(
        JOBS_PAGE_SIZE,
        (page - 1) *
          JOBS_PAGE_SIZE
      );

    const blocks =
      jobs.map(
        job => {
          const runtime =
            jobRuntime(
              job.status,
              job.startedAt,
              job.finishedAt
            );

          const finished =
            job.finishedAt
              ? formatTimestamp(job.finishedAt)
                  .replace(",", " ·")
              : null;

          return (
            `<blockquote>` +
            `<code>${escapeHtml(job.jobNumber)}</code> · ` +
            `<b>[${escapeHtml(job.status)}]</b>` +
            (finished
              ? ` <b><i>(${escapeHtml(finished)})</i></b>`
              : "") +
            `\n` +
            `<code>${escapeHtml(job.tool)}</code> · ` +
            `<b>${escapeHtml(this.workers.profileDisplayName(job.workerId, job.profileId))}</b> · ` +
            `<i>${escapeHtml(runtime)}</i>` +
            `</blockquote>`
          );
        }
      );

    const footer = [
      `<b>Page</b> · <b>${page}/${totalPages}</b> · <b>${jobs.length}</b> <i>shown</i>`,
      `<i>Inspect</i> · <code>/jb &lt;number&gt;</code>`
    ];
    const navigation: string[] = [];

    if (page > 1) {
      navigation.push(
        `<i>Prev</i> · <code>/j p ${page - 1}</code>`
      );
    }

    if (page < totalPages) {
      navigation.push(
        `<i>Next</i> · <code>/j p ${page + 1}</code>`
      );
    }

    if (navigation.length > 0) {
      footer.push(
        navigation.join(" · ")
      );
    }

    return (
      `${title("JOBS")}\n` +
      blocks.join("\n") +
      `\n${footer.join("\n")}`
    );
  }

  private jobsUsageHtml() {
    return (
      `${title("JOBS")}\n` +
      `<b>List</b> · <code>/j</code>\n` +
      `<b>Page</b> · <code>/j p &lt;page&gt;</code>\n` +
      `<b>Inspect</b> · <code>/jb &lt;number&gt;</code>`
    );
  }

  private async handleJobs(
    args: string[]
  ) {
    if (args.length === 0) {
      return this.jobsHtml(1);
    }

    const action =
      args[0]?.toLowerCase();

    if (
      action !== "p" &&
      action !== "page"
    ) {
      return this.jobsUsageHtml();
    }

    if (args.length !== 2) {
      return this.jobsUsageHtml();
    }

    const page = parsePage(args[1]);

    if (page === null) {
      return (
        `${title("JOBS")}\n` +
        `<i>Page must be a positive integer.</i>\n` +
        `<i>Use</i> · <code>/j p &lt;page&gt;</code>`
      );
    }

    return this.jobsHtml(page);
  }

  private async jobHtml(
    reference: string
  ) {
    const resolved =
      await resolveJobReference(
        this.jobs,
        reference
      );

    if (resolved.kind === "invalid") {
      return (
        `${title("JOB")}\n` +
        `<b>Usage</b> · ` +
        `<code>/job &lt;number&gt;</code>`
      );
    }

    if (resolved.kind === "not_found") {
      return (
        `${title("JOB")}\n` +
        `<i>Job not found.</i>`
      );
    }

    if (resolved.kind === "ambiguous") {
      return (
        `${title("JOB")}\n` +
        `<i>Prefix is ambiguous. Use more characters.</i>`
      );
    }

    const job = resolved.job;

    const workerName =
      this.workers.profileDisplayName(
        job.workerId,
        job.profileId
      );

    const runtime =
      jobRuntime(
        job.status,
        job.startedAt,
        job.finishedAt
      );

    const deliveryRows =
      await this.deliveries
        .listForJob(job.id);

    const lines = [
      `<b>Job</b> · <code>${
        escapeHtml(
          job.jobNumber
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

    const details =
      `<blockquote>${
        lines.join("\n")
      }</blockquote>`;

    lines.length = 0;
    lines.push(details);

    const generation =
      renderJobGeneration(
        job.request,
        job.backendJobId,
        job.result
      );

    if (generation) {
      lines.push(generation);
    }

    lines.push(
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

        const job = await this.jobs.get(item.jobId);
        const context = job
          ? `\n<code>${escapeHtml(job.tool)}</code> · <b>${escapeHtml(this.workers.profileDisplayName(job.workerId, job.profileId))}</b>`
          : "";

        let line =
          `<code>${
            escapeHtml(
              job?.jobNumber ??
              item.jobId
            )
          }</code> · ` +
          `<b>${
            escapeHtml(provider)
          }</b> · ` +
          `<b>${
            escapeHtml(item.state)
          }</b>` + context;

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

  private async answerCallbackQuery(
    callbackQueryId: string,
    text?: string
  ) {
    await this.postJson("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {})
    });
  }

  private async clearInlineKeyboard(
    chatId: string,
    messageId: string
  ) {
    await this.postJson("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] }
    });
  }

  private async editCallbackHtml(
    chatId: string,
    messageId: string,
    html: string
  ) {
    await this.postJson("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [] }
    });
  }

  private async handleCallbackQuery(
    update: TelegramUpdate
  ) {
    const callback = update.callback_query;
    const message = callback?.message;
    const callbackId = callback?.id;
    const data = callback?.data;

    if (!callbackId || !data || !message?.chat || !message.message_id || !callback?.from || !this.bot) {
      return;
    }

    const match = /^helix:(t2i|t2v):(generate|reset|cancel)$/.exec(data);
    if (!match) {
      await this.answerCallbackQuery(callbackId, "Action unavailable.");
      return;
    }

    const route = classifyTelegramRoute(message, this.chatId, this.forum);
    const tool = match[1];
    const action = match[2];
    const routeMatches =
      (tool === "t2i" && route.kind === "forum_image") ||
      (tool === "t2v" && route.kind === "forum_video");

    if (!routeMatches) {
      await this.answerCallbackQuery(callbackId, "Action unavailable.");
      return;
    }

    const chatId = String(message.chat.id);
    const threadId = message.message_thread_id === undefined ? null : String(message.message_thread_id);
    const messageId = String(message.message_id);
    const key = {
      chatId,
      threadId: threadId ?? "0",
      userId: String(callback.from.id)
    };
    const service = tool === "t2i" ? this.t2i : this.t2v;
    const accepted = await service.acceptsGroupCallback(
      key,
      messageId,
      action as "generate" | "reset" | "cancel"
    );

    if (!accepted) {
      await this.answerCallbackQuery(callbackId, "This action expired or belongs to another user.");
      return;
    }

    await this.answerCallbackQuery(callbackId);
    await this.clearInlineKeyboard(chatId, messageId);

    const context = {
      botId: this.bot.id,
      botUsername: this.bot.username,
      updateId: update.update_id,
      chatId,
      threadId,
      userId: key.userId,
      messageId
    };
    const response = await service.handlePlainText(
      action === "cancel" ? "no" : "yes",
      key,
      context
    );

    if (response) {
      await this.editCallbackHtml(chatId, messageId, response);
    }
  }

  private async handleUpdate(
    update: TelegramUpdate
  ) {
    if (update.callback_query) {
      try {
        await this.handleCallbackQuery(update);
      }
      catch (error) {
        console.error("[telegram] callback query failed", error);
        const callbackId = update.callback_query.id;
        if (callbackId) {
          try {
            await this.answerCallbackQuery(callbackId, "Unable to process this action.");
          }
          catch {
            // The callback may already have been answered.
          }
        }
      }
      return;
    }

    const message =
      update.message;

    if (!message?.text || !message.chat || !message.from || !message.message_id || !this.bot) return;

    const route = classifyTelegramRoute(message, this.chatId, this.forum);
    if (route.kind === "ignored") return;

    const context = {
      botId: this.bot.id,
      botUsername: this.bot.username,
      updateId: update.update_id,
      chatId: String(message.chat.id),
      threadId: message.message_thread_id === undefined ? null : String(message.message_thread_id),
      userId: String(message.from.id),
      messageId: String(message.message_id)
    };
    this.replyDestination = { chatId: context.chatId, threadId: context.threadId };
    const text = message.text.trim();

    try {
      if (route.kind === "forum_image" && !text.startsWith("/")) {
        const key = { chatId: context.chatId, threadId: context.threadId ?? "0", userId: context.userId };
        const repliedMessage = message.reply_to_message;
        const replyTo = repliedMessage?.message_id === undefined ? null : String(repliedMessage.message_id);
        const repliesToPromptCard =
          String(repliedMessage?.from?.id ?? "") === this.bot.id &&
          repliedMessage?.text?.includes("Send the generation prompt.") === true;
        const accepted = await this.t2i.acceptsGroupReply(key, replyTo, repliesToPromptCard);
        console.info("[telegram] T2I prompt capture", {
          updateId: update.update_id,
          chatId: context.chatId,
          threadId: context.threadId,
          userId: context.userId,
          replyTo,
          repliesToPromptCard,
          accepted
        });
        if (!accepted) return;
        const response = await this.t2i.handlePlainText(text, key, context);
        if (response) {
          const sent = await this.sendHtml(response, undefined, context.messageId) as { message_id?: number | string };
          if (sent.message_id !== undefined) await this.t2i.setExpectedReply(key, String(sent.message_id));
        }
        return;
      }
      if (route.kind === "forum_video" && !text.startsWith("/")) {
        const key = { chatId: context.chatId, threadId: context.threadId ?? "0", userId: context.userId };
        const replyTo = message.reply_to_message?.message_id === undefined ? null : String(message.reply_to_message.message_id);
        if (!await this.t2v.acceptsGroupReply(key, replyTo)) return;
        const response = await this.t2v.handlePlainText(text, key, context);
        if (response) {
          const sent = await this.sendHtml(response, undefined, context.messageId) as { message_id?: number | string };
          if (sent.message_id !== undefined) await this.t2v.setExpectedReply(key, String(sent.message_id));
        }
        return;
      }
      if (!text.startsWith("/")) {
        const pending = await Promise.all([
          this.cancel.hasPending(),
          this.t2v.hasPending(),
          this.t2i.hasPending()
        ]);
        const owners = pending.filter(Boolean).length;

        if (owners > 1) {
          await Promise.all([
            this.cancel.abandonPendingForCommand(),
            this.t2v.abandonPendingForCommand(),
            this.t2i.abandonPendingForCommand()
          ]);
          await this.sendHtml(
            `${title("CONFIRM")}\n<b><i>Pending interaction state was ambiguous and has been cleared. Retry the command.</i></b>`
          );
          return;
        }

        if (owners === 1) {
          const response = pending[0]
            ? await this.cancel.handlePlainText(text)
            : pending[1]
              ? await this.t2v.handlePlainText(text)
              : await this.t2i.handlePlainText(text);
          if (response) await this.sendHtml(response);
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

      await this.t2i
        .abandonPendingForCommand();

      const parts =
        text.split(/\s+/);

      const rawCommand = parts[0]?.toLowerCase() ?? "";
      const command = commandForBot(rawCommand, this.bot.username);
      if (!command) return;

      const args =
        parts.slice(1);

      if (route.kind === "forum_image" || route.kind === "forum_video") {
        const wanted = route.kind === "forum_image" ? "/t2i" : "/t2v";
        const other = route.kind === "forum_image" ? "/t2v" : "/t2i";
        if (command === other) {
          await this.sendHtml(`<b><i>Use ${wanted} in the ${route.kind === "forum_image" ? "Video" : "Image"} Generation topic.</i></b>`);
          return;
        }
        if (command !== wanted && command !== "/h" && command !== "/help") {
          await this.sendHtml(`<b><i>This command is available in the private operator chat only.</i></b>`);
          return;
        }
        if (route.kind === "forum_image") {
          const key = { chatId: context.chatId, threadId: context.threadId ?? "0", userId: context.userId };
          await this.t2i.abandonPendingForCommand(key, this.replyDestination ?? undefined);
          if (command === "/h" || command === "/help") {
            await this.sendHtml(`${title("IMAGE GENERATION")}\n<code>/t2i</code> <b>-</b> <b>Generate image</b>\n<code>/t2i settings</code> <b>-</b> <b>Settings</b>`);
          } else {
            if (isDirectT2IPrompt(args)) {
              await this.t2i.begin(key);
              await this.t2i.handlePlainText(args.join(" "), key, context);
              return;
            }
            const response = await this.t2i.handleCommand(args, key, true);
            const promptInput = args.length === 0;
            const resetConfirmation = args[0]?.toLowerCase() === "reset" && args.length === 1 && await this.t2i.hasPending(key);
            const sent = await this.sendHtml(
              response,
              undefined,
              promptInput ? context.messageId : undefined,
              resetConfirmation ? [[
                { text: "Reset", callback_data: "helix:t2i:reset" },
                { text: "Cancel", callback_data: "helix:t2i:cancel" }
              ]] : undefined
            ) as { message_id?: number | string };
            if ((promptInput || resetConfirmation) && sent.message_id !== undefined) {
              await this.t2i.setExpectedReply(key, String(sent.message_id));
            }
          }
          return;
        }
        const key = { chatId: context.chatId, threadId: context.threadId ?? "0", userId: context.userId };
        await this.t2v.abandonPendingForCommand(key, this.replyDestination ?? undefined);
        if (command === "/h" || command === "/help") {
          await this.sendHtml(`${title("VIDEO GENERATION")}\n<code>/t2v</code> <b>-</b> <b>Generate video</b>\n<code>/t2v mode</code> <b>-</b> <b>Production mode</b>\n<code>/t2v settings</code> <b>-</b> <b>Settings</b>`);
        } else {
          const response = await this.t2v.handleCommand(args, key, false, true);
          const promptInput = args.length === 0;
          const resetConfirmation = args[0]?.toLowerCase() === "reset" && args.length === 1 && await this.t2v.hasPending(key);
          const sent = await this.sendHtml(
            response,
            undefined,
            promptInput ? context.messageId : undefined,
            resetConfirmation ? [[
              { text: "Reset", callback_data: "helix:t2v:reset" },
              { text: "Cancel", callback_data: "helix:t2v:cancel" }
            ]] : undefined
          ) as { message_id?: number | string };
          if ((promptInput || resetConfirmation) && sent.message_id !== undefined) {
            await this.t2v.setExpectedReply(key, String(sent.message_id));
          }
        }
        return;
      }

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

        case "/j":
        case "/jbs":
        case "/jobs":
          await this.sendHtml(
            await this.handleJobs(args)
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

        case "/dl":
        case "/downloads": {
          const response =
            await this.downloads
              .handleCommand(args);

          if (response) {
            await this.sendHtml(response);
          }
          break;
        }

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

        case "/t2i":
          await this.sendHtml(
            await this.t2i
              .handleCommand(args)
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
      if (route.kind === "forum_image" || route.kind === "forum_video") {
        console.error("[telegram] forum command failed", error);
        await this.sendHtml(`<b><i>Unable to process that request. Please try again.</i></b>`);
      }
      else {
        const detail = error instanceof Error ? error.message : String(error);
        await this.sendHtml(`<code>HELIX • ERROR</code>\n<blockquote>${escapeHtml(detail)}</blockquote>`);
      }
    }
    finally {
      this.replyDestination = null;
    }
  }

  private async run() {
    try {
      await this.resolveBotIdentity();
      await this.clearCommands();
      await this.initializeOffset();

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
          await this.handleUpdate(update);
          this.offset = update.update_id + 1;
          if (this.bot) await this.pollOffsets?.save(this.bot.id, this.offset);
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
