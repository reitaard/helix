import {
  ASPECT_OPTIONS,
  DEFAULT_NEGATIVE_PROMPT,
  FPS_OPTIONS,
  T2V_TOOL,
  displayQuality,
  effectiveMegapixels
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

function normalizedKey(
  raw: string
) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

function coreKey(
  raw: string
): T2VCoreSetting | null {
  switch (normalizedKey(raw)) {
    case "asp":
    case "aspect":
      return "asp";

    case "qual":
    case "quality":
      return "qual";

    case "time":
    case "duration":
      return "time";

    case "enh":
    case "enhance":
      return "enh";

    default:
      return null;
  }
}

function devKey(
  raw: string
): T2VDevSetting | null {
  switch (normalizedKey(raw)) {
    case "fps":
      return "fps";

    case "seed":
    case "seed1":
    case "stage1":
    case "stage1seed":
      return "seed";

    case "seed2":
    case "stage2":
    case "stage2seed":
      return "seed2";

    case "neg":
    case "negative":
    case "negativeprompt":
      return "neg";

    case "mp":
    case "megapixel":
    case "megapixels":
      return "mp";

    case "samp":
    case "sampler":
      return "samp";

    case "cfg":
    case "guidance":
      return "cfg";

    default:
      return null;
  }
}

type ResolvedSetting =
  | {
      kind: "core";
      key: T2VCoreSetting;
    }
  | {
      kind: "dev";
      key: T2VDevSetting;
    };

function resolveSetting(
  raw: string,
  dev: boolean
): ResolvedSetting | null {
  const core = coreKey(raw);

  if (core) {
    return {
      kind: "core",
      key: core
    };
  }

  if (!dev) {
    return null;
  }

  const advanced = devKey(raw);

  return advanced
    ? {
        kind: "dev",
        key: advanced
      }
    : null;
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
  const safe = escapeHtml(value);

  return active
    ? `<u>${safe}</u>`
    : safe;
}

function sectionHeading(
  value: string
) {
  return (
    `<b><i>• ${escapeHtml(
      value.toLowerCase()
    )} •</i></b>`
  );
}

function quoteBlock(
  lines: string[],
  options: {
    heading?: string;
    expandable?: boolean;
  } = {}
) {
  const body = [
    options.heading
      ? sectionHeading(options.heading)
      : null,
    ...lines
  ]
    .filter(
      (value): value is string =>
        value !== null
    )
    .join("\n");

  return (
    `<blockquote${
      options.expandable
        ? " expandable"
        : ""
    }>${body}</blockquote>`
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

function aspectLabel(
  settings: T2VSettings
) {
  return (
    ASPECT_OPTIONS.find(
      option =>
        option.ratio === settings.aspect
    )?.label ?? settings.aspect
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
    `${escapeHtml(key)}` +
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
    return (
      `asp<b>.Aspect : ` +
      `⦗${escapeHtml(settings.aspect)}⦘</b> ` +
      `<b><i>(${escapeHtml(
        aspectLabel(settings)
      )})</i></b>`
    );
  }

  private qualityRow(
    settings: T2VSettings
  ) {
    return (
      `qual<b>.Quality : ` +
      `${qualityChoices(settings)}</b>`
    );
  }

  private durationRow(
    settings: T2VSettings
  ) {
    return (
      `time<b>.Duration : ` +
      `(${settings.durationSeconds})s</b> ` +
      `<b><i>(Max=10s)</i></b>`
    );
  }

  private enhanceRow(
    settings: T2VSettings
  ) {
    return (
      `enh<b>.Enhance : ` +
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
      `fps<b>.FPS : ` +
      `${fpsChoices(settings)}</b>`
    );
  }

  private megapixelsRow(
    settings: T2VSettings
  ) {
    const context =
      settings.megapixelsOverride === null
        ? displayQuality(settings.quality)
        : "manual";

    return (
      `mp<b>.Megapixels : ` +
      `${effectiveMegapixels(
        settings
      ).toFixed(1)} MP</b> ` +
      `<b><i>(${escapeHtml(context)})</i></b>`
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

    const blocks = [
      quoteBlock(
        this.coreRows(settings),
        { heading: "core" }
      )
    ];

    if (dev) {
      blocks.push(
        quoteBlock(
          this.advancedRows(settings),
          { heading: "advanced" }
        )
      );
    }

    return (
      `${pageTitle(
        "T2V / SETTINGS",
        dev
      )}\n` +
      `${this.workerBlock()}\n` +
      `${blocks.join("\n")}\n` +
      `<i>Inspect</i> · ` +
      `<code>/t2v set ${
        dev ? "-dev " : ""
      }&lt;setting&gt;</code>`
    );
  }

  private invalidSettingHtml(
    dev: boolean
  ) {
    return (
      `<b>Unknown setting</b>\n` +
      (
        dev
          ? `asp · qual · time · enh · fps · seed · seed2 · neg · mp · samp · cfg`
          : `asp · qual · time · enh`
      )
    );
  }

  private devRequiredHtml() {
    return `<b>Dev access required.</b>`;
  }

  private detailHeader(
    name: string,
    dev = false
  ) {
    return (
      `${pageTitle(
        `${name}.T2V`,
        dev
      )}\n` +
      `${this.workerBlock()}\n`
    );
  }

  private async coreHelp(
    key: T2VCoreSetting,
    settings: T2VSettings,
    dev = false
  ) {
    if (key === "asp") {
      const options = ASPECT_OPTIONS.map(
        option => {
          const label =
            option.ratio === settings.aspect
              ? `<b>${escapeHtml(option.label)}</b>`
              : escapeHtml(option.label);

          return (
            `<code>${escapeHtml(
              option.ratio
            )}</code> · ${label}`
          );
        }
      );

      return (
        `${this.detailHeader("ASPECT", dev)}` +
        `<b>Aspect : ⦗${escapeHtml(
          settings.aspect
        )}⦘</b> ` +
        `<b><i>(${escapeHtml(
          aspectLabel(settings)
        )})</i></b>\n` +
        `${quoteBlock(
          options,
          {
            heading: "options",
            expandable: true
          }
        )}\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set ${
          dev ? "-dev " : ""
        }asp &lt;ratio&gt;</code>`
      );
    }

    if (key === "qual") {
      const choices = [
        ["Low", "0.5 MP", settings.quality === "low"],
        ["Standard", "0.9 MP", settings.quality === "standard"],
        ["High", "1.2 MP", settings.quality === "high"]
      ] as const;

      const options = choices.map(
        ([name, mp, active]) =>
          `${
            active
              ? `<u><b>${name}</b></u>`
              : `<b>${name}</b>`
          } · ${mp}`
      );

      return (
        `${this.detailHeader("QUALITY", dev)}` +
        `<b>Quality : ${qualityChoices(
          settings
        )}</b>\n` +
        `${quoteBlock(
          options,
          { heading: "options" }
        )}\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set ${
          dev ? "-dev " : ""
        }qual &lt;value&gt;</code>`
      );
    }

    if (key === "time") {
      const frames =
        settings.durationSeconds *
        settings.fps +
        1;

      return (
        `${this.detailHeader("DURATION", dev)}` +
        `${quoteBlock([
          `<b>Duration : (${settings.durationSeconds})s</b> <b><i>(Max=10s)</i></b>`,
          `<b>FPS : ${settings.fps}</b>`,
          `<b>Frames : ${frames}</b>`
        ])}\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set ${
          dev ? "-dev " : ""
        }time &lt;seconds&gt;</code>`
      );
    }

    return (
      `${this.detailHeader("ENHANCE", dev)}` +
      `<b>Enhance : [ ${
        settings.enhance ? "ON" : "OFF"
      } ]</b>${
        settings.enhance
          ? ""
          : ` <b><i>(default)</i></b>`
      }\n` +
      `${quoteBlock([
        `${selected("ON", settings.enhance)} / ` +
        `${selected("OFF", !settings.enhance)}`
      ], { heading: "options" })}\n` +
      `<i>Set</i> · ` +
      `<code>/t2v set ${
        dev ? "-dev " : ""
      }enh &lt;on|off&gt;</code>`
    );
  }

  private async devHelp(
    key: T2VDevSetting,
    settings: T2VSettings
  ) {
    if (key === "fps") {
      return (
        `${this.detailHeader("FPS", true)}` +
        `<b>FPS : ${settings.fps}</b>\n` +
        `${quoteBlock([
          fpsChoices(settings)
        ], { heading: "options" })}\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev fps &lt;value&gt;</code>`
      );
    }

    if (
      key === "seed" ||
      key === "seed2"
    ) {
      const stage = key === "seed" ? "1" : "2";
      const current =
        key === "seed"
          ? settings.seed
          : settings.seed2;

      return (
        `${this.detailHeader(
          `SEED ${stage}`,
          true
        )}` +
        `${quoteBlock([
          `<b>Stage${stage} : ${escapeHtml(
            seedValue(current)
          )}</b>`,
          `<b>Range</b> · <code>0-${Number.MAX_SAFE_INTEGER}</code>`,
          `<b>Special</b> · <code>random</code>`
        ])}\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev ${key} &lt;value&gt;</code>`
      );
    }

    if (key === "neg") {
      return (
        `${this.detailHeader("NEGATIVE", true)}` +
        `${quoteBlock([
          `<b>Prompt ( − ) : ${escapeHtml(
            negativeState(settings)
          )}</b>`,
          escapeHtml(settings.negativePrompt)
        ], { expandable: true })}\n` +
        `<i>Reset</i> · <code>default</code>\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev neg &lt;text&gt;</code>`
      );
    }

    if (key === "mp") {
      const context =
        settings.megapixelsOverride === null
          ? displayQuality(settings.quality)
          : "manual";

      return (
        `${this.detailHeader(
          "MEGAPIXELS",
          true
        )}` +
        `${quoteBlock([
          `<b>Megapixels : ${effectiveMegapixels(
            settings
          ).toFixed(1)} MP</b> <b><i>(${escapeHtml(
            context
          )})</i></b>`,
          `<b>Range</b> · <code>0.1-2.0 MP</code>`,
          `<b>Step</b> · <code>0.1</code>`,
          `<b>Auto</b> · <code>default</code>`
        ])}\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev mp &lt;value&gt;</code>`
      );
    }

    if (key === "samp") {
      const options =
        await this.profile.samplerOptions();

      const optionLines = options.map(
        option =>
          `<code>${escapeHtml(option)}</code>`
      );

      return (
        `${this.detailHeader(
          "SAMPLER",
          true
        )}` +
        `<b>Sampler : ${escapeHtml(
          settings.sampler
        )}</b>\n` +
        `${quoteBlock(
          optionLines,
          {
            heading: "options",
            expandable: true
          }
        )}\n` +
        `<i>Set</i> · ` +
        `<code>/t2v set -dev samp &lt;value&gt;</code>`
      );
    }

    return (
      `${this.detailHeader(
        "GUIDANCE",
        true
      )}` +
      `${quoteBlock([
        `<b>Guidance : ${settings.cfg.toFixed(1)}</b>`,
        `<b>Range</b> · <code>0-100</code>`,
        `<b>Step</b> · <code>0.1</code>`,
        `<b>Applies</b> · Stage1 + Stage2 · Video + Audio`
      ])}\n` +
      `<i>Set</i> · ` +
      `<code>/t2v set -dev cfg &lt;value&gt;</code>`
    );
  }

  async help(
    rawKey: string,
    dev = false
  ) {
    const settings =
      await this.profile.get();

    const resolved =
      resolveSetting(rawKey, dev);

    if (!resolved) {
      if (!dev && devKey(rawKey)) {
        return this.devRequiredHtml();
      }

      return this.invalidSettingHtml(dev);
    }

    if (resolved.kind === "core") {
      return this.coreHelp(
        resolved.key,
        settings,
        dev
      );
    }

    return this.devHelp(
      resolved.key,
      settings
    );
  }

  private savedCoreHtml(
    key: T2VCoreSetting,
    settings: T2VSettings
  ) {
    switch (key) {
      case "asp":
        return (
          `<b>[ Aspect : ⦗${escapeHtml(
            settings.aspect
          )}⦘</b> ` +
          `<b><i>(${escapeHtml(
            aspectLabel(settings)
          )})</i></b> ` +
          `<b>]</b>`
        );

      case "qual":
        return (
          `<b>[ Quality : ${escapeHtml(
            displayQuality(settings.quality)
          )} ]</b>`
        );

      case "time":
        return (
          `<b>[ Duration : (${settings.durationSeconds})s ]</b>`
        );

      case "enh":
        return (
          `<b>[ Enhance : ${
            settings.enhance
              ? "ON"
              : "OFF"
          } ]</b>`
        );
    }
  }

  private savedDevHtml(
    key: T2VDevSetting,
    settings: T2VSettings
  ) {
    switch (key) {
      case "fps":
        return (
          `<b>[ FPS : ${settings.fps} ]</b>`
        );

      case "seed":
        return (
          `<b>[ Stage1 : ${escapeHtml(
            seedValue(settings.seed)
          )} ]</b>`
        );

      case "seed2":
        return (
          `<b>[ Stage2 : ${escapeHtml(
            seedValue(settings.seed2)
          )} ]</b>`
        );

      case "neg":
        return (
          `<b>[ Prompt ( − ) : ${escapeHtml(
            negativeState(settings)
          )} ]</b>`
        );

      case "mp": {
        const context =
          settings.megapixelsOverride === null
            ? displayQuality(settings.quality)
            : "manual";

        return (
          `<b>[ Megapixels : ${effectiveMegapixels(
            settings
          ).toFixed(1)} MP</b> ` +
          `<b><i>(${escapeHtml(context)})</i></b> ` +
          `<b>]</b>`
        );
      }

      case "samp":
        return (
          `<b>[ Sampler : ${escapeHtml(
            settings.sampler
          )} ]</b>`
        );

      case "cfg":
        return (
          `<b>[ Guidance : ${settings.cfg.toFixed(1)} ]</b>`
        );
    }
  }

  async set(
    rawKey: string,
    rawValue: string,
    dev = false
  ) {
    const resolved =
      resolveSetting(rawKey, dev);

    if (!resolved) {
      if (!dev && devKey(rawKey)) {
        return this.devRequiredHtml();
      }

      return this.invalidSettingHtml(dev);
    }

    try {
      if (resolved.kind === "core") {
        const settings =
          await this.profile.setCore(
            resolved.key,
            rawValue
          );

        return this.savedCoreHtml(
          resolved.key,
          settings
        );
      }

      const settings =
        await this.profile.setDev(
          resolved.key,
          rawValue
        );

      return this.savedDevHtml(
        resolved.key,
        settings
      );
    }
    catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return (
        `<b>Invalid value.</b>\n` +
        `<i>${escapeHtml(message)}</i>\n` +
        `<i>Inspect</i> · ` +
        `<code>/t2v set ${
          dev ? "-dev " : ""
        }${escapeHtml(rawKey)}</code>`
      );
    }
  }
}
