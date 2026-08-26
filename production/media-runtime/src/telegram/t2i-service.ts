import crypto from "node:crypto";

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
  T2IPendingRepository
} from "../repositories/t2i-pending-repository.js";

import {
  TelegramJobLifecycleRepository
} from "../repositories/telegram-job-lifecycle-repository.js";

import {
  dimensionsForT2IAspect,
  resolveStoredT2ISettings,
  resolveT2ISettings,
  T2I_MODEL,
  T2I_WORKFLOW_VARIANT
} from "../t2i/settings.js";

import type {
  ResolvedT2ISettings
} from "../t2i/settings.js";

import {
  T2IProfileService
} from "../t2i/profile-service.js";

import {
  bindT2IWorkflow
} from "../t2i/workflow-binder.js";

import type {
  T2IWorkflow
} from "../t2i/workflow-binder.js";

import {
  compactError,
  escapeHtml,
  profileTitle,
  title
} from "./presentation.js";

import {
  queuedProgressHtml
} from "./progress-presentation.js";

import {
  TelegramT2ISettingsService
} from "./t2i-settings-service.js";

import {
  TelegramT2IResetService
} from "./t2i-reset-service.js";

import type {
  TelegramConversationKey
} from "./conversation.js";

import type {
  TelegramContext
} from "./context.js";

