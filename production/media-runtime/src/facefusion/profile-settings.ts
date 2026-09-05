import { normalizeFaceFusionSettings, type FaceFusionSettings } from "./settings.js";

export const FACEFUSION_NORMAL_DURATION_DEFAULT = 60;
export const FACEFUSION_NORMAL_DURATION_MAX = 60;
export const FACEFUSION_DEV_DURATION_MAX = 3600;

export interface FaceFusionProfileSettings {
  generation: FaceFusionSettings;
  normalDurationSeconds: number;
  devDurationSeconds: number | null;
}

export interface FaceFusionSessionSettings extends FaceFusionProfileSettings {
  dev: boolean;
  target?: FaceFusionTargetMetadata;
}

export interface FaceFusionTargetMetadata {
  mediaKind: "image" | "video";
  width: number;
  height: number;
  durationSeconds: number | null;
}

export const DEFAULT_FACEFUSION_PROFILE_SETTINGS: FaceFusionProfileSettings = {
  generation: {}, normalDurationSeconds: FACEFUSION_NORMAL_DURATION_DEFAULT, devDurationSeconds: null
};

export function normalizeFaceFusionProfileSettings(value: unknown): FaceFusionProfileSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const normalized = normalizeFaceFusionSettings(input.generation);
  const generation: FaceFusionSettings = {
    ...(normalized.faceSelectorMode === "one" ? { faceSelectorMode: "one" as const } : {}),
    ...(normalized.weight !== undefined ? { weight: normalized.weight } : {}),
    ...(normalized.pixelBoost !== undefined ? { pixelBoost: normalized.pixelBoost } : {})
  };
  const normal = Number(input.normalDurationSeconds);
  const dev = Number(input.devDurationSeconds);
  return {
    generation,
    normalDurationSeconds: Number.isInteger(normal) && normal >= 1 && normal <= FACEFUSION_NORMAL_DURATION_MAX ? normal : FACEFUSION_NORMAL_DURATION_DEFAULT,
    devDurationSeconds: input.devDurationSeconds === null || input.devDurationSeconds === undefined
      ? null
      : Number.isInteger(dev) && dev >= 1 && dev <= FACEFUSION_DEV_DURATION_MAX ? dev : null
  };
}

export function normalizeFaceFusionSessionSettings(value: unknown): FaceFusionSessionSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const profile = normalizeFaceFusionProfileSettings(input);
  const target = input.target && typeof input.target === "object" && !Array.isArray(input.target)
    ? input.target as Record<string, unknown>
    : null;
  const width = Number(target?.width);
  const height = Number(target?.height);
  const duration = target?.durationSeconds === null ? null : Number(target?.durationSeconds);
  return {
    ...profile,
    dev: input.dev === true,
    ...(target && (target.mediaKind === "image" || target.mediaKind === "video") && Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 && (duration === null || Number.isFinite(duration) && duration > 0)
      ? { target: { mediaKind: target.mediaKind, width, height, durationSeconds: duration } }
      : {})
  };
}

export function faceFusionDurationLimit(settings: FaceFusionSessionSettings) {
  return settings.dev ? settings.devDurationSeconds ?? FACEFUSION_DEV_DURATION_MAX : settings.normalDurationSeconds;
}
