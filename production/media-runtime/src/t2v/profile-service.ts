import {
  ASPECT_OPTIONS,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_T2V_SETTINGS,
  FPS_OPTIONS,
  T2V_PROFILE_ID,
  T2V_TOOL
} from "./settings.js";

import type {
  T2VSettings
} from "./settings.js";

import {
  T2VSettingsRepository
} from "../repositories/t2v-settings-repository.js";

export type T2VCoreSetting =
  | "asp"
  | "qual"
  | "time"
  | "enh";

export type T2VDevSetting =
  | "fps"
  | "seed"
  | "seed2"
  | "neg"
  | "mp"
  | "samp"
  | "cfg";

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as
    Record<string, unknown>;
}

function parseNumber(
  value: string
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function isStep(
  value: number,
  step: number
) {
  const scaled =
    value / step;

  return Math.abs(
    scaled -
    Math.round(scaled)
  ) < 1e-9;
}

export class T2VProfileService {
  private samplerCache:
    {
      values: string[];
      expiresAt: number;
    } |
    null =
      null;

  constructor(
    private readonly settings:
      T2VSettingsRepository,

    private readonly comfyEndpoint:
      string,

    private readonly profileId =
      T2V_PROFILE_ID
  ) {}

  get() {
    return this.settings.get(
      this.profileId,
      T2V_TOOL
    );
  }

  private save(
    settings: T2VSettings
  ) {
    return this.settings.save(
      this.profileId,
      T2V_TOOL,
      settings
    );
  }

  async setCore(
    key: T2VCoreSetting,
    rawValue: string,
    dev = false
  ) {
    const current =
      await this.get();

    const value =
      rawValue.trim();

    const lower =
      value.toLowerCase();

    const next:
      T2VSettings = {
        ...current
      };

    if (key === "asp") {
      const candidate =
        lower === "reset"
          ? DEFAULT_T2V_SETTINGS.aspect
          : ASPECT_OPTIONS.find(
              option =>
                option.ratio === value
            )?.ratio;

      if (!candidate) {
        throw new Error(
          "Invalid aspect ratio"
        );
      }

      next.aspect = candidate;
    }
    else if (key === "qual") {
      const candidate =
        lower === "reset"
          ? DEFAULT_T2V_SETTINGS.quality
          : lower;

      if (
        candidate !== "low" &&
        candidate !== "standard" &&
        candidate !== "high"
      ) {
        throw new Error(
          "Invalid quality preset"
        );
      }

      next.quality = candidate;
      next.megapixelsOverride =
        null;
    }
    else if (key === "time") {
      const candidate =
        lower === "reset"
          ? DEFAULT_T2V_SETTINGS.durationSeconds
          : parseNumber(value);

      if (
        candidate === null ||
        !Number.isInteger(candidate) ||
        candidate < 1 ||
        candidate > Number.MAX_SAFE_INTEGER ||
        (!dev && candidate > 10)
      ) {
        throw new Error(
          dev
            ? "Duration must be a positive whole number"
            : "Duration must be an integer from 1 to 10 seconds"
        );
      }

      next.durationSeconds =
        candidate;
    }
    else {
      const candidate =
        lower === "reset"
          ? DEFAULT_T2V_SETTINGS.enhance
          : lower === "on" ||
            lower === "true"
            ? true
            : lower === "off" ||
              lower === "false"
              ? false
              : null;

      if (candidate === null) {
        throw new Error(
          "Enhance must be on or off"
        );
      }

      next.enhance = candidate;
    }

    await this.save(next);
    return next;
  }

  async setDev(
    key: T2VDevSetting,
    rawValue: string
  ) {
    const current =
      await this.get();

    const value =
      rawValue.trim();

    const lower =
      value.toLowerCase();

    const next:
      T2VSettings = {
        ...current
      };

    if (key === "fps") {
      const candidate =
        lower === "reset"
          ? DEFAULT_T2V_SETTINGS.fps
          : parseNumber(value);

      if (
        candidate === null ||
        !FPS_OPTIONS.includes(
          candidate as
            typeof FPS_OPTIONS[number]
        )
      ) {
        throw new Error(
          "FPS must be 12, 24, or 30"
        );
      }

      next.fps = candidate as
        typeof FPS_OPTIONS[number];
    }
    else if (
      key === "seed" ||
      key === "seed2"
    ) {
      let candidate:
        number |
        "random";

      const defaultSeed =
        key === "seed"
          ? DEFAULT_T2V_SETTINGS.seed
          : DEFAULT_T2V_SETTINGS.seed2;

      if (lower === "reset") {
        candidate = defaultSeed;
      }
      else if (lower === "random") {
        candidate = "random";
      }
      else {
        const parsed =
          parseNumber(value);

        if (
          parsed === null ||
          !Number.isSafeInteger(parsed) ||
          parsed < 0
        ) {
          throw new Error(
            `Seed must be 0-${Number.MAX_SAFE_INTEGER} or random`
          );
        }

        candidate = parsed;
      }

      if (key === "seed") {
        next.seed = candidate;
      }
      else {
        next.seed2 = candidate;
      }
    }
    else if (key === "neg") {
      const candidate =
        lower === "reset" ||
        lower === "default"
          ? DEFAULT_NEGATIVE_PROMPT
          : value;

      if (candidate.length > 2000) {
        throw new Error(
          "Negative prompt is too long"
        );
      }

      next.negativePrompt =
        candidate;
    }
    else if (key === "mp") {
      if (
        lower === "reset" ||
        lower === "auto" ||
        lower === "default"
      ) {
        next.megapixelsOverride =
          null;
      }
      else {
        const candidate =
          parseNumber(value);

        if (
          candidate === null ||
          candidate < 0.1 ||
          candidate > 2 ||
          !isStep(candidate, 0.1)
        ) {
          throw new Error(
            "Megapixels must be 0.1-2.0 in 0.1 steps"
          );
        }

        next.megapixelsOverride =
          Math.round(
            candidate * 10
          ) / 10;
      }
    }
    else if (key === "samp") {
      const candidate =
        lower === "reset"
          ? DEFAULT_T2V_SETTINGS.sampler
          : value;

      const options =
        await this.samplerOptions();

      if (!options.includes(candidate)) {
        throw new Error(
          "Sampler is not available on the worker"
        );
      }

      next.sampler = candidate;
    }
    else {
      const candidate =
        lower === "reset"
          ? DEFAULT_T2V_SETTINGS.cfg
          : parseNumber(value);

      if (
        candidate === null ||
        candidate < 0 ||
        candidate > 100 ||
        !isStep(candidate, 0.1)
      ) {
        throw new Error(
          "Guidance must be 0-100 in 0.1 steps"
        );
      }

      next.cfg =
        Math.round(
          candidate * 10
        ) / 10;
    }

    await this.save(next);
    return next;
  }

  async samplerOptions() {
    if (
      this.samplerCache &&
      this.samplerCache.expiresAt >
        Date.now()
    ) {
      return this.samplerCache.values;
    }

    const response =
      await fetch(
        `${this.comfyEndpoint}/object_info/KSamplerSelect`,
        {
          signal:
            AbortSignal.timeout(10000)
        }
      );

    if (!response.ok) {
      throw new Error(
        `Comfy sampler options returned HTTP ${response.status}`
      );
    }

    const payload:
      unknown =
        await response.json();

    const root =
      asRecord(payload);

    const samplerNode =
      asRecord(
        root?.KSamplerSelect
      );

    const input =
      asRecord(
        samplerNode?.input
      );

    const required =
      asRecord(
        input?.required
      );

    const samplerName =
      required?.sampler_name;

    if (
      !Array.isArray(samplerName) ||
      samplerName.length < 2
    ) {
      throw new Error(
        "Comfy sampler options response is invalid"
      );
    }

    const meta =
      asRecord(
        samplerName[1]
      );

    const rawOptions =
      meta?.options;

    if (!Array.isArray(rawOptions)) {
      throw new Error(
        "Comfy sampler options are missing"
      );
    }

    const options =
      rawOptions.filter(
        (
          option
        ): option is string =>
          typeof option ===
          "string"
      );

    if (options.length === 0) {
      throw new Error(
        "Comfy returned no sampler options"
      );
    }

    this.samplerCache = {
      values: options,
      expiresAt:
        Date.now() +
        60_000
    };

    return options;
  }
}
