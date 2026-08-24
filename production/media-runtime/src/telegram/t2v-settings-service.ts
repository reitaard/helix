import {
  ASPECT_OPTIONS,
  DEFAULT_NEGATIVE_PROMPT,
  FPS_OPTIONS,
  T2V_TOOL,
  effectiveMegapixels,
  displayQuality
} from "../t2v/settings.js";

import type {
  T2VSettings
} from "../t2v/settings.js";

import {
  T2VProfileService
} from "../t2v/profile-service.js";

import type {
  T2VCoreSetting,
  T2VDevSetting
} from "../t2v/profile-service.js";

import {
  escapeHtml
} from "./presentation.js";

function coreKey(
  raw: string
): T2VCoreSetting | null {
  switch (
    raw.trim().toLowerCase()
  ) {
    case "asp":
    case "qual":
    case "time":
    case "enh":
      return raw
        .trim()
        .toLowerCase() as
        T2VCoreSetting;

    default:
      return null;
  }
}

function devKey(
  raw: string
): T2VDevSetting | null {
  const value =
    raw.trim().toLowerCase();

  if (value === "seed1") {
    return "seed";
  }

  switch (value) {
    case "fps":
    case "seed":
    case "seed2":
    case "neg":
    case "mp":
    case "samp":
    case "cfg":
      return value;

    default:
      return null;
  }
}

function pageTitle(
  value: string,
  dev = false
) {
  return (
    `<b>[ ${escapeHtml(value)} ]</b>` +
    (
      dev
        ? ` (<b><i>dev</i></b>)`
        : ""
    )
  );
}

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

function aspectLabel(
  settings: T2VSettings
) {
  return (
    ASPECT_OPTIONS.find(
      option =>
        option.ratio ===
        settings.aspect
    )?.label ??
    settings.aspect
  );
}

function qualityChoices(
  settings: T2VSettings
) {
  return [
    selected(
      "Low",
      settings.quality === "low"
    ),
    selected(
      "Standard",
      settings.quality === "standard"
    ),
    selected(
      "High",
      settings.quality === "high"
    )
  ].join(" / ");
}

function fpsChoices(
  settings: T2VSettings
) {
  return FPS_OPTIONS.map(
    value =>
      selected(
        String(value),
        settings.fps === value
      )
  ).join(" / ");
}

function settingRow(
  key: string,
  text: string
) {
  return (
    `<code>${escapeHtml(key)}</code>` +
    `<b>.${text}</b>`
  );
}

export class TelegramT2VSettingsService {
  constructor(
    private readonly profile:
      T2VProfileService,

    private readonly workerName =
      "Christopher Nolan"
  ) {}

  private workerBlock() {
    return (
      `<b>Worker</b> <b>&gt;</b> ` +
      `<b>${escapeHtml(
        this.workerName
      )}</b>\n` +
      `└ <b><i>${escapeHtml(
        T2V_TOOL
      )}</i></b>`
    );
  }

  private aspectRow(
    settings: T2VSettings
  ) {
    return settingRow(
      "asp",
      `Aspect : ⦗${escapeHtml(
        settings.aspect
      )}⦘</b> <b><i>(${escapeHtml(
        aspectLabel(settings)
      )})</i></b><b>`
    );
  }

  private qualityRow(
    settings: T2VSettings
  ) {
    return (
      `<code>qual</code><b>.Quality : ` +
      `${qualityChoices(settings)}</b>`
    );
  }

  private durationRow(
    settings: T2VSettings
  ) {
    return (
      `<code>time</code><b>.Duration : ` +
      `(${settings.durationSeconds})s</b> ` +
      `<b><i>(Max=10s)</i></b>`
    );
  }

  private enhanceRow(
    settings: T2VSettings
  ) {
    return (
      `<code>enh</code><b>.Enhance : ` +
      `[ ${settings.enhance ? "ON" : "OFF"} ]</b>` +
      (
        settings.enhance
          ? ""
          : ` <b><i>(default)</i></b>`
      )
    );
  }

