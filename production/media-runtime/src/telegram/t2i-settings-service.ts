import { T2I_ASPECT_OPTIONS, T2I_TOOL } from "../t2i/settings.js";
import type { T2ISettings } from "../t2i/settings.js";
import { T2IProfileService } from "../t2i/profile-service.js";
import { escapeHtml } from "./presentation.js";

function key(raw: string) { const value = raw.trim().toLowerCase().replace(/[\s._-]+/g, ""); return value === "asp" || value === "aspect" ? "asp" : value === "seed" ? "seed" : null; }
function seed(value: T2ISettings["seed"]) { return String(value); }
function aspectLabel(value: string) { return T2I_ASPECT_OPTIONS.find(option => option.ratio === value)?.label ?? value; }

export class TelegramT2ISettingsService {
  constructor(private readonly profile: T2IProfileService, private readonly workerName = "Annie Leibovitz") {}
  private workerBlock() { return `<b>Worker</b> <b>&gt;</b> <b>${escapeHtml(this.workerName)}</b>\n└ <b><i>${T2I_TOOL}</i></b>`; }
  async panel() { const settings = await this.profile.get(); return `<b>[ T2I / SETTINGS ]</b>\n${this.workerBlock()}\n<blockquote><b><i>• core •</i></b>\nasp<b>.Aspect : ⦗${escapeHtml(settings.aspect)}⦘</b> <b><i>(${escapeHtml(aspectLabel(settings.aspect))})</i></b>\nseed<b>.Seed : ${escapeHtml(seed(settings.seed))}</b></blockquote>\n<i>Inspect</i> · <code>/t2i set &lt;setting&gt;</code>`; }
  async help(raw: string) { const setting = key(raw); const settings = await this.profile.get(); if (!setting) return `<b>Unknown setting</b>\nasp · seed`;
    if (setting === "asp") return `<b>[ ASPECT.T2I ]</b>\n${this.workerBlock()}\n<b>Aspect : ⦗${escapeHtml(settings.aspect)}⦘</b>\n<blockquote expandable><b><i>• options •</i></b>\n${T2I_ASPECT_OPTIONS.map(option => `<code>${option.ratio}</code> · ${escapeHtml(option.label)}`).join("\n")}</blockquote>\n<i>Set</i> · <code>/t2i set asp &lt;ratio&gt;</code>`;
    return `<b>[ SEED.T2I ]</b>\n${this.workerBlock()}\n<blockquote><b>Seed : ${escapeHtml(seed(settings.seed))}</b>\n<b>Range</b> · <code>0-${Number.MAX_SAFE_INTEGER}</code>\n<b>Special</b> · <code>random</code></blockquote>\n<i>Set</i> · <code>/t2i set seed &lt;value&gt;</code>`; }
  async set(raw: string, value: string) { const setting = key(raw); if (!setting) return `<b>Unknown setting</b>\nasp · seed`; try { const settings = await this.profile.set(setting, value); return setting === "asp" ? `<b>[ Aspect : ⦗${escapeHtml(settings.aspect)}⦘ ]</b>` : `<b>[ Seed : ${escapeHtml(seed(settings.seed))} ]</b>`; } catch (error) { return `<b>Invalid value.</b>\n<i>${escapeHtml(error instanceof Error ? error.message : String(error))}</i>`; } }
}
