import {
  DEFAULT_T2I_SETTINGS,
  T2I_ASPECT_OPTIONS,
  T2I_PROFILE_ID,
  T2I_TOOL
} from "./settings.js";

import type {
  T2ISettings
} from "./settings.js";

import {
  T2ISettingsRepository
} from "../repositories/t2i-settings-repository.js";

export type T2ISetting =
  | "asp"
  | "seed";

export class T2IProfileService {
  constructor(
    private readonly settings:
      T2ISettingsRepository,

    private readonly profileId =
      T2I_PROFILE_ID
  ) {}

  get() {
    return this.settings.get(
      this.profileId,
      T2I_TOOL
    );
  }

  async set(
    key: T2ISetting,
    raw: string
  ): Promise<T2ISettings> {
    const current = await this.get();
    const value = raw.trim();
    const lower = value.toLowerCase();
    const next: T2ISettings = {
      ...current
    };

    if (key === "asp") {
      const aspect =
        lower === "reset"
          ? DEFAULT_T2I_SETTINGS.aspect
          : T2I_ASPECT_OPTIONS.find(
              option => option.ratio === value
            )?.ratio;

      if (!aspect) {
        throw new Error("Invalid aspect ratio");
      }

      next.aspect = aspect;
    }
    else if (lower === "reset") {
      next.seed = DEFAULT_T2I_SETTINGS.seed;
    }
    else if (lower === "random") {
      next.seed = "random";
    }
    else {
      const seed = Number(value);

      if (!Number.isSafeInteger(seed) || seed < 0) {
        throw new Error(
          `Seed must be 0-${Number.MAX_SAFE_INTEGER} or random`
        );
      }

      next.seed = seed;
    }

    await this.settings.save(
      this.profileId,
      T2I_TOOL,
      next
    );

    return next;
  }
}