  private fpsRow(
    settings: T2VSettings
  ) {
    return (
      `<code>fps</code><b>.FPS : ` +
      `${fpsChoices(settings)}</b>`
    );
  }

  private megapixelsRow(
    settings: T2VSettings
  ) {
    const context =
      settings.megapixelsOverride ===
      null
        ? displayQuality(
            settings.quality
          )
        : "manual";

    return (
      `<code>mp</code><b>.Megapixels : ` +
      `${effectiveMegapixels(
        settings
      ).toFixed(1)} MP</b> ` +
      `<b><i>(${escapeHtml(
        context
      )})</i></b>`
    );
  }

  private coreRows(
    settings: T2VSettings
  ) {
    return [
      this.aspectRow(settings),
      this.qualityRow(settings),
      this.durationRow(settings),
      this.enhanceRow(settings)
    ];
  }

  private advancedRows(
    settings: T2VSettings
  ) {
    return [
      this.fpsRow(settings),
      settingRow(
        "seed",
        `Stage1 : ${escapeHtml(
          seedValue(settings.seed)
        )}`
      ),
      settingRow(
        "seed2",
        `Stage2 : ${escapeHtml(
          seedValue(settings.seed2)
        )}`
      ),
      settingRow(
        "neg",
        `Prompt ( − ) : ${escapeHtml(
          negativeState(settings)
        )}`
      ),
      this.megapixelsRow(settings),
      settingRow(
        "samp",
        `Sampler : ${escapeHtml(
          settings.sampler
        )}`
      ),
      settingRow(
        "cfg",
        `Guidance : ${settings.cfg.toFixed(1)}`
      )
    ];
  }

  async panel(
    dev = false
  ) {
    const settings =
      await this.profile.get();

    const core =
      this.coreRows(settings);

    if (!dev) {
      return (
        `${pageTitle("T2V / SETTINGS")}\n\n` +
        `${this.workerBlock()}\n\n` +
        `▷ <b>CORE</b>\n` +
        core.join("\n") +
        `\n\n<i>Inspect</i> · ` +
        `<code>/t2v set &lt;setting&gt;</code>`
      );
    }

    return (
      `${pageTitle(
        "T2V / SETTINGS",
        true
      )}\n\n` +
      `${this.workerBlock()}\n\n` +
      `▷ <b>CORE</b>\n` +
      core.join("\n") +
      `\n\n▷ <b>ADVANCED</b>\n` +
      this.advancedRows(
        settings
      ).join("\n") +
      `\n\n<i>Inspect</i> · ` +
      `<code>/t2v set -dev &lt;setting&gt;</code>`
    );
  }

  private invalidSettingHtml(
    dev: boolean
  ) {
    return (
      `<b>Unknown setting</b>\n` +
      (
        dev
          ? `<code>fps</code> · <code>seed</code> · <code>seed2</code> · ` +
            `<code>neg</code> · <code>mp</code> · <code>samp</code> · <code>cfg</code>`
          : `<code>asp</code> · <code>qual</code> · <code>time</code> · <code>enh</code>`
      )
    );
  }

  private detailHeader(
    name: string,
    dev = false
  ) {
    return (
      `${pageTitle(
        `${name}.T2V`,
        dev
      )}\n\n` +
      `${this.workerBlock()}\n`
    );
  }