export class TelegramT2IService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly chatId: string,
    private readonly workerId: string,
    private readonly workerName: string,
    private readonly workflowPath: string,
    private readonly jobs: JobService,
    private readonly pending: T2IPendingRepository,
    private readonly lifecycles: TelegramJobLifecycleRepository,
    private readonly telegram: TelegramDelivery,
    private readonly profile: T2IProfileService,
    private readonly settings: TelegramT2ISettingsService,
    private readonly reset: TelegramT2IResetService,
    private readonly promptSeconds = 300,
    private readonly confirmSeconds = 60,
    private readonly maxInvalid = 3,
    private readonly maxPromptLength = 2800
  ) {}

  private async sweepExpiry() {
    try {
      await Promise.all([
        this.pending.expireDue(this.chatId),
        this.reset.expireDue()
      ]);
    }
    catch (error) {
      console.error("[telegram] T2I expiry sweep failed", error);
    }
  }

  start() {
    if (this.timer) return;
    void this.sweepExpiry();
    this.timer = setInterval(() => void this.sweepExpiry(), 5000);
    this.timer.unref();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private noPendingHtml() {
    return `<b><i>No T2I generation is pending.</i></b>`;
  }

  private confirmationHtml(prompt: string, settings: ResolvedT2ISettings, useButtons = false) {
    const image = dimensionsForT2IAspect(settings.aspect);
    return (
      `${profileTitle("Text2Image")}\n` +
      `<b>Prompt</b>\n<blockquote expandable>${escapeHtml(prompt)}</blockquote>\n` +
      `<b>Model</b> · <b>${T2I_MODEL}</b>\n` +
      `<b>Aspect</b> · <b>${escapeHtml(settings.aspect)}</b>\n` +
      `<b>Image</b> · <b>${image.width}×${image.height}</b>\n` +
      `<b>Seed</b> · <b>${settings.seed}</b>\n` +
      `<b>Worker</b> · <b>${escapeHtml(this.workerName)}</b>\n` +
      (useButtons
        ? `<b><i>Generate this image?</i></b>`
        : `<b><i>Generate this image? Type</i></b> <b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`)
    );
  }

  private failedHtml(
    message: string
  ) {
    return (
      `${title("FAILED")}\n\n` +
      `<b>Image generation was not submitted.</b>\n` +
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
        `[telegram] T2I lifecycle edit ${messageId} failed`,
        error
      );
      return html;
    }
  }

  async handleCommand(
    args: string[],
    key: TelegramConversationKey | string = this.chatId,
    useButtons = false
  ) {
    const action = args[0]?.toLowerCase();
    if (!action) return this.begin(key);
    if (action === "settings") {
      return args.length === 1
        ? this.settings.panel()
        : `<b>Usage</b> · <code>/t2i settings</code>`;
    }
    if (action === "reset") {
      return args.length === 1
        ? this.reset.begin(key, useButtons)
        : `<b>Usage</b> · <code>/t2i reset</code>`;
    }
    if (action !== "set" && action !== "s") {
      return `<b>Usage</b> · <code>/t2i [settings|set|reset]</code>`;
    }
    if (!args[1]) return this.settings.panel();
    return args.length === 2
      ? this.settings.help(args[1])
      : this.settings.set(args[1], args.slice(2).join(" "));
  }

  async begin(key: TelegramConversationKey | string = this.chatId) {
    await this.pending.beginPrompt(key, new Date(Date.now() + this.promptSeconds * 1000));
    return `${profileTitle("Text2Image")}\n<b><i>Send the generation prompt.</i></b>`;
  }

  async hasPending(key: TelegramConversationKey | string = this.chatId) {
    if (await this.reset.hasPending(key)) return true;
    await this.pending.expireDue(key);
    return (await this.pending.get(key)) !== null;
  }

  async abandonPendingForCommand(key: TelegramConversationKey | string = this.chatId) {
    await this.pending.remove(key);
    await this.reset.abandonPendingForCommand(key);
  }

  async setExpectedReply(key: TelegramConversationKey, messageId: string) {
    await Promise.all([
      this.pending.setExpectedReply(key, messageId),
      this.reset.setExpectedReply(key, messageId)
    ]);
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

  private async workflowFor(prompt: string, settings: ResolvedT2ISettings): Promise<T2IWorkflow> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.workflowPath, "utf8"));
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to prepare T2I workflow: ${message}`);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Unable to prepare T2I workflow: workflow is not a valid API workflow");
    }
    return bindT2IWorkflow(parsed as T2IWorkflow, prompt, settings);
  }

  async handlePlainText(
    text: string,
    key: TelegramConversationKey | string = this.chatId,
    context?: TelegramContext
  ): Promise<string | null> {
    const resetResponse = await this.reset.handlePlainText(text, key);
    if (resetResponse !== null) return resetResponse;

    await this.pending.expireDue(key);
    const state = await this.pending.get(key);
    const answer = text.trim();
    const lower = answer.toLowerCase();
    if (!state) return lower === "yes" || lower === "no" ? this.noPendingHtml() : null;

    if (state.phase === "awaiting_prompt") {
      if (!answer) return `<b><i>Prompt cannot be empty.</i></b>`;
      if (answer.length > this.maxPromptLength) return `<b><i>Prompt is too long.</i></b>`;
      const settings = resolveT2ISettings(await this.profile.get());
      const stored = await this.pending.setPrompt(key, answer, settings, new Date(Date.now() + this.confirmSeconds * 1000));
      if (!stored) return this.noPendingHtml();

      const destination = context
        ? { chatId: context.chatId, threadId: context.threadId }
        : undefined;
      const isForum = context !== undefined && context.chatId !== this.chatId;
      const confirmation = isForum
        ? await this.telegram.sendHtmlWithInlineKeyboard(
            this.confirmationHtml(answer, settings, true),
            destination!,
            [[
              { text: "Generate", callback_data: "helix:t2i:generate" },
              { text: "Cancel", callback_data: "helix:t2i:cancel" }
            ]]
          )
        : await this.telegram.sendHtml(
            this.confirmationHtml(answer, settings),
            destination
          );

      const captured =
        await this.pending
          .captureConfirmationMessage(key, confirmation.messageId);

      if (!captured) {
        throw new Error(
          "T2I confirmation message could not be attached to pending state"
        );
      }

      await this.pending.setExpectedReply(key, confirmation.messageId);
      return null;
    }

    if (state.phase !== "awaiting_confirmation" || !state.prompt) {
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
      let settings: ResolvedT2ISettings;
      let workflow: T2IWorkflow;

      try {
        settings = resolveStoredT2ISettings(state.settingsSnapshot);
        workflow = await this.workflowFor(state.prompt, settings);
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.pending.remove(key);
        return this.editOrFallback(
          state.confirmationMessageId,
          this.failedHtml(message),
          state.chatId
        );
      }

      const image = dimensionsForT2IAspect(settings.aspect);
      let job;

      try {
        job = await this.jobs.create({
          tool: "image.t2i", workerId: this.workerId, profileId: "leibovitz", workflow, inputs: {},
          generation: {
            kind: "t2i", model: T2I_MODEL, workflowVariant: T2I_WORKFLOW_VARIANT, prompt: state.prompt,
            settings: { aspect: settings.aspect, width: image.width, height: image.height, seed: settings.seed }
          },
          ...(context ? {
            deliveryContext: {
              provider: "telegram" as const,
              chatId: context.chatId,
              threadId: context.threadId,
              userId: context.userId
            }
          } : {}),
          idempotencyKey: context
            ? `telegram-${context.botId}-${context.updateId}`
            : `telegram-t2i-${crypto
              .createHash("sha256")
              .update(`${state.chatId}\u0000${state.createdAt}\u0000${state.prompt}\u0000${JSON.stringify(settings)}`)
              .digest("hex")}`
        });

      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
            messageId: state.confirmationMessageId
          });
          lifecycleAttached = true;
        }
        catch (error) {
          console.error(
            `[telegram] T2I lifecycle attach failed for ${job.id}`,
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
          `[telegram] T2I queued lifecycle edit failed for ${job.id}`,
          error
        );

        return lifecycleAttached
          ? null
          : queued;
      }
    }

    const updated = await this.pending.incrementInvalid(key);
    if (!updated) return this.noPendingHtml();

    if (updated.invalidAttempts >= this.maxInvalid) {
      await this.pending.remove(key);
      return this.editOrFallback(
        updated.confirmationMessageId,
        this.cancelledHtml(),
        updated.chatId
      );
    }

    return `<b>Invalid response!</b>\n<b><i>Type</i></b> ‘<code>yes</code>’ <b><i>or</i></b> ‘<code>no</code>’ <b><i>(Attempt · ${updated.invalidAttempts}/${this.maxInvalid})</i></b>`;
  }
}
