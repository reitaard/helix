import {
  readFile
} from "node:fs/promises";

import type {
  JobService
} from "../jobs/service.js";

import {
  T2VPendingRepository
} from "../repositories/t2v-pending-repository.js";

import {
  T2VProfileService
} from "../t2v/profile-service.js";

import {
  bindT2VWorkflow
} from "../t2v/workflow-binder.js";

import type {
  T2VWorkflow
} from "../t2v/workflow-binder.js";

import {
  displayQuality,
  effectiveMegapixels,
  hasDevOverrides,
  normalizeStoredT2VSettings,
  resolveT2VSettings
} from "../t2v/settings.js";

import type {
  ResolvedT2VSettings
} from "../t2v/settings.js";

import {
  TelegramT2VSettingsService
} from "./t2v-settings-service.js";

import {
  escapeHtml,
  title
} from "./presentation.js";

export class TelegramT2VService {
  private timer:
    ReturnType<
      typeof setInterval
    > |
    null =
      null;

  constructor(
    private readonly chatId:
      string,

    private readonly workerId:
      string,

    private readonly workerName:
      string,

    private readonly workflowPath:
      string,

    private readonly jobs:
      JobService,

    private readonly pending:
      T2VPendingRepository,

    private readonly profile:
      T2VProfileService,

    private readonly settingsUi:
      TelegramT2VSettingsService,

    private readonly promptSeconds =
      300,

    private readonly confirmSeconds =
      60,

    private readonly maxInvalid =
      3,

    private readonly maxPromptLength =
      2800
  ) {}

  private noPendingHtml() {
    return (
      `${title("T2V")}\n` +
      `<b><i>No T2V generation is pending.</i></b>`
    );
  }

  private confirmationHtml(
    prompt: string,
    settings:
      ResolvedT2VSettings,
    devProfile: boolean
  ) {
    const quality =
      settings.megapixelsOverride ===
      null
        ? displayQuality(
            settings.quality
          )
        : `Custom · ${effectiveMegapixels(
            settings
          ).toFixed(1)} MP`;

    return (
      `${title("T2V")}\n` +

      `<b>Prompt</b>\n` +
      `<blockquote expandable>${escapeHtml(
        prompt
      )}</blockquote>\n` +

      `<b>Model</b> · <b>LTX 2.5</b>\n` +
      `<b>Aspect</b> · <b>${escapeHtml(
        settings.aspect
      )}</b>\n` +
      `<b>Quality</b> · <b>${escapeHtml(
        quality
      )}</b>\n` +
      `<b>Duration</b> · <b><i>${
        settings.durationSeconds
      }s</i></b>\n` +
      `<b>Enhance</b> · <b>[${
        settings.enhance
          ? "ON"
          : "OFF"
      }]</b>\n` +
      (
        devProfile
          ? `<b>Profile</b> · <b>[DEV]</b>\n`
          : ""
      ) +
      `<b>Worker</b> · <b>${escapeHtml(
        this.workerName
      )}</b>\n\n` +

      `<b>Generate this video?</b>  ` +
      `<b><i>Type</i></b> ` +
      `<b>[</b> ` +
      `<code>yes</code> ` +
      `<b>/</b> ` +
      `<code>no</code> ` +
      `<b>]</b>`
    );
  }

  private settingsUsageHtml() {
    return (
      `${title("T2V SETTINGS")}\n\n` +
      `<b>Open</b>\n` +
      `<code>/t2v settings</code>\n` +
      `<code>/t2v s</code>\n` +
      `<code>/t2v set</code>\n\n` +
      `<b>Change</b>\n` +
      `<code>/t2v set &lt;setting&gt; &lt;value&gt;</code>`
    );
  }

  async handleCommand(
    args: string[]
  ) {
    if (args.length === 0) {
      return this.begin();
    }

    const mode =
      args[0]
        ?.toLowerCase() ??
      "";

    if (
      mode === "settings" ||
      mode === "s"
    ) {
      if (args.length === 1) {
        return this.settingsUi
          .panel(false);
      }

      if (
        args.length === 2 &&
        args[1]?.toLowerCase() ===
          "--dev"
      ) {
        return this.settingsUi
          .panel(true);
      }

      return this.settingsUsageHtml();
    }

    if (mode !== "set") {
      return this.settingsUsageHtml();
    }

    let index = 1;
    let dev = false;

    if (
      args[index]?.toLowerCase() ===
      "--dev"
    ) {
      dev = true;
      index += 1;
    }

    const setting =
      args[index];

    if (!setting) {
      return this.settingsUi
        .panel(dev);
    }

    const value =
      args
        .slice(index + 1)
        .join(" ")
        .trim();

    if (!value) {
      return this.settingsUi
        .help(
          setting,
          dev
        );
    }

    return this.settingsUi
      .set(
        setting,
        value,
        dev
      );
  }

