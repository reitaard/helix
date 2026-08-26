import {
  T2IResetPendingRepository
} from "../repositories/t2i-reset-pending-repository.js";

import {
  T2ISettingsRepository
} from "../repositories/t2i-settings-repository.js";

import {
  DEFAULT_T2I_SETTINGS,
  normalizeStoredT2ISettings,
  T2I_PROFILE_ID,
  T2I_TOOL
} from "../t2i/settings.js";

import {
  T2IProfileService
} from "../t2i/profile-service.js";

import {
  profileTitle
} from "./presentation.js";

import type { TelegramConversationKey } from "./conversation.js";

export class TelegramT2IResetService {
  constructor(
    private readonly chatId: string,
    private readonly profile: T2IProfileService,
    private readonly settings: T2ISettingsRepository,
    private readonly pending: T2IResetPendingRepository
  ) {}

  async begin(key: TelegramConversationKey | string = this.chatId) {
    const current = await this.profile.get();

    if (
      current.aspect === DEFAULT_T2I_SETTINGS.aspect &&
      current.seed === DEFAULT_T2I_SETTINGS.seed
    ) {
      return `<b><i>Settings already at default.</i></b>`;
    }

    await this.pending.begin(
      key,
      DEFAULT_T2I_SETTINGS,
      new Date(Date.now() + 60_000)
    );

    return (
      `${profileTitle("Text2Image", "RESET")}\n` +
      `<b><i>Reset these settings? Type</i></b> ` +
      `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`
    );
  }

  async expireDue(key: TelegramConversationKey | string = this.chatId) { return this.pending.expireDue(key); }
  async hasPending(key: TelegramConversationKey | string = this.chatId) { await this.expireDue(key); return (await this.pending.get(key)) !== null; }
  async abandonPendingForCommand(key: TelegramConversationKey | string = this.chatId) { await this.pending.remove(key); }
  async setExpectedReply(key: TelegramConversationKey, messageId: string) { await this.pending.setExpectedReply(key, messageId); }
  async acceptsGroupReply(key: TelegramConversationKey, replyToMessageId: string | null) { return (await this.pending.get(key))?.expected_reply_message_id === replyToMessageId && replyToMessageId !== null; }
  async handlePlainText(text: string, key: TelegramConversationKey | string = this.chatId): Promise<string | null> {
    await this.pending.expireDue(key);
    const state = await this.pending.get(key);
    if (!state) return null;

    const answer = text.trim().toLowerCase();

    if (answer === "no") {
      await this.pending.remove(key);
      return `<b><i>Reset cancelled.</i></b>`;
    }

    if (answer === "yes") {
      await this.settings.save(
        T2I_PROFILE_ID,
        T2I_TOOL,
        normalizeStoredT2ISettings(state.target_settings)
      );
      await this.pending.remove(key);
      return `<b><i>Settings reset.</i></b>`;
    }

    const updated = await this.pending.incrementInvalid(key);
    if (!updated || updated.invalid_attempts >= 3) {
      await this.pending.remove(key);
      return `<b><i>Reset aborted after 3 invalid responses.</i></b>`;
    }

    return (
      `<b>Invalid response!</b> <b><i>Type</i></b> ` +
      `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`
    );
  }
}
