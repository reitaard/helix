import {
  T2V_MODE_VERSION,
  resolveT2VMode
} from "./mode.js";

import type {
  T2VMode
} from "./mode.js";

import {
  T2V_PROFILE_ID,
  T2V_TOOL
} from "./settings.js";

import type {
  T2VSettings
} from "./settings.js";

import {
  T2VSettingsRepository
} from "../repositories/t2v-settings-repository.js";

export class T2VModeService {
  constructor(
    private readonly settings:
      T2VSettingsRepository,

    private readonly profileId =
      T2V_PROFILE_ID
  ) {}

  get() {
    return this.settings.getMode(
      this.profileId,
      T2V_TOOL
    );
  }

  async set(
    mode: T2VMode
  ) {
    await this.settings.setMode(
      this.profileId,
      T2V_TOOL,
      mode
    );

    return mode;
  }

  async resolve(
    base: T2VSettings
  ) {
    const mode =
      await this.get();

    return {
      mode,
      version:
        T2V_MODE_VERSION,
      settings:
        resolveT2VMode(
          base,
          mode
        )
    };
  }
}