  async help(
    rawKey: string,
    dev = false
  ) {
    const settings =
      await this.profile.get();

    if (!dev) {
      const key =
        coreKey(rawKey);

      if (!key) {
        return this.invalidSettingHtml(
          false
        );
      }

      if (key === "asp") {
        const options =
          ASPECT_OPTIONS.map(
            option => {
              const label =
                option.ratio ===
                settings.aspect
                  ? `<b>${escapeHtml(
                      option.label
                    )}</b>`
                  : escapeHtml(
                      option.label
                    );

              return (
                `<code>${escapeHtml(
                  option.ratio
                )}</code> · ${label}`
              );
            }
          ).join("\n");

        return (
          `${this.detailHeader(
            "ASPECT"
          )}` +
          `<b>Aspect : ⦗${escapeHtml(
            settings.aspect
          )}⦘</b> ` +
          `<b><i>(${escapeHtml(
            aspectLabel(settings)
          )})</i></b>\n\n` +
          `<blockquote expandable>` +
          `<b><i>• options •</i></b>\n` +
          `${options}</blockquote>\n\n` +
          `<i>Set</i> · ` +
          `<code>/t2v set asp &lt;ratio&gt;</code>`
        );
      }

      if (key === "qual") {
        const choices = [
          [
            "Low",
            "0.5 MP",
            settings.quality === "low"
          ],
          [
            "Standard",
            "0.9 MP",
            settings.quality === "standard"
          ],
          [
            "High",
            "1.2 MP",
            settings.quality === "high"
          ]
        ] as const;

        const options =
          choices.map(
            ([name, mp, active]) =>
              `${active ? `<u><b>${name}</b></u>` : `<b>${name}</b>`} · ${mp}`
          ).join("\n");

        return (
          `${this.detailHeader(
            "QUALITY"
          )}` +
          `<b>Quality : ${qualityChoices(
            settings
          )}</b>\n\n` +
          `▷ <b>OPTIONS</b>\n` +
          `${options}\n\n` +
          `<i>Set</i> · ` +
          `<code>/t2v set qual &lt;value&gt;</code>`
        );
      }

      if (key === "time") {
        const frames =
          settings.durationSeconds *
          settings.fps +
          1;

        return (
          `${this.detailHeader(
            "DURATION"
          )}` +
          `<b>Duration : (${settings.durationSeconds})s</b> ` +
          `<b><i>(Max=10s)</i></b>\n` +
          `<b>FPS : ${settings.fps}</b>\n` +
          `<b>Frames : ${frames}</b>\n\n` +
          `<i>Set</i> · ` +
          `<code>/t2v set time &lt;seconds&gt;</code>`
        );
      }

      return (
        `${this.detailHeader(
          "ENHANCE"
        )}` +
        `<b>Enhance : [ ${
          settings.enhance
            ? "ON"
            : "OFF"
        } ]</b>${
          settings.enhance
            ? ""
            : ` <b><i>(default)</i></b>`
        }\n\n` +
        `▷ <b>OPTIONS</b>\n` +
        `${selected(
          "ON",
          settings.enhance
        )} / ${selected(
          "OFF",
          !settings.enhance
        )}\n\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set enh &lt;on|off&gt;</code>`
      );
    }

    const key =
      devKey(rawKey);

    if (!key) {
      return this.invalidSettingHtml(
        true
      );
    }

    if (key === "fps") {
      return (
        `${this.detailHeader(
          "FPS",
          true
        )}` +
        `<b>FPS : ${fpsChoices(
          settings
        )}</b>\n\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev fps &lt;value&gt;</code>`
      );
    }

    if (
      key === "seed" ||
      key === "seed2"
    ) {
      const stage =
        key === "seed"
          ? "1"
          : "2";

      const current =
        key === "seed"
          ? settings.seed
          : settings.seed2;

      return (
        `${this.detailHeader(
          `SEED ${stage}`,
          true
        )}` +
        `<b>Stage${stage} : ${escapeHtml(
          seedValue(current)
        )}</b>\n` +
        `<b>Range</b> · ` +
        `<code>0-${Number.MAX_SAFE_INTEGER}</code>\n` +
        `<b>Special</b> · <code>random</code>\n\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev ${key} &lt;value&gt;</code>`
      );
    }

    if (key === "neg") {
      return (
        `${this.detailHeader(
          "NEGATIVE",
          true
        )}` +
        `<b>Prompt ( − ) : ${escapeHtml(
          negativeState(settings)
        )}</b>\n\n` +
        `<blockquote expandable>${escapeHtml(
          settings.negativePrompt
        )}</blockquote>\n\n` +
        `<i>Reset</i> · <code>default</code>\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev neg &lt;text&gt;</code>`
      );
    }

    if (key === "mp") {
      const context =
        settings.megapixelsOverride ===
        null
          ? displayQuality(
              settings.quality
            )
          : "manual";

      return (
        `${this.detailHeader(
          "MEGAPIXELS",
          true
        )}` +
        `<b>Megapixels : ${effectiveMegapixels(
          settings
        ).toFixed(1)} MP</b> ` +
        `<b><i>(${escapeHtml(
          context
        )})</i></b>\n` +
        `<b>Range</b> · <code>0.1-2.0 MP</code>\n` +
        `<b>Step</b> · <code>0.1</code>\n` +
        `<b>Auto</b> · <code>default</code>\n\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev mp &lt;value&gt;</code>`
      );
    }

    if (key === "samp") {
      const options =
        await this.profile
          .samplerOptions();

      const optionLines =
        options.map(
          option => {
            const value =
              `<code>${escapeHtml(
                option
              )}</code>`;

            return option ===
              settings.sampler
              ? `<u>${value}</u>`
              : value;
          }
        ).join("\n");

      return (
        `${this.detailHeader(
          "SAMPLER",
          true
        )}` +
        `<b>Sampler : ${escapeHtml(
          settings.sampler
        )}</b>\n\n` +
        `<blockquote expandable>` +
        `<b><i>• options •</i></b>\n` +
        `${optionLines}</blockquote>\n\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev samp &lt;value&gt;</code>`
      );
    }

    return (
      `${this.detailHeader(
        "GUIDANCE",
        true
      )}` +
      `<b>Guidance : ${settings.cfg.toFixed(1)}</b>\n` +
      `<b>Range</b> · <code>0-100</code>\n` +
      `<b>Step</b> · <code>0.1</code>\n` +
      `<b>Applies</b> · Stage1 + Stage2 · Video + Audio\n\n` +
      `<i>Set</i> · ` +
      `<code>/t2v set -dev cfg &lt;value&gt;</code>`
    );
  }

