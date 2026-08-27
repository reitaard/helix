import {
  readFile
} from "node:fs/promises";

import type {
  JobService
} from "../jobs/service.js";

import {
  TelegramDelivery
} from "../delivery/telegram.js";

import {
  T2VPendingRepository
} from "../repositories/t2v-pending-repository.js";

import {
  TelegramJobLifecycleRepository
} from "../repositories/telegram-job-lifecycle-repository.js";

import {
  T2VModeService
} from "../t2v/mode-service.js";

import {
  T2V_MODE_VERSION,
  displayT2VMode,
  normalizeT2VMode
} from "../t2v/mode.js";

import type {
  T2VMode
} from "../t2v/mode.js";

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
  TelegramT2VModeService
} from "./t2v-mode-service.js";

import {
  TelegramT2VSettingsService
} from "./t2v-settings-service.js";

import {
  TelegramT2VResetService
} from "./t2v-reset-service.js";

import {
  compactError,
  escapeHtml,
  profileTitle,
  title
} from "./presentation.js";

import {
  queuedProgressHtml
} from "./progress-presentation.js";

import type { TelegramConversationKey } from "./conversation.js";
import type { TelegramContext } from "./context.js";

function isDevFlag(
  value: string | undefined
): boolean {
  const normalized = value?.toLowerCase();
  return normalized === "-d" || normalized === "-dev";
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

export class TelegramT2VService {
  private timer:
    ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly chatId: string,
    private readonly workerId: string,
    private readonly workerName: string,
    private readonly workflowPath: string,
    private readonly jobs: JobService,
    private readonly pending: T2VPendingRepository,
    private readonly lifecycles: TelegramJobLifecycleRepository,
    private readonly telegram: TelegramDelivery,
    private readonly profile: T2VProfileService,
    private readonly modes: T2VModeService,
    private readonly modeUi: TelegramT2VModeService,
    private readonly settingsUi: TelegramT2VSettingsService,
    private readonly reset: TelegramT2VResetService,
    private readonly promptSeconds = 300,
    private readonly confirmSeconds = 60,
    private readonly maxInvalid = 3,
    private readonly maxPromptLength = 2800
  ) {}

  private noPendingHtml() {
    return `<b><i>No T2V generation is pending.</i></b>`;
  }

  private confirmationHtml(
    prompt: string,
    settings: ResolvedT2VSettings,
    devProfile: boolean,
    mode: T2VMode,
    useButtons = false
  ) {
    const quality =
      settings.megapixelsOverride === null
        ? displayQuality(settings.quality)
        : `Custom · ${effectiveMegapixels(settings).toFixed(1)} MP`;

    return (
      `${profileTitle("Text2Video")}\n` +
      `<b>Prompt</b>\n` +
      `<blockquote expandable>${escapeHtml(prompt)}</blockquote>\n` +
      `<b>Model</b> · <b>LTX 2.5</b>\n` +
      `<b>Mode</b> · <b>${escapeHtml(displayT2VMode(mode))}</b>\n` +
      `<b>Aspect</b> · <b>${escapeHtml(settings.aspect)}</b>\n` +
      `<b>Quality</b> · <b>${escapeHtml(quality)}</b>\n` +
      `<b>Duration</b> · <b><i>(${settings.durationSeconds})s</i></b>` +
      (
        devProfile && settings.durationSeconds > 10
          ? ` <b><i>(Override)</i></b>`
          : ""
      ) +
      `\n` +
      `<b>Enhance</b> · <b>[${settings.enhance ? "ON" : "OFF"}]</b>\n` +
      (devProfile ? `<b>Access</b> · <b>[DEV]</b>\n` : "") +
      `<b>Worker</b> · <b>${escapeHtml(this.workerName)}</b>\n` +
      (useButtons
        ? `<b><i>Generate this video?</i></b>`
        : `<b><i>Generate this video? Type</i></b> <b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`)
    );
  }

  private failedHtml(
    message: string
  ) {
    return (
      `${title("FAILED")}\n\n` +
      `<b>Video generation was not submitted.</b>\n` +
      `<blockquote>${escapeHtml(compactError(message))}</blockquote>`
    );
  }

  private cancelledHtml() {
    return (
      `${title("CANCELLED")}\n\n` +
      `<i>Generation not submitted.</i>`
    );
  }

  private async editOrFallback(
    messageId: string | null,
    html: string,
    chatId = this.chatId
  ): Promise<string | null> {
    if (!messageId) {
      return html;
    }

    try {
      await this.telegram.editHtml(
        messageId,
        html,
        { chatId, threadId: null }
      );
      return null;
    }
    catch (error) {
      console.error(
        `[telegram] T2V lifecycle edit ${messageId} failed`,
        error
      );
      return html;
    }
  }

  private settingsUsageHtml() {
    return (
      `${profileTitle("Text2Video", "SETTINGS")}\n` +
      `<b>Open</b>\n` +
      `<code>/t2v settings</code>\n` +
      `<code>/t2v s</code>\n` +
      `<code>/t2v set</code>\n` +
      `<b>Change</b>\n` +
      `<code>/t2v s &lt;setting&gt; &lt;value&gt;</code>\n` +
      `<code>/t2v set &lt;setting&gt; &lt;value&gt;</code>`
    );
  }

  async handleCommand(
    args: string[],
    key: TelegramConversationKey | string = this.chatId,
    allowDev = true,
    useButtons = false
  ) {
    if (args.length === 0) {
      return this.begin(key);
    }

    if (!allowDev && args.some(isDevFlag)) {
      return `<b><i>Developer settings are available in the private operator chat only.</i></b>`;
    }

    const mode = args[0]?.toLowerCase() ?? "";

    if (mode === "mode" || mode === "m") {
      if (args.length === 1) {
        return this.modeUi.panel();
      }
      if (args.length === 2) {
        return this.modeUi.set(args[1] ?? "");
      }
      return `<b>Usage</b> · <code>/t2v mode &lt;manual|fast|quality&gt;</code>`;
    }

    if (mode === "reset") {
      if (args.length === 1) {
        return this.reset.begin(false, key, useButtons);
      }
      if (args.length === 2 && isDevFlag(args[1])) {
        return this.reset.begin(true, key, useButtons);
      }
      return `<b>Usage</b> · <code>/t2v reset [-dev|-d]</code>`;
    }

    if (mode === "settings") {
      if (args.length === 1) {
        return this.settingsUi.panel(false);
      }
      if (args.length === 2 && isDevFlag(args[1])) {
        return this.settingsUi.panel(true);
      }
      return this.settingsUsageHtml();
    }

    if (mode === "s") {
      if (args.length === 1) {
        return this.settingsUi.panel(false);
      }
      if (args.length === 2 && isDevFlag(args[1])) {
        return this.settingsUi.panel(true);
      }
    }

    if (mode !== "set" && mode !== "s") {
      return this.settingsUsageHtml();
    }

    let index = 1;
    let dev = false;

    if (isDevFlag(args[index])) {
      dev = true;
      index += 1;
    }

    const setting = args[index];
    if (!setting) {
      return this.settingsUi.panel(dev);
    }

    const value = args.slice(index + 1).join(" ").trim();
    if (!value) {
      return this.settingsUi.help(setting, dev);
    }

    return this.settingsUi.set(setting, value, dev);
  }

  private async sweepExpiry() {
    try {
      await Promise.all([
        this.pending.expireDue(this.chatId),
        this.reset.expireDue()
      ]);
    }
    catch (error) {
      console.error(
        "[telegram] T2V expiry sweep failed",
        error
      );
    }
  }

  start() {
    if (this.timer) return;

    void this.sweepExpiry();
    this.timer = setInterval(
      () => void this.sweepExpiry(),
      5000
    );
    this.timer.unref();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async begin(key: TelegramConversationKey | string = this.chatId) {
    await this.pending.beginPrompt(
      key,
      new Date(Date.now() + this.promptSeconds * 1000)
    );

    return (
      `${profileTitle("Text2Video")}\n` +
      `<b><i>Send the generation prompt.</i></b>`
    );
  }

  async hasPending(key: TelegramConversationKey | string = this.chatId) {
    if (await this.reset.hasPending(key)) {
      return true;
    }

    await this.pending.expireDue(key);
    return (await this.pending.get(key)) !== null;
  }

  async abandonPendingForCommand(key: TelegramConversationKey | string = this.chatId) {
    await Promise.all([this.pending.remove(key), this.reset.abandonPendingForCommand(key)]);
  }

  async setExpectedReply(key: TelegramConversationKey, messageId: string) {
    await Promise.all([this.pending.setExpectedReply(key, messageId), this.reset.setExpectedReply(key, messageId)]);
  }

  async acceptsGroupReply(key: TelegramConversationKey, replyToMessageId: string | null) {
    if (!replyToMessageId) return false;
    const state = await this.pending.get(key);
    return state?.phase === "awaiting_prompt" && state.expectedReplyMessageId === replyToMessageId;
  }

  async acceptsGroupCallback(
    key: TelegramConversationKey,
    messageId: string,
    action: "generate" | "reset" | "cancel"
  ) {
    const state = await this.pending.get(key);
    const generation = state?.phase === "awaiting_confirmation" && state.confirmationMessageId === messageId;
    if (generation) return action === "generate" || action === "cancel";
    const reset = await this.reset.acceptsGroupReply(key, messageId);
    return reset && (action === "reset" || action === "cancel");
  }

  private async workflowFor(
    prompt: string,
    settings: ResolvedT2VSettings
  ): Promise<T2VWorkflow> {
    const raw = await readFile(
      this.workflowPath,
      "utf8"
    );

    const parsed: unknown = JSON.parse(raw);

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

  private async currentEffective() {
    const base = await this.profile.get();
    const modeState = await this.modes.resolve(base);

    return {
      base,
      mode: modeState.mode,
      version: modeState.version,
      settings: resolveT2VSettings(modeState.settings)
    };
  }

  private async pendingGeneration(
    snapshot: unknown
  ) {
    const record = asRecord(snapshot);
    const nested = asRecord(record?.settings);

    if (nested) {
      return {
        mode: normalizeT2VMode(record?.mode),
        version:
          typeof record?.modeVersion === "number"
            ? record.modeVersion
            : T2V_MODE_VERSION,
        settings:
          normalizeStoredT2VSettings(
            nested
          ) as ResolvedT2VSettings
      };
    }

    const current = await this.currentEffective();

    return {
      mode: current.mode,
      version: current.version,
      settings:
        snapshot
          ? normalizeStoredT2VSettings(
              snapshot
            ) as ResolvedT2VSettings
          : current.settings
    };
  }

  async handlePlainText(
    text: string,
    key: TelegramConversationKey | string = this.chatId,
    context?: TelegramContext
  ): Promise<string | null> {
    const resetResponse =
      await this.reset.handlePlainText(text, key);

    if (resetResponse !== null) {
      return resetResponse;
    }

    const answer = text.trim();
    const lower = answer.toLowerCase();

    await this.pending.expireDue(key);
    const state = await this.pending.get(key);

    if (!state) {
      if (lower === "yes" || lower === "no") {
        return this.noPendingHtml();
      }
      return null;
    }

    if (state.phase === "awaiting_prompt") {
      const consumedForceReplyMessageId = state.expectedReplyMessageId;
      if (!answer) {
        return `<b><i>Prompt cannot be empty.</i></b>`;
      }

      if (answer.length > this.maxPromptLength) {
        return `<b><i>Prompt is too long.</i></b>`;
      }

      const effective = await this.currentEffective();
      const stored = await this.pending.setPrompt(
        key,
        answer,
        {
          mode: effective.mode,
          modeVersion: effective.version,
          settings: effective.settings
        },
        new Date(Date.now() + this.confirmSeconds * 1000)
      );

      if (!stored) {
        return this.noPendingHtml();
      }

      const destination = context
        ? { chatId: context.chatId, threadId: context.threadId }
        : undefined;
      const isForum = context !== undefined && context.chatId !== this.chatId;
      const confirmationHtml = this.confirmationHtml(
        answer,
        effective.settings,
        hasDevOverrides(effective.base),
        effective.mode,
        isForum
      );
      const confirmation = isForum
        ? await this.telegram.sendHtmlWithInlineKeyboard(
            confirmationHtml,
            destination!,
            [[
              { text: "Generate", callback_data: "helix:t2v:generate" },
              { text: "Cancel", callback_data: "helix:t2v:cancel" }
            ]]
          )
        : await this.telegram.sendHtml(
            confirmationHtml,
            destination
          );

      const captured =
        await this.pending
          .captureConfirmationMessage(
            key,
            confirmation.messageId
          );

      if (!captured) {
        throw new Error(
          "T2V confirmation message could not be attached to pending state"
        );
      }

      await this.pending.setExpectedReply(key, confirmation.messageId);

      if (isForum && consumedForceReplyMessageId) {
        try {
          await this.telegram.deleteMessage(
            consumedForceReplyMessageId,
            destination
          );
        }
        catch (error) {
          console.error("[telegram] unable to remove consumed T2V ForceReply", error);
        }
      }

      return null;
    }

    if (
      state.phase !== "awaiting_confirmation" ||
      !state.prompt
    ) {
      await this.pending.remove(key);
      return this.noPendingHtml();
    }

    if (lower === "no") {
      await this.pending.remove(key);
      return this.editOrFallback(
        state.confirmationMessageId,
        this.cancelledHtml(),
        state.chatId
      );
    }

    if (lower === "yes") {
      let generation: {
        mode: T2VMode;
        version: number;
        settings: ResolvedT2VSettings;
      };
      let workflow: T2VWorkflow;

      try {
        generation = await this.pendingGeneration(
          state.settingsSnapshot
        );
        workflow = await this.workflowFor(
          state.prompt,
          generation.settings
        );
      }
      catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        await this.pending.remove(key);
        return this.editOrFallback(
          state.confirmationMessageId,
          this.failedHtml(message),
          state.chatId
        );
      }

      const settings = generation.settings;
      let job;

      try {
        job = await this.jobs.create({
          tool: "video.t2v",
          workerId: this.workerId,
          profileId: "nolan",
          workflow,
          inputs: {},
          generation: {
            kind: "t2v",
            model: "LTX 2.5",
            mode: generation.mode,
            modeVersion: generation.version,
            prompt: state.prompt,
            settings: {
              aspect: settings.aspect,
              quality: settings.quality,
              megapixels: effectiveMegapixels(settings),
              megapixelsOverride:
                settings.megapixelsOverride,
              durationSeconds:
                settings.durationSeconds,
              frames:
                settings.durationSeconds *
                settings.fps + 1,
              enhance: settings.enhance,
              fps: settings.fps,
              seed: settings.seed,
              seed2: settings.seed2,
              negativePrompt:
                settings.negativePrompt,
              sampler: settings.sampler,
              cfg: settings.cfg
            }
          },
          ...(context ? { deliveryContext: { provider: "telegram" as const, chatId: context.chatId, threadId: context.threadId, userId: context.userId } } : {}),
          idempotencyKey: context ? `telegram-${context.botId}-${context.updateId}` : null
        });
      }
      catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        await this.pending.remove(key);
        return this.editOrFallback(
          state.confirmationMessageId,
          this.failedHtml(message),
          state.chatId
        );
      }

      let lifecycleAttached = false;

      if (state.confirmationMessageId) {
        try {
          await this.lifecycles.attach({
            jobId: job.id,
            chatId: state.chatId,
            messageId:
              state.confirmationMessageId
          });
          lifecycleAttached = true;
        }
        catch (error) {
          console.error(
            `[telegram] T2V lifecycle attach failed for ${job.id}`,
            error
          );
        }
      }

      await this.pending.remove(key);

      const queued =
        queuedProgressHtml(
          job,
          this.workerName
        );

      if (!state.confirmationMessageId) {
        return queued;
      }

      try {
        await this.telegram.editHtml(
          state.confirmationMessageId,
          queued,
          { chatId: state.chatId, threadId: null }
        );
        return null;
      }
      catch (error) {
        console.error(
          `[telegram] T2V queued lifecycle edit failed for ${job.id}`,
          error
        );

        return lifecycleAttached
          ? null
          : queued;
      }
    }

    const updated =
      await this.pending.incrementInvalid(key);

    if (!updated) {
      return this.noPendingHtml();
    }

    if (
      updated.invalidAttempts >=
      this.maxInvalid
    ) {
      await this.pending.remove(key);
      return this.editOrFallback(
        updated.confirmationMessageId,
        this.cancelledHtml(),
        updated.chatId
      );
    }

    return (
      `<b>Invalid response!</b>\n` +
      `<b><i>Type</i></b> ‘<code>yes</code>’ ` +
      `<b><i>or</i></b> ‘<code>no</code>’ ` +
      `<b><i>(Attempt · ${updated.invalidAttempts}/${this.maxInvalid})</i></b>`
    );
  }
}
