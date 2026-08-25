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

export class TelegramT2IResetService {
  constructor(
    private readonly chatId: string,
    private readonly profile: T2IProfileService,
    private readonly settings: T2ISettingsRepository,
    private readonly pending: T2IResetPendingRepository
  ) {}

  async begin() {
    const current = await this.profile.get();

    if (
      current.aspect === DEFAULT_T2I_SETTINGS.aspect &&
      current.seed === DEFAULT_T2I_SETTINGS.seed
    ) {
      return `<b><i>Settings already at default.</i></b>`;
    }

    await this.pending.begin(
      this.chatId,
      DEFAULT_T2I_SETTINGS,
      new Date(Date.now() + 60_000)
    );

    return (
      `<b>[ T2I / RESET ]</b>\n` +
      `<b><i>Reset these settings? Type</i></b> ` +
      `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`
    );
  }

  async expireDue() {
    return this.pending.expireDue(this.chatId);
  }

  async hasPending() {
    await this.expireDue();
    return (await this.pending.get(this.chatId)) !== null;
  }

  async abandonPendingForCommand() {
    await this.pending.remove(this.chatId);
  }

  async handlePlainText(text: string): Promise<string | null> {
    await this.pending.expireDue(this.chatId);
    const state = await this.pending.get(this.chatId);
    if (!state) return null;

    const answer = text.trim().toLowerCase();

    if (answer === "no") {
      await this.pending.remove(this.chatId);
      return `<b><i>Reset cancelled.</i></b>`;
    }

    if (answer === "yes") {
      await this.settings.save(
        T2I_PROFILE_ID,
        T2I_TOOL,
        normalizeStoredT2ISettings(state.target_settings)
      );
      await this.pending.remove(this.chatId);
      return `<b><i>Settings reset.</i></b>`;
    }

    const updated = await this.pending.incrementInvalid(this.chatId);
    if (!updated || updated.invalid_attempts >= 3) {
      await this.pending.remove(this.chatId);
      return `<b><i>Reset aborted after 3 invalid responses.</i></b>`;
    }

    return (
      `<b>Invalid response!</b> <b><i>Type</i></b> ` +
      `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`
    );
  }
}