  async set(
    rawKey: string,
    rawValue: string,
    dev = false
  ) {
    const key =
      dev
        ? devKey(rawKey)
        : coreKey(rawKey);

    if (!key) {
      return this.invalidSettingHtml(
        dev
      );
    }

    try {
      const settings =
        dev
          ? await this.profile.setDev(
              key as T2VDevSetting,
              rawValue
            )
          : await this.profile.setCore(
              key as T2VCoreSetting,
              rawValue
            );

      let row: string;

      if (!dev) {
        switch (key) {
          case "asp":
            row = this.aspectRow(
              settings
            );
            break;
          case "qual":
            row = this.qualityRow(
              settings
            );
            break;
          case "time":
            row = this.durationRow(
              settings
            );
            break;
          case "enh":
            row = this.enhanceRow(
              settings
            );
            break;
          default:
            row = rawKey;
        }
      }
      else {
        switch (key) {
          case "fps":
            row = this.fpsRow(
              settings
            );
            break;
          case "seed":
            row = settingRow(
              "seed",
              `Stage1 : ${escapeHtml(
                seedValue(settings.seed)
              )}`
            );
            break;
          case "seed2":
            row = settingRow(
              "seed2",
              `Stage2 : ${escapeHtml(
                seedValue(settings.seed2)
              )}`
            );
            break;
          case "neg":
            row = settingRow(
              "neg",
              `Prompt ( − ) : ${escapeHtml(
                negativeState(settings)
              )}`
            );
            break;
          case "mp":
            row = this.megapixelsRow(
              settings
            );
            break;
          case "samp":
            row = settingRow(
              "samp",
              `Sampler : ${escapeHtml(
                settings.sampler
              )}`
            );
            break;
          case "cfg":
            row = settingRow(
              "cfg",
              `Guidance : ${settings.cfg.toFixed(1)}`
            );
            break;
          default:
            row = rawKey;
        }
      }

      return (
        `${row}\n\n` +
        `<b>[ SAVED ]</b>`
      );
    }
    catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return (
        `<b>Invalid value.</b>\n` +
        `<i>${escapeHtml(message)}</i>\n\n` +
        `<i>Inspect</i> · ` +
        `<code>/t2v set ${dev ? "-dev " : ""}${escapeHtml(rawKey)}</code>`
      );
    }
  }
}
