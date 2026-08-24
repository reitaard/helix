import {
  ASPECT_OPTIONS,
  DEFAULT_NEGATIVE_PROMPT,
  FPS_OPTIONS,
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
  escapeHtml,
  title
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

function settingsTitle(
  dev: boolean
) {
  return dev
    ? `${title("T2V SETTINGS")} <b>(dev)</b>`
    : title("T2V SETTINGS");
}

function boolState(
  value: boolean
) {
  return value
    ? "[ON]"
    : "[OFF]";
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

function line(
  key: string,
  label: string,
  value: string
) {
  return (
    `<code>${escapeHtml(key)}</code>  ` +
    `<b>${escapeHtml(label)}</b> · ` +
    `<b>${escapeHtml(value)}</b>`
  );
}

export class TelegramT2VSettingsService {
  constructor(
    private readonly profile:
      T2VProfileService
  ) {}

  async panel(
    dev = false
  ) {
    const settings =
      await this.profile.get();

    const core = [
      line(
        "asp",
        "Aspect",
        settings.aspect
      ),
      line(
        "qual",
        "Quality",
        displayQuality(
          settings.quality
        )
      ),
      line(
        "time",
        "Duration",
        `${settings.durationSeconds}s`
      ),
      line(
        "enh",
        "Enhance",
        boolState(
          settings.enhance
        )
      )
    ];

    if (!dev) {
      return (
        `${settingsTitle(false)}\n\n` +
        `<b>[CORE]</b>\n` +
        core.join("\n") +
        `\n\n<i>Inspect</i> · ` +
        `<code>/t2v set &lt;setting&gt;</code>`
      );
    }

    const advanced = [
      line(
        "fps",
        "FPS",
        String(settings.fps)
      ),
      line(
        "seed",
        "Stage 1 Seed",
        seedValue(settings.seed)
      ),
      line(
        "seed2",
        "Stage 2 Seed",
        seedValue(settings.seed2)
      ),
      line(
        "neg",
        "Negative Prompt",
        negativeState(settings)
      ),
      line(
        "mp",
        "Megapixels",
        effectiveMegapixels(
          settings
        ).toFixed(1)
      ),
      line(
        "samp",
        "Sampler",
        settings.sampler
      ),
      line(
        "cfg",
        "Guidance",
        settings.cfg.toFixed(1)
      )
    ];

    return (
      `${settingsTitle(true)}\n\n` +
      `<b>[CORE]</b>\n` +
      core.join("\n") +
      `\n\n<b>[ADVANCED]</b>\n` +
      advanced.join("\n") +
      `\n\n<i>Inspect</i> · ` +
      `<code>/t2v set --dev &lt;setting&gt;</code>`
    );
  }

  private invalidSettingHtml(
    dev: boolean
  ) {
    return (
      `${settingsTitle(dev)}\n\n` +
      `<b>Unknown setting.</b>\n` +
      (
        dev
          ? `<code>fps seed seed2 neg mp samp cfg</code>`
          : `<code>asp qual time enh</code>`
      )
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
            option =>
              `<code>${option.ratio}</code> · ${escapeHtml(option.label)}`
          ).join("\n");

        return (
          `${title("T2V · ASPECT")}\n\n` +
          `<b>Current</b> · <b>${escapeHtml(settings.aspect)}</b>\n\n` +
          `<b>Options</b>\n${options}\n\n` +
          `<b>Set</b>\n` +
          `<code>/t2v set asp &lt;ratio&gt;</code>`
        );
      }

      if (key === "qual") {
        return (
          `${title("T2V · QUALITY")}\n\n` +
          `<b>Current</b> · <b>${escapeHtml(displayQuality(settings.quality))}</b>\n\n` +
          `<b>Options</b>\n` +
          `<code>Low</code> · 0.5 MP\n` +
          `<code>Standard</code> · 0.9 MP\n` +
          `<code>High</code> · 1.2 MP\n\n` +
          `<b>Set</b>\n` +
          `<code>/t2v set qual &lt;value&gt;</code>`
        );
      }

      if (key === "time") {
        const frames =
          settings.durationSeconds *
          settings.fps +
          1;

        return (
          `${title("T2V · DURATION")}\n\n` +
          `<b>Current</b> · <b><i>${settings.durationSeconds}s</i></b>\n` +
          `<b>FPS</b> · <b>${settings.fps}</b>\n` +
          `<b>Frames</b> · <b>${frames}</b>\n` +
          `<b>Range</b> · <b>1–10s</b>\n\n` +
          `<b>Set</b>\n` +
          `<code>/t2v set time &lt;seconds&gt;</code>`
        );
      }

      return (
        `${title("T2V · ENHANCE")}\n\n` +
        `<b>Current</b> · <b>${boolState(settings.enhance)}</b>\n\n` +
        `<b>Options</b> · <code>on</code> / <code>off</code>\n\n` +
        `<b>Set</b>\n` +
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
        `${title("T2V DEV · FPS")}\n\n` +
        `<b>Current</b> · <b>${settings.fps}</b>\n` +
        `<b>Options</b> · <code>${FPS_OPTIONS.join(" / ")}</code>\n\n` +
        `<b>Set</b>\n` +
        `<code>/t2v set --dev fps &lt;value&gt;</code>`
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
        `${title(`T2V DEV · SEED ${stage}`)}\n\n` +
        `<b>Current</b> · <code>${escapeHtml(seedValue(current))}</code>\n` +
        `<b>Range</b> · <code>0-${Number.MAX_SAFE_INTEGER}</code>\n` +
        `<b>Special</b> · <code>random</code>\n` +
        (
          key === "seed"
            ? `<b>Alias</b> · <code>seed1</code>\n`
            : ""
        ) +
        `\n<b>Set</b>\n` +
        `<code>/t2v set --dev ${key} &lt;value&gt;</code>`
      );
    }

    if (key === "neg") {
      return (
        `${title("T2V DEV · NEGATIVE")}\n\n` +
        `<b>Current</b> · <b>${negativeState(settings)}</b>\n` +
        `<blockquote expandable>${escapeHtml(settings.negativePrompt)}</blockquote>\n` +
        `<b>Reset</b> · <code>default</code>\n\n` +
        `<b>Set</b>\n` +
        `<code>/t2v set --dev neg &lt;text&gt;</code>`
      );
    }

    if (key === "mp") {
      const mode =
        settings.megapixelsOverride ===
        null
          ? `Quality · ${displayQuality(settings.quality)}`
          : "Manual override";

      return (
        `${title("T2V DEV · MEGAPIXELS")}\n\n` +
        `<b>Current</b> · <b>${effectiveMegapixels(settings).toFixed(1)} MP</b>\n` +
        `<b>Mode</b> · <b>${escapeHtml(mode)}</b>\n` +
        `<b>Range</b> · <code>0.1-2.0</code> · step <code>0.1</code>\n` +
        `<b>Auto</b> · <code>default</code>\n\n` +
        `<b>Set</b>\n` +
        `<code>/t2v set --dev mp &lt;value&gt;</code>`
      );
    }

    if (key === "samp") {
      const options =
        await this.profile
          .samplerOptions();

      return (
        `${title("T2V DEV · SAMPLER")}\n\n` +
        `<b>Current</b> · <code>${escapeHtml(settings.sampler)}</code>\n` +
        `<b>Applies</b> · <b>Stage 1 + Stage 2</b>\n\n` +
        `<b>Options</b>\n` +
        options.map(
          option =>
            `<code>${escapeHtml(option)}</code>`
        ).join("\n") +
        `\n\n<b>Set</b>\n` +
        `<code>/t2v set --dev samp &lt;value&gt;</code>`
      );
    }

    return (
      `${title("T2V DEV · GUIDANCE")}\n\n` +
      `<b>Current</b> · <b>${settings.cfg.toFixed(1)}</b>\n` +
      `<b>Applies</b> · <b>Both stages · Video + Audio</b>\n` +
      `<b>Range</b> · <code>0-100</code> · step <code>0.1</code>\n\n` +
      `<b>Set</b>\n` +
      `<code>/t2v set --dev cfg &lt;value&gt;</code>`
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

      let label = rawKey;
      let value = rawValue;

      if (!dev) {
        switch (key) {
          case "asp":
            label = "Aspect";
            value = settings.aspect;
            break;
          case "qual":
            label = "Quality";
            value = displayQuality(
              settings.quality
            );
            break;
          case "time":
            label = "Duration";
            value = `${settings.durationSeconds}s`;
            break;
          case "enh":
            label = "Enhance";
            value = boolState(
              settings.enhance
            );
            break;
        }
      }
      else {
        switch (key) {
          case "fps":
            label = "FPS";
            value = String(
              settings.fps
            );
            break;
          case "seed":
            label = "Stage 1 Seed";
            value = seedValue(
              settings.seed
            );
            break;
          case "seed2":
            label = "Stage 2 Seed";
            value = seedValue(
              settings.seed2
            );
            break;
          case "neg":
            label = "Negative Prompt";
            value = negativeState(
              settings
            );
            break;
          case "mp":
            label = "Megapixels";
            value = `${effectiveMegapixels(settings).toFixed(1)} MP`;
            break;
          case "samp":
            label = "Sampler";
            value = settings.sampler;
            break;
          case "cfg":
            label = "Guidance";
            value = settings.cfg.toFixed(1);
            break;
        }
      }

      return (
        `${settingsTitle(dev)}\n\n` +
        `<b>${escapeHtml(label)}</b> · <b>${escapeHtml(value)}</b>\n\n` +
        `<b>[SAVED]</b>`
      );
    }
    catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return (
        `${settingsTitle(dev)}\n\n` +
        `<b>Invalid value.</b>\n` +
        `<i>${escapeHtml(message)}</i>\n\n` +
        `<b>Inspect</b> · ` +
        `<code>/t2v set ${dev ? "--dev " : ""}${escapeHtml(rawKey)}</code>`
      );
    }
  }
}
