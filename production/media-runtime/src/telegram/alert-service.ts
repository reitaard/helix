import {
  OperatorAlertRepository,

  type ClaimedOperatorAlert
} from "../repositories/operator-alert-repository.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  compactError,
  displayProvider,
  durationBetween,
  escapeHtml,
  title
} from "./presentation.js";

interface TelegramEnvelope<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

function asRecord(
  value: unknown
): Record<
  string,
  unknown
> {
  if (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
  ) {
    return value as
      Record<
        string,
        unknown
      >;
  }

  return {};
}

function readString(
  record:
    Record<
      string,
      unknown
    >,

  key: string
) {
  const value =
    record[key];

  return (
    typeof value ===
    "string"
  )
    ? value
    : null;
}

function readNumber(
  record:
    Record<
      string,
      unknown
    >,

  key: string
) {
  const value =
    record[key];

  return (
    typeof value ===
      "number" &&

    Number.isFinite(
      value
    )
  )
    ? value
    : null;
}

export class TelegramAlertService {
  private timer:
    NodeJS.Timeout | null =
      null;

  private workerTimer:
    NodeJS.Timeout | null =
      null;

  private ticking = false;

  private workerTicking =
    false;

  constructor(
    private readonly botToken:
      string,

    private readonly chatId:
      string,

    private readonly workerId:
      string,

    private readonly workerName:
      string,

    private readonly alerts:
      OperatorAlertRepository,

    private readonly workers:
      WorkerRegistry,

    private readonly intervalMs =
      3000,

    private readonly workerIntervalMs =
      15000,

    private readonly maxAttempts =
      3
  ) {}

  private endpoint(
    method: string
  ) {
    return (
      `https://api.telegram.org/bot${this.botToken}/${method}`
    );
  }

