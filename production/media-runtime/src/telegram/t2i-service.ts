import {
  T2IPendingRepository
} from "../repositories/t2i-pending-repository.js";

import {
  T2I_MODEL,
  resolveT2ISettings
} from "../t2i/settings.js";

import {
  T2IProfileService
} from "../t2i/profile-service.js";

import {
  escapeHtml,
  title
} from "./presentation.js";

import {
  TelegramT2ISettingsService
} from "./t2i-settings-service.js";

import {
  TelegramT2IResetService
} from "./t2i-reset-service.js";

/*
 * Deliberately not registered in TelegramCommandService. It preserves the
 * future durable interaction boundary without advertising execution before a
 * vetted Distilled workflow binder exists.
 */
export class TelegramT2IService {
  constructor(
    private readonly chatId: string,
    private readonly pending: T2IPendingRepository,
    private readonly profile: T2IProfileService,
    private readonly settings: TelegramT2ISettingsService,
    private readonly reset: TelegramT2IResetService,
    private readonly workerName = "Annie Leibovitz"
  ) {}

  async handleCommand(args: string[]) {
    const action = args[0]?.toLowerCase();

    if (!action) return this.begin();
    if (action === "settings" || action === "s") {
      return args.length === 1
        ? this.settings.panel()
        : `<b>Usage</b> · <code>/t2i settings</code>`;
    }
    if (action === "reset") {
      return args.length === 1
        ? this.reset.begin()
        : `<b>Usage</b> · <code>/t2i reset</code>`;
    }
    if (action === "set") {
      if (!args[1]) return this.settings.panel();
      return args.length === 2
        ? this.settings.help(args[1])
        : this.settings.set(args[1], args.slice(2).join(" "));
    }

    return `<b>Usage</b> · <code>/t2i [settings|set|reset]</code>`;
  }

  async begin() {
    await this.pending.beginPrompt(
      this.chatId,
      new Date(Date.now() + 300_000)
    );

    return (
      `${title("T2I")}\n` +
      `<b><i>Send the generation prompt.</i></b>`
    );
  }

  async hasPending() {
    await this.pending.expireDue(this.chatId);

    return (
      await this.pending.get(this.chatId)
    ) !== null || await this.reset.hasPending();
  }

  async abandonPendingForCommand() {
    await Promise.all([
      this.pending.remove(this.chatId),
      this.reset.abandonPendingForCommand()
    ]);
  }

  async handlePlainText(text: string): Promise<string | null> {
    const resetResponse = await this.reset.handlePlainText(text);
    if (resetResponse) return resetResponse;

    await this.pending.expireDue(this.chatId);
    const state = await this.pending.get(this.chatId);
    if (!state) return null;

    const answer = text.trim();

    if (state.phase === "awaiting_prompt") {
      if (!answer) {
        return `${title("T2I")}\n<b><i>Prompt cannot be empty.</i></b>`;
      }
      if (answer.length > 2800) {
        return `${title("T2I")}\n<b><i>Prompt is too long.</i></b>`;
      }

      const settings = resolveT2ISettings(
        await this.profile.get()
      );

      await this.pending.setPrompt(
        this.chatId,
        answer,
        settings,
        new Date(Date.now() + 60_000)
      );

      return (
        `${title("T2I")}\n` +
        `<b>Prompt</b>\n` +
        `<blockquote expandable>${escapeHtml(answer)}</blockquote>\n` +
        `<b>Model</b> · <b>${T2I_MODEL}</b>\n` +
        `<b>Aspect</b> · <b>${escapeHtml(settings.aspect)}</b>\n` +
        `<b>Seed</b> · <b>${settings.seed}</b>\n` +
        `<b>Worker</b> · <b>${escapeHtml(this.workerName)}</b>\n\n` +
        `<b>Generate this image?</b> <b><i>Type</i></b> ` +
        `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`
      );
    }

    if (answer.toLowerCase() === "no") {
      await this.pending.remove(this.chatId);
      return `${title("T2I")}\n<b>Generation aborted.</b>`;
    }

    if (answer.toLowerCase() === "yes") {
      await this.pending.remove(this.chatId);
      return (
        `${title("T2I")}\n` +
        `<b><i>Image generation is unavailable until the vetted FLUX workflow is installed.</i></b>`
      );
    }

    const updated = await this.pending.incrementInvalid(this.chatId);
    if (!updated || updated.invalidAttempts >= 3) {
      await this.pending.remove(this.chatId);
      return `${title("T2I")}\n<b>Generation aborted after 3 invalid responses.</b>`;
    }

    return (
      `${title("T2I")}\n` +
      `<b>Invalid response!</b> <b><i>Type</i></b> ` +
      `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`
    );
  }
}
