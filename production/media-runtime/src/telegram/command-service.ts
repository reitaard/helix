import type {
  Pool
} from "pg";

import {
  JobRepository
} from "../repositories/job-repository.js";

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
      id:
        number | string;
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
    return (
      `${hours}h ` +
      `${minutes}m`
    );
  }

  if (minutes > 0) {
    return (
      `${minutes}m ` +
      `${secs}s`
    );
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

  return typeof value ===
    "string"
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

  return typeof value ===
    "number" &&
    Number.isFinite(value)
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
      JobRepository
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
    externalSignal?:
      AbortSignal
  ): Promise<T> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        timeoutMs
      );

    const abort = () => {
      controller.abort();
    };

    externalSignal
      ?.addEventListener(
        "abort",
        abort,
        {
          once: true
        }
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

        text:
          html,

        parse_mode:
          "HTML",

        link_preview_options: {
          is_disabled: true
        }
      }
    );
  }


  private async clearCommands() {
    // Remove commands registered specifically for this chat.
    await this.postJson(
      "deleteMyCommands",
      {
        scope: {
          type: "chat",
          chat_id: this.chatId
        }
      }
    );

    // Also remove any default/global bot command list so
    // Telegram does not fall back to showing a Menu button.
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
          offset:
            this.offset,

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
      `<b><i>• COMMANDS •</i></b>\n` +
      `<code>/status</code> <b>-</b> <b>Diagnostics</b>\n` +
      `<code>/queue</code> <b>-</b> <b>Queue check</b>`
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

    const system:
      string[] = [];

    if (
      readiness.status ===
        "fulfilled" &&
      readiness.value
    ) {
      const value =
        readiness.value;

      lines.push(
        `<b>Worker</b> · <b>${
          escapeHtml(
            value.name
          )
        }</b>`
      );

      lines.push(
        `<b>State</b> · <code>${
          escapeHtml(
            displayWorkerState(
              value.state
            )
          )
        }</code> · <i>${
          value.latencyMs
        } ms</i>`
      );

      lines.push(
        `<b>Queue</b> · <b>${
          value.queue
            ?.running ?? 0
        }</b> <i>running</i> · <b>${
          value.queue
            ?.pending ?? 0
        }</b> <i>pending</i>`
      );

      if (
        value.backend
          ?.version
      ) {
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

      if (
        value.backend
          ?.python
      ) {
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

      if (
        value.backend
          ?.runtime
      ) {
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
        asRecord(
          value.device
        );

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
          `<b>VRAM</b> · <b>${
            formatGiB(free)
          }</b> / ${
            formatGiB(total)
          } GB free`
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

      if (
        value.errors.length > 0
      ) {
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

    if (
      system.length > 0
    ) {
      lines.push(
        "",
        "<b><i>[System]</i></b>",
        ...system
      );
    }

    return (
      `<b><i>• STATUS •</i></b>\n` +
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

    const lines:
      string[] = [];

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
        active.value.length ===
        0
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
                shortJobId(
                  job.id
                )
              )
            }</code> · ` +
            `<b>${
              escapeHtml(
                job.status
              )
            }</b> · ` +
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
      `<b><i>• QUEUE •</i></b>\n` +
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
      String(
        message.chat.id
      ) !==
      this.chatId
    ) {
      return;
    }

    const text =
      message.text.trim();

    if (
      !text.startsWith("/")
    ) {
      return;
    }

    const rawCommand =
      text
        .split(/\s+/)[0]
        ?.toLowerCase() ??
      "";

    const command =
      rawCommand
        .split("@")[0];

    try {
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

        case "/help":
        default:
          await this.sendHtml(
            this.helpHtml()
          );
          break;
      }
    }
    catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await this.sendHtml(
        `<code>HELIX • ERROR</code>\n` +
        `<blockquote>${
          escapeHtml(message)
        }</blockquote>`
      );
    }
  }


  private async run() {
    try {
      await this
        .clearCommands();

      await this
        .discardPending();

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

        for (
          const update of
          updates
        ) {
          this.offset =
            update.update_id +
            1;

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
