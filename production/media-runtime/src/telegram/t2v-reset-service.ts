import {
  T2VResetPendingRepository
} from "../repositories/t2v-reset-pending-repository.js";

import {
  T2VSettingsRepository
} from "../repositories/t2v-settings-repository.js";

import {
  T2VProfileService
} from "../t2v/profile-service.js";

import {
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_T2V_SETTINGS,
  T2V_PROFILE_ID,
  T2V_TOOL,
  displayQuality,
  effectiveMegapixels,
  normalizeStoredT2VSettings
} from "../t2v/settings.js";

import type {
  T2VSettings
} from "../t2v/settings.js";

import {
  escapeHtml
} from "./presentation.js";

type ResetScope =
  | "core"
  | "all";

function pageTitle(
  dev: boolean
) {
  return (
    `<b>[ T2V / RESET ]</b>` +
    (
      dev
        ? ` (<b><i>dev</i></b>)`
        : ""
    )
  );
}

function section(
  name: string,
  lines: string[]
) {
  return (
    `<blockquote>` +
    `<b><i>• ${escapeHtml(
      name.toLowerCase()
    )} •</i></b>\n` +
    lines.join("\n") +
    `</blockquote>`
  );
}

function seedValue(
  value: number | "random"
) {
  return value === "random"
    ? "random"
    : String(value);
}

function negativeState(
  settings: T2VSettings
) {
  return settings.negativePrompt ===
    DEFAULT_NEGATIVE_PROMPT
    ? "default"
    : "custom";
}

export class TelegramT2VResetService {
  constructor(
    private readonly chatId:
      string,

    private readonly workerName:
      string,

    private readonly profile:
      T2VProfileService,

    private readonly settings:
      T2VSettingsRepository,

    private readonly pending:
      T2VResetPendingRepository,

    private readonly confirmSeconds =
      60,

    private readonly maxInvalid =
      3
  ) {}

  private targetFor(
    current: T2VSettings,
    scope: ResetScope
  ): T2VSettings {
    if (scope === "all") {
      return {
        ...DEFAULT_T2V_SETTINGS
      };
    }

    return {
      ...current,
      aspect:
        DEFAULT_T2V_SETTINGS.aspect,
      quality:
        DEFAULT_T2V_SETTINGS.quality,
      durationSeconds:
        DEFAULT_T2V_SETTINGS.durationSeconds,
      enhance:
        DEFAULT_T2V_SETTINGS.enhance
    };
  }

  private coreChanges(
    current: T2VSettings,
    target: T2VSettings
  ) {
    const lines: string[] = [];

    if (
      current.aspect !==
      target.aspect
    ) {
      lines.push(
        `<b>Aspect</b> · ⦗${escapeHtml(
          current.aspect
        )}⦘ → ⦗${escapeHtml(
          target.aspect
        )}⦘`
      );
    }

    if (
      current.quality !==
      target.quality
    ) {
      lines.push(
        `<b>Quality</b> · ${escapeHtml(
          displayQuality(
            current.quality
          )
        )} → ${escapeHtml(
          displayQuality(
            target.quality
          )
        )}`
      );
    }

    if (
      current.durationSeconds !==
      target.durationSeconds
    ) {
      lines.push(
        `<b>Duration</b> · ${current.durationSeconds}s → ${target.durationSeconds}s`
      );
    }

    if (
      current.enhance !==
      target.enhance
    ) {
      lines.push(
        `<b>Enhance</b> · ${
          current.enhance
            ? "ON"
            : "OFF"
        } → ${
          target.enhance
            ? "ON"
            : "OFF"
        }`
      );
    }

    return lines;
  }

  private advancedChanges(
    current: T2VSettings,
    target: T2VSettings
  ) {
    const lines: string[] = [];

    if (current.fps !== target.fps) {
      lines.push(
        `<b>FPS</b> · ${current.fps} → ${target.fps}`
      );
    }

    if (current.seed !== target.seed) {
      lines.push(
        `<b>Stage1</b> · ${escapeHtml(
          seedValue(current.seed)
        )} → ${escapeHtml(
          seedValue(target.seed)
        )}`
      );
    }

    if (current.seed2 !== target.seed2) {
      lines.push(
        `<b>Stage2</b> · ${escapeHtml(
          seedValue(current.seed2)
        )} → ${escapeHtml(
          seedValue(target.seed2)
        )}`
      );
    }

    if (
      current.negativePrompt !==
      target.negativePrompt
    ) {
      lines.push(
        `<b>Prompt ( − )</b> · ${negativeState(
          current
        )} → ${negativeState(
          target
        )}`
      );
    }

    if (
      current.megapixelsOverride !==
      target.megapixelsOverride
    ) {
      lines.push(
        `<b>Megapixels</b> · ${effectiveMegapixels(
          current
        ).toFixed(1)} MP → ${effectiveMegapixels(
          target
        ).toFixed(1)} MP`
      );
    }

    if (
      current.sampler !==
      target.sampler
    ) {
      lines.push(
        `<b>Sampler</b> · ${escapeHtml(
          current.sampler
        )} → ${escapeHtml(
          target.sampler
        )}`
      );
    }

    if (current.cfg !== target.cfg) {
      lines.push(
        `<b>Guidance</b> · ${current.cfg.toFixed(
          1
        )} → ${target.cfg.toFixed(1)}`
      );
    }

    return lines;
  }