  private async sendHtml(
    html: string
  ) {
    const response =
      await fetch(
        this.endpoint(
          "sendMessage"
        ),
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json"
          },

          body:
            JSON.stringify({
              chat_id:
                this.chatId,

              text: html,

              parse_mode:
                "HTML",

              link_preview_options: {
                is_disabled:
                  true
              }
            })
        }
      );

    const parsed =
      await response.json() as
        TelegramEnvelope<
          unknown
        >;

    if (
      !response.ok ||
      parsed.ok !== true
    ) {
      throw new Error(
        parsed.description ??
        (
          "sendMessage failed: " +
          `HTTP ${response.status}`
        )
      );
    }
  }

  private alertHtml(
    alert:
      ClaimedOperatorAlert
  ) {
    const payload =
      asRecord(
        alert.payload
      );

    const jobId =
      alert.jobId
        ? escapeHtml(
            alert.jobId
          )
        : null;

    switch (alert.kind) {
      case "job_failed": {
        const workerId =
          readString(
            payload,
            "workerId"
          );

        const worker =
          workerId
            ? this.workers.get(
                workerId
              )
            : null;

        const name =
          worker?.name ??
          this.workerName;

        const error =
          compactError(
            readString(
              payload,
              "error"
            ) ??
            "Unknown error"
          );

        return (
          `${title("JOB FAILED")}\n` +

          `<b>Job</b> · <code>${jobId ?? "unknown"}</code>\n` +

          `<b>Worker</b> · <b><i>${escapeHtml(name)}</i></b>\n` +

          `<b>State</b> · <b><i>failed</i></b>\n` +

          `<b>Error</b> · <b><i>${escapeHtml(error)}</i></b>`
        );
      }

      case "job_timed_out": {
        const workerId =
          readString(
            payload,
            "workerId"
          );

        const worker =
          workerId
            ? this.workers.get(
                workerId
              )
            : null;

        const name =
          worker?.name ??
          this.workerName;

        const runtime =
          durationBetween(
            readString(
              payload,
              "startedAt"
            ),

            readString(
              payload,
              "finishedAt"
            )
          );

        const reason =
          compactError(
            readString(
              payload,
              "error"
            ) ??
            "Generation exceeded timeout"
          );

        return (
          `${title("JOB TIMED OUT")}\n` +

          `<b>Job</b> · <code>${jobId ?? "unknown"}</code>\n` +

          `<b>Worker</b> · <b><i>${escapeHtml(name)}</i></b>\n` +

          `<b>Runtime</b> · <i>${escapeHtml(runtime)}</i>\n` +

          `<b>Reason</b> · <b><i>${escapeHtml(reason)}</i></b>`
        );
      }

      case "outbox_failed": {
        const provider =
          displayProvider(
            readString(
              payload,
              "provider"
            ) ??
            "telegram"
          );

        const attempts =
          readNumber(
            payload,
            "attempts"
          ) ?? 0;

        const error =
          compactError(
            readString(
              payload,
              "error"
            ) ??
            "Unknown error"
          );

        return (
          `${title("OUTBOX FAILED")}\n` +

          `<b>Job</b> · <code>${jobId ?? "unknown"}</code>\n` +

          `<b>Provider</b> · <b><i>${escapeHtml(provider)}</i></b>\n` +

          `<b>Attempts</b> · <b><i>${attempts}</i></b>\n` +

          `<b>Error</b> · <b><i>${escapeHtml(error)}</i></b>`
        );
      }

      case "worker_offline": {
        const name =
          readString(
            payload,
            "workerName"
          ) ??
          this.workerName;

        const error =
          readString(
            payload,
            "error"
          );

        const suffix =
          error
            ? (
                `\n<b>Error</b> · <i>${escapeHtml(
                  compactError(
                    error
                  )
                )}</i>`
              )
            : (
                "\n<i>ComfyUI is unreachable.</i>"
              );

        return (
          `${title("WORKER OFFLINE")}\n` +

          `<b><i>${escapeHtml(name)}</i></b> · <b><i>Offline</i></b>` +

          suffix
        );
      }

      case "worker_recovered": {
        const name =
          readString(
            payload,
            "workerName"
          ) ??
          this.workerName;

        const state =
          readString(
            payload,
            "state"
          ) ??
          "Online";

        return (
          `${title("WORKER RECOVERED")}\n` +

          `<b><i>${escapeHtml(name)}</i></b> · <b><i>Online</i></b>\n` +

          `<b>State</b> · <b><i>${escapeHtml(state)}</i></b>`
        );
      }

      case "test":
        return (
          `${title("ALERT TEST")}\n` +
          `<b><i>Telegram operational alerts are working.</i></b>`
        );

      default:
        return (
          `${title("HELIX ALERT")}\n` +
          `<i>${escapeHtml(
            alert.kind
          )}</i>`
        );
    }
  }

  private retryDelay(
    attemptCount: number
  ) {
    return Math.min(
      60,

      10 *
      Math.pow(
        2,

        Math.max(
          0,
          attemptCount - 1
        )
      )
    );
  }

  private async tick() {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      await this.alerts
        .discoverDomainAlerts();

      while (true) {
        const alert =
          await this.alerts
            .claimDue();

        if (!alert) {
          break;
        }

        try {
          await this.sendHtml(
            this.alertHtml(
              alert
            )
          );

          await this.alerts
            .markSent(
              alert.id
            );
        }
        catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          const terminal =
            alert.attemptCount >=
            this.maxAttempts;

          await this.alerts
            .markFailed(
              alert.id,
              message,

              terminal
                ? null
                : this.retryDelay(
                    alert
                      .attemptCount
                  )
            );

          console.error(
            `[telegram-alert] ${alert.kind} ` +
            `${terminal
              ? "terminal failure"
              : "failed"}: ${message}`
          );
        }
      }
    }
    catch (error) {
      console.error(
        "[telegram-alert] tick failed",
        error
      );
    }
    finally {
      this.ticking = false;
    }
  }

  private async workerTick() {
    if (this.workerTicking) {
      return;
    }

    this.workerTicking =
      true;

    try {
      const live =
        await this.workers
          .liveness(
            this.workerId
          );

      if (!live) {
        await this.alerts
          .observeWorker({
            workerId:
              this.workerId,

            workerName:
              this.workerName,

            reachable:
              false,

            error:
              "Worker adapter unavailable",

            presentationState:
              "Offline"
          });

        return;
      }

      let presentationState =
        "Online";

      if (live.reachable) {
        try {
          const queue =
            await this.workers
              .queue(
                this.workerId
              );

          if (queue) {
            presentationState =
              queue.running > 0
                ? "Busy"
                : "Idle";
          }
        }
        catch {
          presentationState =
            "Online";
        }
      }

      await this.alerts
        .observeWorker({
          workerId:
            this.workerId,

          workerName:
            this.workerName,

          reachable:
            live.reachable,

          error:
            live.reachable
              ? null
              : (
                  live.error ??
                  "ComfyUI is unreachable"
                ),

          presentationState
        });
    }
    catch (error) {
      console.error(
        "[telegram-alert] worker check failed",
        error
      );
    }
    finally {
      this.workerTicking =
        false;
    }
  }

  start() {
    if (
      this.timer ||
      this.workerTimer
    ) {
      return;
    }

    void this.tick();
    void this.workerTick();

    this.timer =
      setInterval(
        () => {
          void this.tick();
        },
        this.intervalMs
      );

    this.workerTimer =
      setInterval(
        () => {
          void this.workerTick();
        },
        this.workerIntervalMs
      );
  }

  stop() {
    if (this.timer) {
      clearInterval(
        this.timer
      );

      this.timer = null;
    }

    if (this.workerTimer) {
      clearInterval(
        this.workerTimer
      );

      this.workerTimer =
        null;
    }
  }
}
