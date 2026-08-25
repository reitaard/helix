import crypto from "node:crypto";

import {
  z
} from "zod";

export const T2I_PROFILE_ID = "leibovitz";
export const T2I_TOOL = "image.t2i";
export const T2I_MODEL = "FLUX.2 Klein 4B Distilled FP8";
export const T2I_WORKFLOW_VARIANT = "klein4b-distilled-fp8-v1";

export const T2I_ASPECT_OPTIONS = [
  { ratio: "1:1", label: "Square", width: 1024, height: 1024 },
  { ratio: "2:3", label: "Portrait", width: 832, height: 1248 },
  { ratio: "3:2", label: "Photo", width: 1248, height: 832 },
  { ratio: "4:5", label: "Post", width: 896, height: 1120 },
  { ratio: "5:4", label: "Landscape", width: 1120, height: 896 },
  { ratio: "9:16", label: "Full Screen", width: 720, height: 1280 },
  { ratio: "16:9", label: "Widescreen", width: 1280, height: 720 }
] as const;

export type T2IAspect =
  typeof T2I_ASPECT_OPTIONS[number]["ratio"];

const seedSchema = z.union([
  z.literal("random"),
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
]);

export const t2iSettingsSchema = z.object({
  aspect: z.enum(["1:1", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9"]),
  seed: seedSchema
});

export type T2ISettings = z.infer<typeof t2iSettingsSchema>;
export type ResolvedT2ISettings = Omit<T2ISettings, "seed"> & { seed: number };

export const DEFAULT_T2I_SETTINGS: T2ISettings = {
  aspect: "1:1",
  seed: "random"
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function dimensionsForT2IAspect(aspect: T2IAspect) {
  const option = T2I_ASPECT_OPTIONS.find(candidate => candidate.ratio === aspect);
  if (!option) throw new Error(`Unsupported T2I aspect: ${aspect}`);
  return { width: option.width, height: option.height };
}

function randomSafeSeed() {
  return Number(crypto.randomBytes(8).readBigUInt64BE() & ((1n << 53n) - 1n));
}

export function normalizeStoredT2ISettings(value: unknown): T2ISettings {
  return t2iSettingsSchema.parse({ ...DEFAULT_T2I_SETTINGS, ...asRecord(value) });
}

export function resolveT2ISettings(settings: T2ISettings): ResolvedT2ISettings {
  return {
    ...settings,
    seed: settings.seed === "random" ? randomSafeSeed() : settings.seed
  };
}

export function resolveStoredT2ISettings(value: unknown): ResolvedT2ISettings {
  const settings = t2iSettingsSchema.parse(value);
  if (settings.seed === "random") {
    throw new Error("T2I pending settings snapshot must contain a concrete seed");
  }
  return {
    aspect: settings.aspect,
    seed: settings.seed as number
  };
}