  private confirmationHtml(
    current: T2VSettings,
    target: T2VSettings,
    scope: ResetScope
  ) {
    const dev =
      scope === "all";

    const blocks: string[] = [];
    const core =
      this.coreChanges(
        current,
        target
      );

    if (core.length > 0) {
      blocks.push(
        section("core", core)
      );
    }

    if (dev) {
      const advanced =
        this.advancedChanges(
          current,
          target
        );

      if (advanced.length > 0) {
        blocks.push(
          section(
            "advanced",
            advanced
          )
        );
      }
    }

    return (
      `${pageTitle(dev)}\n` +
      `<b>${escapeHtml(
        this.workerName
      )}</b>\n` +
      `└ <b><i>${escapeHtml(
        T2V_TOOL
      )}</i></b>\n` +
      `${blocks.join("\n")}\n` +
      `<b><i>Reset these settings? Type</i></b> ` +
      `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b>`
    );
  }

  async begin(
    dev: boolean
  ) {
    const scope: ResetScope =
      dev
        ? "all"
        : "core";

    const current =
      await this.profile.get();

    const target =
      this.targetFor(
        current,
        scope
      );

    const changed = [
      ...this.coreChanges(
        current,
        target
      ),
      ...(dev
        ? this.advancedChanges(
            current,
            target
          )
        : [])
    ];

    if (changed.length === 0) {
      await this.pending.remove(
        this.chatId
      );

      return `<b><i>Settings already at default.</i></b>`;
    }

    await this.pending.begin({
      chatId:
        this.chatId,
      scope,
      currentSettings:
        current,
      targetSettings:
        target,
      expiresAt:
        new Date(
          Date.now() +
          this.confirmSeconds *
          1000
        )
    });

    return this.confirmationHtml(
      current,
      target,
      scope
    );
  }

  async expireDue() {
    return this.pending.expireDue(
      this.chatId
    );
  }

  async hasPending() {
    await this.expireDue();

    return (
      await this.pending.get(
        this.chatId
      )
    ) !== null;
  }

  async abandonPendingForCommand() {
    await this.pending.remove(
      this.chatId
    );
  }

  async handlePlainText(
    text: string
  ): Promise<string | null> {
    await this.expireDue();

    const state =
      await this.pending.get(
        this.chatId
      );

    if (!state) {
      return null;
    }

    const answer =
      text.trim().toLowerCase();

    if (answer === "no") {
      await this.pending.remove(
        this.chatId
      );

      return `<b><i>Reset cancelled.</i></b>`;
    }

    if (answer === "yes") {
      const target =
        normalizeStoredT2VSettings(
          state.targetSettings
        );

      await this.settings.save(
        T2V_PROFILE_ID,
        T2V_TOOL,
        target
      );

      await this.pending.remove(
        this.chatId
      );

      return state.scope === "all"
        ? `<b><i>All settings reset.</i></b>`
        : `<b><i>Core settings reset.</i></b>`;
    }

    const updated =
      await this.pending
        .incrementInvalid(
          this.chatId
        );

    if (!updated) {
      return null;
    }

    if (
      updated.invalidAttempts >=
      this.maxInvalid
    ) {
      await this.pending.remove(
        this.chatId
      );

      return `<b><i>Reset aborted after 3 invalid responses.</i></b>`;
    }

    return (
      `<b>Invalid response!</b> ` +
      `<b><i>Type</i></b> ` +
      `<b>[</b> <code>yes</code> <b>/</b> <code>no</code> <b>]</b> ` +
      `<b><i>(Attempt · ${updated.invalidAttempts}/${this.maxInvalid})</i></b>`
    );
  }
}
