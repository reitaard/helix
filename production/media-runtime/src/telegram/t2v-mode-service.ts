import {
  displayT2VMode,
  normalizeT2VMode,
  T2V_MODES
} from "../t2v/mode.js";

import {
  T2VModeService
} from "../t2v/mode-service.js";

import {
  T2V_TOOL
} from "../t2v/settings.js";

import {
  escapeHtml,
  profileTitle
} from "./presentation.js";

function selected(
  value: string,
  active: boolean
) {
  const safe =
    escapeHtml(value);

  return active
    ? `<u>${safe}</u>`
    : safe;
}

export class TelegramT2VModeService {
  constructor(
    private readonly modes:
      T2VModeService,

    private readonly workerName =
      "Christopher Nolan"
  ) {}

  private workerBlock() {
    return (
      `<b>${escapeHtml(
        this.workerName
      )}</b>\n` +
      `└ <b><i>${escapeHtml(
        T2V_TOOL
      )}</i></b>`
    );
  }

  async panel() {
    const mode =
      await this.modes.get();

    const options =
      T2V_MODES.map(
        value =>
          selected(
            displayT2VMode(value),
            value === mode
          )
      ).join("\n");

    return (
      `${profileTitle("Text2Video", "MODE")}\n` +
      `${this.workerBlock()}\n` +
      `<b>Current : ${escapeHtml(
        displayT2VMode(mode)
      )}</b>\n` +
      `<blockquote>` +
      `<b><i>• modes •</i></b>\n` +
      `${options}</blockquote>\n` +
      `<i>Set</i> · ` +
      `<code>/t2v mode &lt;mode&gt;</code>`
    );
  }

  async set(
    raw: string
  ) {
    const normalized =
      raw
        .trim()
        .toLowerCase();

    const candidate =
      normalized === "reset" ||
      normalized === "default"
        ? "manual"
        : normalized;

    if (
      !T2V_MODES.includes(
        candidate as
          typeof T2V_MODES[number]
      )
    ) {
      return (
        `<b>Unknown mode.</b>\n` +
        `<i>Available</i> · ` +
        T2V_MODES.map(
          value =>
            `<code>${value}</code>`
        ).join(" / ")
      );
    }

    const mode =
      normalizeT2VMode(
        candidate
      );

    await this.modes.set(mode);

    return (
      `<b>[ Mode : ${escapeHtml(
        displayT2VMode(mode)
      )} ]</b>`
    );
  }
}