  private async sweepExpiry() {
    try {
      await this.pending
        .expireDue(
          this.chatId
        );
    }
    catch (error) {
      console.error(
        "[telegram] T2V expiry sweep failed",
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

  async begin() {
    await this.pending
      .beginPrompt(
        this.chatId,
        new Date(
          Date.now() +
          this.promptSeconds *
          1000
        )
      );

    return (
      `${title("T2V")}\n` +
      `<b><i>Send the generation prompt.</i></b>`
    );
  }

  async hasPending() {
    await this.pending
      .expireDue(
        this.chatId
      );

    return (
      await this.pending.get(
        this.chatId
      )
    ) !== null;
  }

  async abandonPendingForCommand() {
    await this.pending
      .remove(
        this.chatId
      );
  }

  private async workflowFor(
    prompt: string,
    settings:
      ResolvedT2VSettings
  ): Promise<T2VWorkflow> {
    const raw =
      await readFile(
        this.workflowPath,
        "utf8"
      );

    const parsed:
      unknown =
        JSON.parse(raw);

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "T2V workflow is not a valid API workflow"
      );
    }

    return bindT2VWorkflow(
      parsed as T2VWorkflow,
      prompt,
      settings
    );
  }

  async handlePlainText(
    text: string
  ): Promise<
    string |
    null
  > {
    const answer =
      text
        .trim();

    const lower =
      answer.toLowerCase();

    await this.pending
      .expireDue(
        this.chatId
      );

    const state =
      await this.pending.get(
        this.chatId
      );

    if (!state) {
      if (
        lower === "yes" ||
        lower === "no"
      ) {
        return this.noPendingHtml();
      }

      return null;
    }

    if (
      state.phase ===
      "awaiting_prompt"
    ) {
      if (!answer) {
        return (
          `${title("T2V")}\n` +
          `<b><i>Prompt cannot be empty.</i></b>`
        );
      }

      if (
        answer.length >
        this.maxPromptLength
      ) {
        return (
          `${title("T2V")}\n` +
          `<b><i>Prompt is too long.</i></b>`
        );
      }

      const profileSettings =
        await this.profile.get();

      const resolvedSettings =
        resolveT2VSettings(
          profileSettings
        );

      const stored =
        await this.pending
          .setPrompt(
            this.chatId,
            answer,
            resolvedSettings,
            new Date(
              Date.now() +
              this.confirmSeconds *
              1000
            )
          );

      if (!stored) {
        return this.noPendingHtml();
      }

      return this.confirmationHtml(
        answer,
        resolvedSettings,
        hasDevOverrides(
          profileSettings
        )
      );
    }

    if (
      state.phase !==
        "awaiting_confirmation" ||
      !state.prompt
    ) {
      await this.pending
        .remove(
          this.chatId
        );

      return this.noPendingHtml();
    }

    if (lower === "no") {
      await this.pending
        .remove(
          this.chatId
        );

      return (
        `${title("T2V")}\n` +
        `<b>Generation aborted.</b>\n\n` +
        `<b><i>No job was submitted.</i></b>`
      );
    }

    if (lower === "yes") {
      const prompt =
        state.prompt;

      const settings =
        state.settingsSnapshot
          ? normalizeStoredT2VSettings(
              state.settingsSnapshot
            ) as ResolvedT2VSettings
          : resolveT2VSettings(
              await this.profile.get()
            );

      await this.pending
        .remove(
          this.chatId
        );

      const workflow =
        await this.workflowFor(
          prompt,
          settings
        );

      const job =
        await this.jobs.create({
          tool:
            "video.t2v",

          workerId:
            this.workerId,

          workflow,

          inputs: {},

          idempotencyKey:
            null
        });

      return (
        `${title("T2V")}\n` +

        `<b>ID</b> · ` +
        `<code>${escapeHtml(
          job.id
        )}</code>\n` +

        `<b>Worker</b> · ` +
        `<b>${escapeHtml(
          this.workerName
        )}</b>\n` +

        `<b>State</b> · ` +
        `<b>[${escapeHtml(
          job.status
        )}]</b>`
      );
    }

    const updated =
      await this.pending
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
      await this.pending
        .remove(
          this.chatId
        );

      return (
        `${title("T2V")}\n` +
        `<b>Generation aborted after 3 invalid responses.</b>\n\n` +
        `<b><i>No job was submitted.</i></b>`
      );
    }

    return (
      `${title("T2V")}\n` +
      `<b>Invalid response!</b>\n\n` +

      `<b><i>Type</i></b> ` +
      `‘<code>yes</code>’ ` +
      `<b><i>or</i></b> ` +
      `‘<code>no</code>’ ` +

      `<b><i>(Attempt · ${
        updated.invalidAttempts
      }/${this.maxInvalid})</i></b>`
    );
  }
}
