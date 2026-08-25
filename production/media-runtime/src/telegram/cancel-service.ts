import {
  OperatorActionRepository
} from "../repositories/operator-action-repository.js";

import {
  JobRepository
} from "../repositories/job-repository.js";

import type {
  JobService
} from "../jobs/service.js";

import type {
  WorkerRegistry
} from "../workers/registry.js";

import {
  resolveJobReference
} from "./job-reference.js";

import {
  escapeHtml,
  title
} from "./presentation.js";

const TERMINAL_STATES =
  new Set([
    "succeeded",
    "failed",
    "cancelled",
    "timed_out"
  ]);

function displayStatus(
  status: string
) {
  return (
    status === "timed_out"
      ? "timed out"
      : status
  );
}

export class TelegramCancelService {
  private timer:
    ReturnType<
      typeof setInterval
    > |
    null =
      null;

  constructor(
    private readonly chatId:
      string,

    private readonly actions:
      OperatorActionRepository,

    private readonly jobs:
      JobRepository,

    private readonly jobService:
      JobService,

    private readonly workers:
      WorkerRegistry,

    private readonly expiresSeconds =
      60,

    private readonly maxInvalid =
      3
  ) {}

  private noPendingHtml() {
    return (
      `${title("CANCEL")}\n` +
      `<b><i>No cancellation is pending.</i></b>`
    );
  }

  private jobHeader(
    job: {
      id: string;
      status: string;
      workerId:
        string |
        null;
      profileId:
        string |
        null;
    }
  ) {
    return (
      `<b>Job</b> · ` +
      `<code>${escapeHtml(
        job.id
      )}</code>\n` +

      `<b>Worker</b> · ` +
      `<b>${escapeHtml(
        this.workers.profileDisplayName(
          job.workerId,
          job.profileId
        )
      )}</b>\n` +

      `<b>State</b> · ` +
      `<b>[${escapeHtml(
        displayStatus(
          job.status
        )
      )}]</b>`
    );
  }

  private async sweepExpiry() {
    try {
      await this.actions
        .expireDue(
          this.chatId
        );
    }
    catch (error) {
      console.error(
        "[telegram] cancellation expiry sweep failed",
        error
      );
    }
  }

  start() {
    if (this.timer) {
      return;
    }

    void this.sweepExpiry();

    this.timer =
      setInterval(
        () => {
          void this.sweepExpiry();
        },
        5000
      );

    this.timer.unref();
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer
    );

