import type {
  T2VSettings
} from "./settings.js";

export const T2V_MODES = [
  "manual",
  "fast",
  "quality"
] as const;

export type T2VMode =
  typeof T2V_MODES[number];

export const T2V_MODE_VERSION = 1;

const MODE_PATCHES:
  Record<
    T2VMode,
    Partial<T2VSettings>
  > = {
    manual: {},

    fast: {
      quality: "standard",
      durationSeconds: 5,
      fps: 24,
      megapixelsOverride: null
    },

    quality: {
      quality: "high",
      durationSeconds: 8,
      fps: 24,
      megapixelsOverride: null
    }
  };

export function normalizeT2VMode(
  value: unknown
): T2VMode {
  return T2V_MODES.includes(
    value as T2VMode
  )
    ? value as T2VMode
    : "manual";
}

export function displayT2VMode(
  mode: T2VMode
) {
  return (
    mode[0]!.toUpperCase() +
    mode.slice(1)
  );
}

export function resolveT2VMode(
  settings: T2VSettings,
  mode: T2VMode
): T2VSettings {
  return {
    ...settings,
    ...MODE_PATCHES[mode]
  };
}
