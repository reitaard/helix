import {
  T2I_ASPECT_OPTIONS,
  T2I_TOOL
} from "../t2i/settings.js";

import type {
  T2ISettings
} from "../t2i/settings.js";

import {
  T2IProfileService
} from "../t2i/profile-service.js";

import {
  escapeHtml
} from "./presentation.js";

function resolveKey(raw: string) {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");

  if (value === "asp" || value === "aspect") return "asp";
  return value === "seed" ? "seed" : null;
}

function aspectLabel(value: string) {
  return T2I_ASPECT_OPTIONS.find(
    option => option.ratio === value
  )?.label ?? value;
}

function seedValue(value: T2ISettings["seed"]) {
  return String(value);
}

export class TelegramT2ISettingsService {
  constructor(
    private readonly profile: T2IProfileService,
    private readonly workerName = "Annie Leibovitz"
  ) {}

  private workerBlock() {
    return (
      `<b>${escapeHtml(this.workerName)}</b>\n` +
      `└ <b><i>${T2I_TOOL}</i></b>`
    );
  }

  async panel() {
    const settings = await this.profile.get();

    return (
      `<b>[ T2I / SETTINGS ]</b>\n` +
      `${this.workerBlock()}\n` +
      `<blockquote><b><i>• core •</i></b>\n` +
      `asp<b>.Aspect : ⦗${escapeHtml(settings.aspect)}⦘</b> ` +
      `<b><i>(${escapeHtml(aspectLabel(settings.aspect))})</i></b>\n` +
      `seed<b>.Seed : ${escapeHtml(seedValue(settings.seed))}</b></blockquote>\n` +
      `<i>Inspect</i> · <code>/t2i set &lt;setting&gt;</code>`
    );
  }

  async help(raw: string) {
    const key = resolveKey(raw);
    const settings = await this.profile.get();

    if (!key) return `<b>Unknown setting</b>\nasp · seed`;

    if (key === "asp") {
      return (
        `<b>[ ASPECT.T2I ]</b>\n` +
        `${this.workerBlock()}\n` +
        `<b>Aspect : ⦗${escapeHtml(settings.aspect)}⦘</b>\n` +
        `<blockquote expandable><b><i>• options •</i></b>\n` +
        `${T2I_ASPECT_OPTIONS.map(option => `<code>${option.ratio}</code> · ${escapeHtml(option.label)}`).join("\n")}</blockquote>\n` +
        `<i>Set</i> · <code>/t2i set asp &lt;ratio&gt;</code>`
      );
    }

    return (
      `<b>[ SEED.T2I ]</b>\n` +
      `${this.workerBlock()}\n` +
      `<blockquote><b>Seed : ${escapeHtml(seedValue(settings.seed))}</b>\n` +
      `<b>Range</b> · <code>0-${Number.MAX_SAFE_INTEGER}</code>\n` +
      `<b>Special</b> · <code>random</code></blockquote>\n` +
      `<i>Set</i> · <code>/t2i set seed &lt;value&gt;</code>`
    );
  }

  async set(raw: string, value: string) {
    const key = resolveKey(raw);
    if (!key) return `<b>Unknown setting</b>\nasp · seed`;

    try {
      const settings = await this.profile.set(key, value);
      return key === "asp"
        ? `<b>[ Aspect : ⦗${escapeHtml(settings.aspect)}⦘ ]</b>`
        : `<b>[ Seed : ${escapeHtml(seedValue(settings.seed))} ]</b>`;
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `<b>Invalid value.</b>\n<i>${escapeHtml(message)}</i>`;
    }
  }
}