    this.timer = null;
  }

  async hasPending() {
    await this.actions
      .expireDue(
        this.chatId
      );

    return (
      await this.actions.get(
        this.chatId
      )
    ) !== null;
  }

  async abandonPendingForCommand() {
    await this.actions
      .expireDue(
        this.chatId
      );

    const pending =
      await this.actions.get(
        this.chatId
      );

    if (!pending) {
      return;
    }

    await this.actions.close(
      this.chatId,
      "operator.telegram.cancel_aborted",
      {
        reason:
          "new_command"
      }
    );
  }

  async begin(
    reference: string
  ) {
    const resolved =
      await resolveJobReference(
        this.jobs,
        reference
      );

    if (
      resolved.kind ===
      "invalid"
    ) {
      return (
        `${title("CANCEL")}\n` +
        `<b>Usage</b> · ` +
        `<code>/cancel &lt;id&gt;</code>`
      );
    }

    if (
      resolved.kind ===
      "not_found"
    ) {
      return (
        `${title("CANCEL")}\n` +
        `<b><i>Job not found.</i></b>`
      );
    }

    if (
      resolved.kind ===
      "ambiguous"
    ) {
      return (
        `${title("CANCEL")}\n` +
        `<b><i>Prefix is ambiguous.</i></b>\n` +
        `<b><i>Use more characters.</i></b>`
      );
    }

    const job =
      resolved.job;

    if (
      job.status ===
      "cancelled"
    ) {
      return (
        `${title("CANCEL")}\n` +
        `${this.jobHeader(job)}\n` +
        `<b><i>Job is already cancelled.</i></b>`
      );
    }

    if (
      TERMINAL_STATES.has(
        job.status
      )
    ) {
      return (
        `${title("CANCEL")}\n` +
        `${this.jobHeader(job)}\n` +
        `<b><i>Job is already finished.</i></b>`
      );
    }

    const expiresAt =
      new Date(
        Date.now() +
        this.expiresSeconds *
        1000
      );

    const created =
      await this.actions
        .createCancel({
          chatId:
            this.chatId,

          jobId:
            job.id,

          expiresAt
        });

    if (!created) {
      return (
        `${title("CANCEL")}\n` +
        `<b><i>Job not found.</i></b>`
      );
    }

    return (
      `${title("CANCEL")}\n` +
      `${this.jobHeader(job)}\n` +
      `<b><i>Cancel this job? Type</i></b> ` +
      `<b>[</b> ` +
      `<code>yes</code> ` +
      `<b>/</b> ` +
      `<code>no</code> ` +
      `<b>]</b>`
    );
  }

  async handlePlainText(
    text: string
  ): Promise<
    string |
    null
  > {
    await this.actions
      .expireDue(
        this.chatId
      );

    const answer =
      text
        .trim()
        .toLowerCase();

    const pending =
      await this.actions.get(
        this.chatId
      );

    if (!pending) {
      if (
        answer === "yes" ||
        answer === "no"
      ) {
        return this.noPendingHtml();
      }

      return null;
    }

    if (answer === "no") {
      await this.actions.close(
        this.chatId,
        "operator.telegram.cancel_aborted",
        {
          reason:
            "operator_no"
        }
      );

      return (
        `${title("CANCEL")}\n` +
        `<b>Cancellation aborted.</b>\n` +
        `<b><i>Job continues running.</i></b>`
      );
    }

    if (answer === "yes") {
      await this.actions.close(
        this.chatId,
        "operator.telegram.cancel_confirmed",
        {
          reason:
            "operator_yes"
        }
      );

      const result =
        await this.jobService
          .cancel(
            pending.jobId
          );

      if (!result) {
        return (
          `${title("CANCEL")}\n` +
          `<b><i>Job not found.</i></b>`
        );
      }

      const current =
        await this.jobs.get(
          pending.jobId
        );

      if (
        result.cancelled &&
        current
      ) {
        return (
          `${title("CANCELLED")}\n` +
          `${this.jobHeader(
            current
          )}`
        );
      }

      if (
        result.status ===
        "cancelled" &&
        current
      ) {
        return (
          `${title("CANCELLED")}\n` +
          `${this.jobHeader(
            current
          )}`
        );
      }

      if (
        TERMINAL_STATES.has(
          result.status
        )
      ) {
        return (
          `${title("CANCEL")}\n` +
          `<b>Job</b> · ` +
          `<code>${escapeHtml(
            pending.jobId
          )}</code>\n` +
          `<b>State</b> · ` +
          `<b>[${escapeHtml(
            displayStatus(
              result.status
            )
          )}]</b>\n` +
          `<b><i>Job is already finished.</i></b>`
        );
      }

      return (
        `${title("CANCEL")}\n` +
        `<b>Job</b> · ` +
        `<code>${escapeHtml(
          pending.jobId
        )}</code>\n` +
        `<b>State</b> · ` +
        `<b>[${escapeHtml(
          displayStatus(
            result.status
          )
        )}]</b>\n` +
        `<b><i>Cancellation was not completed.</i></b>`
      );
    }

    const updated =
      await this.actions
        .incrementInvalid(
          this.chatId
        );

    if (!updated) {
      return this.noPendingHtml();
    }

    if (
      updated.invalidAttempts >=
      this.maxInvalid
    ) {
      await this.actions.close(
        this.chatId,
        "operator.telegram.cancel_aborted",
        {
          reason:
            "invalid_limit",

          invalidAttempts:
            updated.invalidAttempts
        }
      );

      return (
        `${title("CANCEL")}\n` +
        `<b>Cancellation aborted after 3 invalid responses.</b>\n` +
        `<b><i>Job continues running.</i></b>`
      );
    }

    return (
      `${title("CANCEL")}\n` +
      `<b>Invalid response!</b>\n` +
      `<b><i>Type</i></b> ` +
      `‘<code>yes</code>’ ` +
      `<b><i>or</i></b> ` +
      `‘<code>no</code>’ ` +
      `<b><i>(Attempt · ${updated.invalidAttempts}/${this.maxInvalid})</i></b>`
    );
  }
}
